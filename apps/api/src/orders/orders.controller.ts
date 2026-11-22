import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import type { OrderStatus, Prisma } from '@sugami/db';
import { z } from 'zod';
import { RequirePermissions } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { PrismaService } from '../prisma/prisma.service.js';

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
  status: z.enum(STATUSES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

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
      ...(q.status ? { status: q.status as OrderStatus } : {}),
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
          customer: { select: { kiotvietCode: true, name: true, phone: true } },
          lines: { select: { sku: true, name: true, qty: true }, orderBy: { sort: 'asc' } },
        },
      }),
      db.order.count({ where }),
      db.order.aggregate({
        where: { ...where, status: q.status ?? { not: 'cancelled' } },
        _sum: { total: true },
        _count: true,
      }),
    ]);
    return {
      data: orders.map((o) => ({
        id: o.id,
        code: o.code,
        externalCode: o.externalCode,
        channel: o.channel,
        customer: o.customer
          ? { code: o.customer.kiotvietCode, name: o.customer.name, phone: o.customer.phone }
          : null,
        status: o.status,
        shippingStatus: o.shippingStatus,
        carrier: o.carrier,
        trackingNo: o.trackingNo,
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
    return {
      order: {
        ...o,
        subtotal: Number(o.subtotal),
        discount: Number(o.discount),
        otherIncome: Number(o.otherIncome),
        total: Number(o.total),
        paidAmount: Number(o.paidAmount),
        codAmount: Number(o.codAmount),
        shippingFee: Number(o.shippingFee),
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
