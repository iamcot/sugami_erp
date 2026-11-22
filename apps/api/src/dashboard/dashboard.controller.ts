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

    const [orders, margin, stock, todo, lastImport, health] = await Promise.all([
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
      this.healthCounts(d30),
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
      health,
      lastInvoiceImport: lastImport
        ? {
            importedAt: lastImport.createdAt.toISOString(),
            latestOrderAt: lastImport.orderedAt.toISOString(),
          }
        : null,
    };
  }

  /** Plain counts behind the "Sức khỏe shop" card; the page decides tone and wording. */
  private async healthCounts(since: Date) {
    const db = this.prisma.client;
    const [row, cursors] = await Promise.all([
      db.$queryRaw<Record<string, unknown>[]>`
        SELECT
          (SELECT COUNT(*) FROM order_lines l JOIN orders o ON o.id = l.order_id
            WHERE l.variant_id IS NULL AND o.status NOT IN ('cancelled', 'returned') AND o.ordered_at >= ${since}) AS unlinked_lines,
          (SELECT COUNT(*) FROM variants v JOIN products p ON p.id = v.product_id AND p.status = 'active'
            WHERE NOT EXISTS (SELECT 1 FROM external_refs r WHERE r.provider = 'pancake' AND r.entity_type = 'variant' AND r.entity_id = v.id)) AS not_on_pancake,
          (SELECT COUNT(*) FROM channel_listing_variants WHERE variant_id IS NULL) AS listing_unlinked,
          (SELECT COUNT(*) FROM channel_listing_variants WHERE linked_by = 'unresolved') AS listing_unresolved,
          (SELECT COUNT(*) FROM products p WHERE p.status = 'active'
            AND NOT EXISTS (SELECT 1 FROM product_media m WHERE m.product_id = p.id)) AS no_image,
          (SELECT COUNT(*) FROM (SELECT v.id FROM variants v JOIN products p ON p.id = v.product_id AND p.status = 'active'
            LEFT JOIN stock_levels sl ON sl.variant_id = v.id WHERE v.cost_avg = 0 GROUP BY v.id HAVING COALESCE(SUM(sl.on_hand), 0) > 0) c) AS zero_cost`,
      db.syncCursor.findMany({
        where: { key: { in: ['pancake:orders', 'pancake:stock-push:on', 'pancake:stock-push:last'] } },
      }),
    ]);
    const r = row[0] ?? {};
    const at = (k: string) => cursors.find((c) => c.key === k)?.cursor.toISOString() ?? null;
    return {
      unlinkedLines: n(r.unlinked_lines),
      notOnPancake: n(r.not_on_pancake),
      listingUnlinked: n(r.listing_unlinked),
      listingUnresolved: n(r.listing_unresolved),
      noImage: n(r.no_image),
      zeroCost: n(r.zero_cost),
      ordersSyncedAt: at('pancake:orders'),
      stockPushOn: at('pancake:stock-push:on') !== null,
      stockPushAt: at('pancake:stock-push:last'),
    };
  }
}
