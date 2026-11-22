import { Controller, Get } from '@nestjs/common';
import type { Prisma } from '@sugami/db';
import { RequirePermissions } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DAY = 86_400_000;
const VN = 7 * 3_600_000;
/** Start of the Vietnam calendar day containing `t`, as a UTC instant. */
export const vnDayStart = (t: Date) => new Date(Math.floor((t.getTime() + VN) / DAY) * DAY - VN);
const vnDateKey = (t: Date) => new Date(t.getTime() + VN).toISOString().slice(0, 10);

const n = (v: unknown) => Number(v ?? 0);

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  /** Sales, margin, stock value and to-dos for the home screen. Days are Vietnam calendar days. */
  @Get()
  @RequirePermissions('orders.read')
  async get() {
    const db = this.prisma.client;
    const now = new Date();
    const today = vnDayStart(now);
    const days = 14;
    const from = new Date(today.getTime() - (days - 1) * DAY);
    const d30 = new Date(today.getTime() - 29 * DAY);
    const active: Prisma.OrderWhereInput = { status: { notIn: ['cancelled', 'returned'] } };

    const [orders, margin, stock, todo, lastImport] = await Promise.all([
      db.order.findMany({
        where: { ...active, orderedAt: { gte: d30 < from ? d30 : from } },
        select: { orderedAt: true, total: true, channel: { select: { code: true } } },
      }),
      db.$queryRaw<{ revenue: unknown; cost: unknown; missing: unknown }[]>`
        SELECT COALESCE(SUM(l.line_total), 0) AS revenue,
               COALESCE(SUM(l.qty * COALESCE(l.cost_snapshot, 0)), 0) AS cost,
               COALESCE(SUM(l.cost_snapshot IS NULL OR l.cost_snapshot = 0), 0) AS missing
        FROM order_lines l JOIN orders o ON o.id = l.order_id
        WHERE o.status NOT IN ('cancelled', 'returned') AND o.ordered_at >= ${d30}`,
      db.$queryRaw<{ value: unknown; units: unknown }[]>`
        SELECT COALESCE(SUM(GREATEST(t.on_hand, 0) * t.cost_avg), 0) AS value, COALESCE(SUM(GREATEST(t.on_hand, 0)), 0) AS units
        FROM (SELECT v.cost_avg, COALESCE(SUM(sl.on_hand), 0) AS on_hand
              FROM variants v JOIN products p ON p.id = v.product_id AND p.status <> 'archived'
              LEFT JOIN stock_levels sl ON sl.variant_id = v.id GROUP BY v.id) t`,
      db.$queryRaw<{ negative: unknown; out_active: unknown; zero_price: unknown }[]>`
        SELECT COALESCE(SUM(t.on_hand < 0), 0) AS negative,
               COALESCE(SUM(t.on_hand = 0 AND t.status = 'active'), 0) AS out_active,
               COALESCE(SUM(t.price = 0), 0) AS zero_price
        FROM (SELECT v.price, p.status, COALESCE(SUM(sl.on_hand), 0) AS on_hand
              FROM variants v JOIN products p ON p.id = v.product_id AND p.status <> 'archived'
              LEFT JOIN stock_levels sl ON sl.variant_id = v.id GROUP BY v.id) t`,
      db.order.findFirst({
        where: { source: 'kiotviet_excel' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, orderedAt: true },
      }),
    ]);

    const sum = (since: Date) => {
      const list = orders.filter((o) => o.orderedAt >= since);
      return { orders: list.length, revenue: list.reduce((a, o) => a + Number(o.total), 0) };
    };
    const series = Array.from({ length: days }, (_, i) => {
      const d = new Date(from.getTime() + i * DAY);
      return { date: vnDateKey(d), byChannel: {} as Record<string, number>, orders: 0 };
    });
    const idx = new Map(series.map((s, i) => [s.date, i]));
    for (const o of orders) {
      const i = idx.get(vnDateKey(o.orderedAt));
      if (i === undefined) continue;
      const s = series[i]!;
      s.orders++;
      s.byChannel[o.channel.code] = (s.byChannel[o.channel.code] ?? 0) + Number(o.total);
    }
    const m = margin[0];
    const t = todo[0];
    return {
      today: sum(today),
      last7: sum(new Date(today.getTime() - 6 * DAY)),
      last30: sum(d30),
      grossMargin30: {
        revenue: n(m?.revenue),
        cost: n(m?.cost),
        profit: n(m?.revenue) - n(m?.cost),
        linesWithoutCost: n(m?.missing),
      },
      stock: { value: n(stock[0]?.value), units: n(stock[0]?.units) },
      series,
      todo: { negativeSkus: n(t?.negative), outOfStockActive: n(t?.out_active), zeroPrice: n(t?.zero_price) },
      lastInvoiceImport: lastImport
        ? {
            importedAt: lastImport.createdAt.toISOString(),
            latestOrderAt: lastImport.orderedAt.toISOString(),
          }
        : null,
    };
  }
}
