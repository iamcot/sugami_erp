import { Controller, Get, Query } from '@nestjs/common';
import { Prisma } from '@sugami/db';
import { z } from 'zod';
import { RequirePermissions } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DAY = 86_400_000;
const VN = 7 * 3_600_000;
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');

const Query_ = z.object({
  /** Vietnam calendar dates, both inclusive. */
  from: ymd,
  to: ymd,
  by: z.enum(['month', 'channel', 'product', 'sku']).default('month'),
});

const n = (v: unknown) => Number(v ?? 0);
/** 00:00 Vietnam time of a YYYY-MM-DD date, as a UTC instant. */
const vnStart = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - VN);

interface Row {
  key: string;
  label: string;
  sub: string | null;
  orders: unknown;
  units: unknown;
  revenue: unknown;
  cost: unknown;
  missing: unknown;
}

/**
 * Gross profit = line revenue - cost of goods. Cost is the average cost recorded on the line when it was
 * sold; lines without one fall back to the variant's current average cost (counted as "estimated").
 * Cancelled and returned orders are left out. Marketplace fees are per order, so they are shown only
 * where a group is made of whole orders (month, channel).
 */
@Controller('reports')
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('profit')
  @RequirePermissions('orders.read')
  async profit(@Query() raw: unknown) {
    const q = parseInput(Query_, raw);
    const db = this.prisma.client;
    const from = vnStart(q.from);
    const to = new Date(vnStart(q.to).getTime() + DAY);
    const key =
      q.by === 'month'
        ? {
            k: Prisma.sql`DATE_FORMAT(DATE_ADD(o.ordered_at, INTERVAL 7 HOUR), '%Y-%m')`,
            l: Prisma.sql`DATE_FORMAT(DATE_ADD(o.ordered_at, INTERVAL 7 HOUR), '%m/%Y')`,
            s: Prisma.sql`NULL`,
          }
        : q.by === 'channel'
          ? { k: Prisma.sql`c.code`, l: Prisma.sql`c.name`, s: Prisma.sql`NULL` }
          : q.by === 'product'
            ? { k: Prisma.sql`p.code`, l: Prisma.sql`p.name`, s: Prisma.sql`p.code` }
            : {
                k: Prisma.sql`COALESCE(v.sku, l.sku)`,
                l: Prisma.sql`COALESCE(p.name, l.name)`,
                s: Prisma.sql`COALESCE(v.sku, l.sku)`,
              };

    const base = Prisma.sql`
      FROM order_lines l
      JOIN orders o ON o.id = l.order_id
      JOIN channels c ON c.id = o.channel_id
      LEFT JOIN variants v ON v.id = l.variant_id
      LEFT JOIN products p ON p.id = v.product_id
      WHERE o.status NOT IN ('cancelled', 'returned') AND o.ordered_at >= ${from} AND o.ordered_at < ${to}`;
    const unitCost = Prisma.sql`COALESCE(NULLIF(l.cost_snapshot, 0), v.cost_avg, 0)`;
    const measures = Prisma.sql`
      COUNT(DISTINCT o.id) AS orders, COALESCE(SUM(l.qty), 0) AS units,
      COALESCE(SUM(l.line_total), 0) AS revenue, COALESCE(SUM(l.qty * ${unitCost}), 0) AS cost,
      COALESCE(SUM(${unitCost} = 0), 0) AS missing`;

    const [rows, totals, fees] = await Promise.all([
      db.$queryRaw<Row[]>`
        SELECT ${key.k} AS \`key\`, ${key.l} AS label, ${key.s} AS sub, ${measures} ${base}
        GROUP BY ${q.by === 'month' || q.by === 'channel' ? Prisma.sql`${key.k}, ${key.l}` : Prisma.sql`${key.k}, ${key.l}, ${key.s}`}
        ORDER BY ${q.by === 'month' ? Prisma.sql`\`key\` DESC` : Prisma.sql`(SUM(l.line_total) - SUM(l.qty * ${unitCost})) DESC`}
        LIMIT 300`,
      db.$queryRaw<Omit<Row, 'key' | 'label' | 'sub'>[]>`SELECT ${measures} ${base}`,
      q.by === 'month' || q.by === 'channel'
        ? db.$queryRaw<{ key: string; fee: unknown }[]>`
            SELECT ${q.by === 'month' ? Prisma.sql`DATE_FORMAT(DATE_ADD(o.ordered_at, INTERVAL 7 HOUR), '%Y-%m')` : Prisma.sql`c.code`} AS \`key\`,
                   COALESCE(SUM(o.platform_fee), 0) AS fee
            FROM orders o JOIN channels c ON c.id = o.channel_id
            WHERE o.status NOT IN ('cancelled', 'returned') AND o.ordered_at >= ${from} AND o.ordered_at < ${to}
            GROUP BY \`key\``
        : Promise.resolve(null),
    ]);
    const feeOf = fees ? new Map(fees.map((f) => [f.key, n(f.fee)])) : null;
    const shape = (r: Pick<Row, 'orders' | 'units' | 'revenue' | 'cost' | 'missing'>, fee: number | null) => {
      const revenue = n(r.revenue);
      const profit = revenue - n(r.cost);
      return {
        orders: n(r.orders),
        units: n(r.units),
        revenue,
        cost: n(r.cost),
        profit,
        margin: revenue > 0 ? profit / revenue : null,
        estimated: n(r.missing),
        platformFee: fee,
        profitAfterFees: fee === null ? null : profit - fee,
      };
    };
    const totalFee = feeOf ? [...feeOf.values()].reduce((a, b) => a + b, 0) : null;
    return {
      from: q.from,
      to: q.to,
      by: q.by,
      total: shape(totals[0] ?? { orders: 0, units: 0, revenue: 0, cost: 0, missing: 0 }, totalFee),
      rows: rows.map((r) => ({
        key: r.key,
        label: r.label,
        sub: r.sub,
        ...shape(r, feeOf ? (feeOf.get(r.key) ?? 0) : null),
      })),
    };
  }
}
