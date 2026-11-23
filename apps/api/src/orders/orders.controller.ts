import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { OrderStatus, Prisma } from '@sugami/db';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { completeOrders, planComplete } from './order-bulk.js';
import { handleReturn, ReturnError, writeOffReturn } from './order-returns.js';

const STATUSES = [
  'new',
  'confirmed',
  'packing',
  'shipped',
  'delivered',
  'completed',
  'cancelled',
  'returned',
] as const;
const ListQuery = z.object({
  q: z.string().trim().max(64).optional(),
  channel: z.string().trim().max(32).optional(),
  /** Where the order was created: pos (counter), pancake, kiotviet_excel. */
  source: z.string().trim().max(32).optional(),
  status: z.enum(STATUSES).optional(),
  group: z.enum(['waiting', 'shipping', 'done', 'returned', 'return_pending', 'other']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** Status groups of the orders list: waiting to pack, shipping, finished, returned, other (cancelled). */
const GROUPS: Record<string, OrderStatus[]> = {
  waiting: ['new', 'confirmed', 'packing'],
  shipping: ['shipped'],
  done: ['delivered', 'completed'],
  returned: ['returned'],
  other: ['cancelled'],
};

/** Filter for a status group; return_pending = returned parcels the shop has not checked yet. */
const groupWhere = (group: string): Prisma.OrderWhereInput =>
  group === 'return_pending'
    ? { status: 'returned', returnHandledAt: null }
    : { status: { in: GROUPS[group] } };

const ReturnBody = z.object({ restock: z.boolean() });
const BulkBody = z.object({ codes: z.array(z.string().trim().min(1).max(64)).min(1).max(200) });

@Controller('orders')
export class OrdersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('orders.read')
  async list(@Query() rawQuery: unknown) {
    const q = parseInput(ListQuery, rawQuery);
    const where: Prisma.OrderWhereInput = {
      ...(q.q
        ? {
            OR: [
              { code: { contains: q.q } },
              { externalCode: { contains: q.q } },
              { trackingNo: { contains: q.q } },
              { customer: { OR: [{ phone: { contains: q.q } }, { kiotvietCode: { contains: q.q } }] } },
              { lines: { some: { sku: { contains: q.q } } } },
            ],
          }
        : {}),
      ...(q.channel ? { channel: { code: q.channel } } : {}),
      ...(q.source ? { source: q.source } : {}),
      ...(q.status ? { status: q.status as OrderStatus } : {}),
      ...(q.group ? groupWhere(q.group) : {}),
      ...(q.from || q.to
        ? { orderedAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lt: q.to } : {}) } }
        : {}),
    };
    const db = this.prisma.client;
    const [orders, total, sums] = await Promise.all([
      db.order.findMany({
        where,
        orderBy: { orderedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          channel: { select: { code: true, name: true } },
          customer: {
            select: { id: true, kiotvietCode: true, name: true, phone: true, addressLine: true },
          },
          lines: { select: { sku: true, name: true, qty: true }, orderBy: { sort: 'asc' } },
        },
      }),
      db.order.count({ where }),
      db.order.aggregate({
        where: q.status || q.group ? where : { ...where, status: { not: 'cancelled' } },
        _sum: { total: true },
        _count: true,
      }),
    ]);
    return {
      data: orders.map((o) => ({
        id: o.id,
        code: o.code,
        source: o.source,
        externalCode: o.externalCode,
        channel: o.channel,
        customer: o.customer
          ? {
              id: o.customer.id,
              code: o.customer.kiotvietCode,
              name: o.customer.name,
              phone: o.customer.phone,
              addressLine: o.customer.addressLine,
            }
          : null,
        status: o.status,
        shippingStatus: o.shippingStatus,
        carrier: o.carrier,
        trackingNo: o.trackingNo,
        trackingUrl: o.trackingUrl,
        shipByAt: o.shipByAt?.toISOString() ?? null,
        shipAddress: o.shipAddress,
        shipPhone: o.shipPhone,
        shipProvince: o.shipProvince,
        note: o.internalNote,
        returnHandledAt: o.returnHandledAt?.toISOString() ?? null,
        updatedAt: o.updatedAt.toISOString(),
        total: Number(o.total),
        orderedAt: o.orderedAt.toISOString(),
        items: o.lines.map((l) => ({ sku: l.sku, name: l.name, qty: Number(l.qty) })),
      })),
      page: q.page,
      pageSize: q.pageSize,
      total,
      /** Revenue of matching orders, cancelled excluded unless filtering by status. */
      revenue: Number(sums._sum.total ?? 0),
      revenueOrders: sums._count,
    };
  }

  /** Numbers for the side menu: what still needs the shop's hands. */
  @Get('counts')
  @RequirePermissions('orders.read')
  async counts() {
    const db = this.prisma.client;
    const waiting = { status: { in: GROUPS.waiting } };
    const [waitingCount, shipping, returnPending, byChannel] = await Promise.all([
      db.order.count({ where: waiting }),
      db.order.count({ where: { status: 'shipped' } }),
      db.order.count({ where: groupWhere('return_pending') }),
      db.order.groupBy({ by: ['channelId'], where: waiting, _count: true }),
    ]);
    const channels = await db.channel.findMany({
      where: { id: { in: byChannel.map((c) => c.channelId) } },
      select: { id: true, code: true },
    });
    const code = new Map(channels.map((c) => [c.id, c.code]));
    const waitingByChannel: Record<string, number> = {};
    for (const c of byChannel) {
      const k = code.get(c.channelId) ?? 'other';
      waitingByChannel[k] = (waitingByChannel[k] ?? 0) + c._count;
    }
    return { waiting: waitingCount, shipping, returnPending, waitingByChannel };
  }

  /** What a bulk complete would do: which orders take stock, which only change status, which are skipped. */
  @Post('bulk/complete/preview')
  @HttpCode(200)
  @RequirePermissions('orders.write')
  async bulkCompletePreview(@Body() raw: unknown) {
    return planComplete(this.prisma.client, parseInput(BulkBody, raw).codes);
  }

  /** Force selected orders to completed (already delivered but never moved along). */
  @Post('bulk/complete')
  @HttpCode(200)
  @RequirePermissions('orders.write', 'inventory.write')
  async bulkComplete(@Body() raw: unknown, @CurrentUser() user: AuthUser) {
    const b = parseInput(BulkBody, raw);
    return completeOrders(this.prisma.client, b.codes, user.id);
  }

  /** Close a returned parcel: put the goods back in stock, or write them off. */
  @Post(':code/return')
  @HttpCode(200)
  @RequirePermissions('orders.write', 'inventory.write')
  async handleReturn(@Param('code') code: string, @Body() raw: unknown, @CurrentUser() user: AuthUser) {
    const b = parseInput(ReturnBody, raw);
    try {
      return await handleReturn(this.prisma.client, code, b.restock, user.id);
    } catch (err) {
      if (err instanceof ReturnError) throw new HttpException({ message: err.message }, err.status);
      throw err;
    }
  }

  /** A returned parcel that came back damaged or lost: take its goods out of stock again. */
  @Post(':code/return-damage')
  @HttpCode(200)
  @RequirePermissions('orders.write', 'inventory.write')
  async returnDamage(@Param('code') code: string, @CurrentUser() user: AuthUser) {
    try {
      return await writeOffReturn(this.prisma.client, code, user.id);
    } catch (err) {
      if (err instanceof ReturnError) throw new HttpException({ message: err.message }, err.status);
      throw err;
    }
  }

  @Get(':code')
  @RequirePermissions('orders.read')
  async get(@Param('code') code: string) {
    const o = await this.prisma.client.order.findFirst({
      where: { OR: [{ id: code }, { code }] },
      include: {
        channel: true,
        customer: { select: { id: true, kiotvietCode: true, name: true, phone: true } },
        lines: { orderBy: { sort: 'asc' } },
      },
    });
    if (!o) throw new NotFoundException('Không tìm thấy đơn');
    const returnDamaged =
      o.status === 'returned' &&
      (await this.prisma.client.stockMovement.count({
        where: { refType: 'order', refId: o.id, type: 'damage' },
      })) > 0;
    return {
      order: {
        ...o,
        returnDamaged,
        subtotal: Number(o.subtotal),
        discount: Number(o.discount),
        otherIncome: Number(o.otherIncome),
        total: Number(o.total),
        paidAmount: Number(o.paidAmount),
        codAmount: Number(o.codAmount),
        shippingFee: Number(o.shippingFee),
        shippingFeeCharged: Number(o.shippingFeeCharged),
        platformFee: Number(o.platformFee),
        lines: o.lines.map((l) => ({
          ...l,
          qty: Number(l.qty),
          unitPrice: Number(l.unitPrice),
          discount: Number(l.discount),
          price: Number(l.price),
          lineTotal: Number(l.lineTotal),
          costSnapshot: l.costSnapshot === null ? null : Number(l.costSnapshot),
        })),
      },
    };
  }
}
