import { Controller, Get, Query } from '@nestjs/common';
import { Prisma } from '@sugami/db';
import { toSearchKey } from '@sugami/shared';
import { z } from 'zod';
import { RequirePermissions } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { PrismaService } from '../prisma/prisma.service.js';

const ListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  view: z.enum(['all', 'in', 'out', 'negative', 'low']).default('all'),
  sort: z.enum(['sku', 'name', 'stock', 'value']).default('sku'),
  dir: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
});

const SORT: Record<z.infer<typeof ListQuery>['sort'], Prisma.Sql> = {
  sku: Prisma.sql`v.sku`,
  name: Prisma.sql`p.name`,
  stock: Prisma.sql`on_hand`,
  value: Prisma.sql`stock_value`,
};
const VIEW: Record<z.infer<typeof ListQuery>['view'], Prisma.Sql> = {
  all: Prisma.empty,
  in: Prisma.sql`HAVING on_hand > 0`,
  out: Prisma.sql`HAVING on_hand <= 0`,
  negative: Prisma.sql`HAVING on_hand < 0`,
  low: Prisma.sql`HAVING v.min_stock > 0 AND on_hand <= v.min_stock`,
};

interface Row {
  id: string;
  sku: string;
  option_values: unknown;
  min_stock: Prisma.Decimal | string;
  cost_avg: bigint;
  product_code: string;
  product_name: string;
  on_hand: Prisma.Decimal | string;
  stock_value: Prisma.Decimal | string | bigint;
}
const n = (v: unknown) => Number(v ?? 0);

/** Stock per SKU × warehouse. Archived products (fee lines) are left out. */
@Controller('inventory')
export class InventoryController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('inventory.read')
  async list(@Query() rawQuery: unknown) {
    const q = parseInput(ListQuery, rawQuery);
    const conds: Prisma.Sql[] = [Prisma.sql`p.status <> 'archived'`];
    if (q.q) {
      conds.push(Prisma.sql`(p.search_key LIKE ${`%${toSearchKey(q.q)}%`} OR v.sku LIKE ${`%${q.q}%`} OR v.barcode = ${q.q})`);
    }
    const base = Prisma.sql`
      SELECT v.id, v.sku, v.option_values, v.min_stock, v.cost_avg, p.code AS product_code, p.name AS product_name,
             COALESCE(SUM(sl.on_hand), 0) AS on_hand,
             GREATEST(COALESCE(SUM(sl.on_hand), 0), 0) * v.cost_avg AS stock_value
      FROM variants v
      JOIN products p ON p.id = v.product_id
      LEFT JOIN stock_levels sl ON sl.variant_id = v.id
      WHERE ${Prisma.join(conds, ' AND ')}
      GROUP BY v.id
      ${VIEW[q.view]}`;
    const dir = q.dir === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    const db = this.prisma.client;
    const [rows, totals, warehouses] = await Promise.all([
      db.$queryRaw<Row[]>`${base} ORDER BY ${SORT[q.sort]} ${dir}, v.sku ASC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
      db.$queryRaw<Record<string, unknown>[]>`
        SELECT COUNT(*) AS skus, COALESCE(SUM(GREATEST(on_hand, 0)), 0) AS units, COALESCE(SUM(stock_value), 0) AS value,
               COALESCE(SUM(on_hand < 0), 0) AS negative, COALESCE(SUM(on_hand <= 0), 0) AS \`out\`
        FROM (${base}) t`,
      db.warehouse.findMany({ where: { isActive: true }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true } }),
    ]);
    const levels = rows.length
      ? await db.stockLevel.findMany({ where: { variantId: { in: rows.map((r) => r.id) } }, select: { variantId: true, warehouseId: true, onHand: true } })
      : [];
    const byVariant = new Map<string, Record<string, number>>();
    const whCode = new Map(warehouses.map((w) => [w.id, w.code]));
    for (const l of levels) {
      const m = byVariant.get(l.variantId) ?? {};
      m[whCode.get(l.warehouseId) ?? l.warehouseId] = Number(l.onHand);
      byVariant.set(l.variantId, m);
    }
    const t = totals[0] ?? {};
    return {
      warehouses: warehouses.map((w) => ({ code: w.code, name: w.name })),
      data: rows.map((r) => ({
        id: r.id,
        sku: r.sku,
        productCode: r.product_code,
        productName: r.product_name,
        optionValues: r.option_values,
        minStock: n(r.min_stock),
        costAvg: n(r.cost_avg),
        onHand: n(r.on_hand),
        value: n(r.stock_value),
        byWarehouse: byVariant.get(r.id) ?? {},
      })),
      total: n(t.skus),
      totals: { units: n(t.units), value: n(t.value), negative: n(t.negative), out: n(t.out) },
      page: q.page,
      pageSize: q.pageSize,
    };
  }
}
