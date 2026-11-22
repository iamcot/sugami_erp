import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { Prisma } from '@sugami/db';
import { toSearchKey } from '@sugami/shared';
import { z } from 'zod';
import { RequirePermissions } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { PrismaService } from '../prisma/prisma.service.js';

const ListQuery = z.object({
  q: z.string().trim().max(64).optional(),
  group: z.string().trim().max(64).optional(),
  /** recent = last purchase, spent = KiotViet total sales, new = created in KiotViet. */
  sort: z.enum(['recent', 'spent', 'new', 'name']).default('recent'),
  hasOrders: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

const UpdateBody = z.object({
  name: z.string().trim().max(191).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  email: z.string().trim().max(191).nullable().optional(),
  addressLine: z.string().trim().max(500).nullable().optional(),
  region: z.string().trim().max(191).nullable().optional(),
  ward: z.string().trim().max(191).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
});

const CreateBody = UpdateBody.extend({
  name: z.string().trim().max(191).nullable().optional(),
}).refine((b) => b.name || b.phone, { message: 'Cần ít nhất tên hoặc số điện thoại' });

const ORDER_SORT: Record<string, Prisma.CustomerOrderByWithRelationInput[]> = {
  recent: [{ lastPurchaseAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
  spent: [{ kvTotalSales: 'desc' }, { id: 'desc' }],
  new: [{ kvCreatedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
  name: [{ name: 'asc' }, { id: 'asc' }],
};

@Controller('customers')
export class CustomersController {
  constructor(private readonly prisma: PrismaService) {}

  /** Orders stats per customer, cancelled orders excluded from the totals. */
  private async stats(ids: string[]) {
    if (!ids.length) return new Map<string, { orders: number; spent: number; lastOrderAt: Date | null }>();
    const rows = await this.prisma.client.order.groupBy({
      by: ['customerId'],
      where: { customerId: { in: ids }, status: { not: 'cancelled' } },
      _count: true,
      _sum: { total: true },
      _max: { orderedAt: true },
    });
    return new Map(
      rows.map((r) => [
        r.customerId!,
        { orders: r._count, spent: Number(r._sum.total ?? 0), lastOrderAt: r._max.orderedAt },
      ]),
    );
  }

  @Get()
  @RequirePermissions('customers.read')
  async list(@Query() rawQuery: unknown) {
    const q = parseInput(ListQuery, rawQuery);
    const key = q.q ? toSearchKey(q.q) : '';
    const where: Prisma.CustomerWhereInput = {
      ...(q.q
        ? {
            OR: [
              ...(key ? [{ searchKey: { contains: key } }] : []),
              { phone: { contains: q.q } },
              { kiotvietCode: { contains: q.q } },
              { orders: { some: { code: { contains: q.q } } } },
            ],
          }
        : {}),
      ...(q.group ? { tags: { array_contains: q.group } } : {}),
      ...(q.hasOrders ? { orders: q.hasOrders === 'true' ? { some: {} } : { none: {} } } : {}),
    };
    const db = this.prisma.client;
    const [rows, total] = await Promise.all([
      db.customer.findMany({
        where,
        orderBy: ORDER_SORT[q.sort],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.customer.count({ where }),
    ]);
    const stats = await this.stats(rows.map((r) => r.id));
    return {
      data: rows.map((c) => ({
        id: c.id,
        code: c.kiotvietCode,
        name: c.name,
        phone: c.phone,
        region: c.region,
        tags: (c.tags as string[] | null) ?? [],
        isActive: c.isActive,
        lastPurchaseAt: c.lastPurchaseAt?.toISOString() ?? null,
        kvTotalSales: Number(c.kvTotalSales),
        kvDebt: Number(c.kvDebt),
        orders: stats.get(c.id)?.orders ?? 0,
        spent: stats.get(c.id)?.spent ?? 0,
      })),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  /** Groups in use, for the filter. */
  @Get('groups')
  @RequirePermissions('customers.read')
  async groups() {
    const rows = await this.prisma.client.customer.findMany({
      where: { tags: { not: Prisma.DbNull } },
      select: { tags: true },
    });
    const count = new Map<string, number>();
    for (const r of rows) for (const g of (r.tags as string[]) ?? []) count.set(g, (count.get(g) ?? 0) + 1);
    return {
      data: [...count]
        .map(([name, customers]) => ({ name, customers }))
        .sort((a, b) => b.customers - a.customers),
    };
  }

  @Get(':code')
  @RequirePermissions('customers.read')
  async get(@Param('code') code: string) {
    const db = this.prisma.client;
    const c = await db.customer.findFirst({ where: { OR: [{ id: code }, { kiotvietCode: code }] } });
    if (!c) throw new NotFoundException('Không tìm thấy khách hàng');
    const [orders, stats] = await Promise.all([
      db.order.findMany({
        where: { customerId: c.id },
        orderBy: { orderedAt: 'desc' },
        take: 100,
        include: {
          channel: { select: { code: true, name: true } },
          lines: { select: { sku: true, name: true, qty: true }, orderBy: { sort: 'asc' } },
        },
      }),
      this.stats([c.id]),
    ]);
    const s = stats.get(c.id);
    return {
      customer: {
        id: c.id,
        code: c.kiotvietCode,
        name: c.name,
        phone: c.phone,
        email: c.email,
        gender: c.gender,
        birthday: c.birthday?.toISOString().slice(0, 10) ?? null,
        facebook: c.facebook,
        addressLine: c.addressLine,
        region: c.region,
        ward: c.ward,
        tags: (c.tags as string[] | null) ?? [],
        isActive: c.isActive,
        kvCreatedAt: c.kvCreatedAt?.toISOString() ?? null,
        lastPurchaseAt: c.lastPurchaseAt?.toISOString() ?? null,
        kvTotalSales: Number(c.kvTotalSales),
        kvDebt: Number(c.kvDebt),
      },
      stats: {
        orders: s?.orders ?? 0,
        spent: s?.spent ?? 0,
        lastOrderAt: s?.lastOrderAt?.toISOString() ?? null,
      },
      orders: orders.map((o) => ({
        id: o.id,
        code: o.code,
        channel: o.channel,
        status: o.status,
        total: Number(o.total),
        orderedAt: o.orderedAt.toISOString(),
        items: o.lines.map((l) => ({ sku: l.sku, name: l.name, qty: Number(l.qty) })),
      })),
    };
  }

  /** Create a customer by hand (e.g. from the sales screen). A customer with the same phone is returned as is. */
  @Post()
  @RequirePermissions('customers.write')
  async create(@Body() body: unknown) {
    const data = parseInput(CreateBody, body);
    const db = this.prisma.client;
    const phone = data.phone || null;
    const found = phone ? await db.customer.findFirst({ where: { phone } }) : null;
    const c =
      found ??
      (await db.customer.create({
        data: {
          name: data.name || null,
          phone,
          email: data.email || null,
          addressLine: data.addressLine || null,
          region: data.region || null,
          ward: data.ward || null,
          tags: data.tags ?? ['Bán trực tiếp'],
          searchKey: toSearchKey([data.name, phone].filter(Boolean).join(' ')).slice(0, 400),
        },
      }));
    return {
      existing: Boolean(found),
      customer: {
        id: c.id,
        code: c.kiotvietCode,
        name: c.name,
        phone: c.phone,
        email: c.email,
        addressLine: c.addressLine,
        region: c.region,
        ward: c.ward,
        kvDebt: Number(c.kvDebt),
      },
    };
  }

  /** Edit contact details by hand (a later import from KiotViet may overwrite them). */
  @Patch(':code')
  @RequirePermissions('customers.write')
  async update(@Param('code') code: string, @Body() body: unknown) {
    const data = parseInput(UpdateBody, body);
    const db = this.prisma.client;
    const c = await db.customer.findFirst({ where: { OR: [{ id: code }, { kiotvietCode: code }] } });
    if (!c) throw new NotFoundException('Không tìm thấy khách hàng');
    const name = data.name === undefined ? c.name : data.name || null;
    const phone = data.phone === undefined ? c.phone : data.phone || null;
    await db.customer.update({
      where: { id: c.id },
      data: {
        name,
        phone,
        ...(data.email !== undefined ? { email: data.email || null } : {}),
        ...(data.addressLine !== undefined ? { addressLine: data.addressLine || null } : {}),
        ...(data.region !== undefined ? { region: data.region || null } : {}),
        ...(data.ward !== undefined ? { ward: data.ward || null } : {}),
        ...(data.tags !== undefined ? { tags: data.tags } : {}),
        searchKey: toSearchKey([name, phone, c.kiotvietCode].filter(Boolean).join(' ')).slice(0, 400),
      },
    });
    return this.get(c.id);
  }
}
