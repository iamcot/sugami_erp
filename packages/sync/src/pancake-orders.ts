import type { ExternalOrder, ExternalProduct } from '@sugami/channels-core';
import { toSearchKey } from '@sugami/shared';
import { applyMovements, type MovementInput, Prisma, type PrismaClient, withLedgerTx } from '@sugami/db';

export const PANCAKE_ORDER_CURSOR = 'pancake:orders';

const CHANNELS: Record<string, { type: 'shopee' | 'tiktok'; name: string }> = {
  shopee: { type: 'shopee', name: 'Shopee' },
  tiktok: { type: 'tiktok', name: 'TikTok Shop' },
};
/** Re-read this much before the cursor: Pancake's updated_at window is not exact. */
const OVERLAP_MS = 10 * 60 * 1000;
const CHUNK = 400;

export interface OrderSyncOptions {
  warehouseId: string;
  dryRun: boolean;
  /** Pancake variation id → SKU (seller code), to resolve order lines. */
  skuByVariationId?: Map<string, string>;
}

export interface NewOrder {
  code: string;
  channel: string;
  total: number;
  orderedAt: Date;
}

export interface OrderSyncSummary {
  dryRun: boolean;
  fetched: number;
  /** Not synced: other currency (Shopee MY/PH) or a channel other than Shopee/TikTok. */
  skipped: { currency: number; channel: number };
  created: number;
  updated: number;
  unchanged: number;
  /** Orders that KiotViet already imported: Pancake only cancels them, nothing else changes. */
  keptFromKiotViet: number;
  stock: { applied: number; beforeSnapshot: number; reversed: number };
  /** Customers created from order buyers (nickname) and orders attached to a customer. */
  customers: { created: number; linked: number };
  unknownSkus: string[];
  newOrders: NewOrder[];
  /** Orders that failed; the cursor does not move while there are any. */
  errors: { code: string; message: string }[];
}

const big = (n: number) => BigInt(Math.round(n));
const isActive = (status: string) => status !== 'cancelled' && status !== 'returned';

/**
 * Apply Pancake orders to Sugami orders. Idempotent: an order is matched by marketplace order number
 * (so an order KiotViet already imported is not created twice) or by its Pancake code.
 * Stock follows the same rule as the KiotViet import: a line deducts stock only if the sale is after
 * the SKU's opening stock snapshot; a cancelled order gives back what it took.
 */
export async function syncPancakeOrders(
  db: PrismaClient,
  orders: ExternalOrder[],
  opts: OrderSyncOptions,
): Promise<OrderSyncSummary> {
  const summary: OrderSyncSummary = {
    dryRun: opts.dryRun,
    fetched: orders.length,
    skipped: { currency: 0, channel: 0 },
    created: 0,
    updated: 0,
    unchanged: 0,
    keptFromKiotViet: 0,
    stock: { applied: 0, beforeSnapshot: 0, reversed: 0 },
    customers: { created: 0, linked: 0 },
    unknownSkus: [],
    newOrders: [],
    errors: [],
  };
  const wanted: ExternalOrder[] = [];
  for (const o of orders) {
    if (o.currency && o.currency !== 'VND') summary.skipped.currency++;
    else if (!o.saleChannel || !CHANNELS[o.saleChannel]) summary.skipped.channel++;
    else
      wanted.push({
        ...o,
        lines: o.lines.map((l) => ({
          ...l,
          sku: (l.externalVariantId && opts.skuByVariationId?.get(l.externalVariantId)) || l.sku,
        })),
      });
  }
  if (!wanted.length) return summary;

  const skus = [...new Set(wanted.flatMap((o) => o.lines.map((l) => l.sku)))];
  const variants = await findMany(skus, (chunk) =>
    db.variant.findMany({ where: { sku: { in: chunk } }, select: { id: true, sku: true, costAvg: true } }),
  );
  const variantBySku = new Map(variants.map((v) => [v.sku, v]));
  const openings = await db.stockMovement.groupBy({
    by: ['variantId'],
    where: {
      warehouseId: opts.warehouseId,
      type: { in: ['kiotviet_import', 'opening'] },
      variantId: { in: variants.map((v) => v.id) },
    },
    _min: { occurredAt: true },
  });
  const snapshotAt = new Map(openings.map((o) => [o.variantId, o._min.occurredAt]));

  const marketplaceCodes = wanted.map((o) => o.marketplaceCode).filter((c): c is string => !!c);
  const existing = [
    ...(await findMany(marketplaceCodes, (chunk) =>
      db.order.findMany({
        where: { externalCode: { in: chunk } },
        include: { lines: true, channel: { select: { code: true } } },
      }),
    )),
    ...(await findMany(
      wanted.map((o) => o.code),
      (chunk) =>
        db.order.findMany({
          where: { code: { in: chunk } },
          include: { lines: true, channel: { select: { code: true } } },
        }),
    )),
  ];
  const byMarketplace = new Map(
    existing.filter((o) => o.externalCode).map((o) => [`${o.channel.code}:${o.externalCode}`, o]),
  );
  const byCode = new Map(existing.map((o) => [o.code, o]));

  const channels = new Map((await db.channel.findMany()).map((c) => [c.code, c]));
  const channelId = async (code: string) => {
    let ch = channels.get(code);
    if (!ch && !opts.dryRun) {
      ch = await db.channel.create({ data: { code, ...CHANNELS[code]! } });
      channels.set(code, ch);
    }
    return ch?.id ?? `dry:${code}`;
  };
  const unknown = new Set<string>();

  // Buyers: customers are keyed by sales channel + nickname ("shopee:candy532").
  const keyOf = (o: ExternalOrder) =>
    o.customer ? `${o.saleChannel}:${o.customer.name.toLowerCase()}`.slice(0, 191) : null;
  const keys = [...new Set(wanted.map(keyOf).filter((k): k is string => !!k))];
  const customerByKey = new Map<string, string>(
    (
      await findMany(keys, (chunk) =>
        db.customer.findMany({
          where: { externalKey: { in: chunk } },
          select: { id: true, externalKey: true },
        }),
      )
    ).map((c) => [c.externalKey!, c.id]),
  );
  /** Customer id for the order's buyer, created if new (a placeholder id in a preview). */
  const customerId = async (o: ExternalOrder): Promise<string | null> => {
    const key = keyOf(o);
    if (!key || !o.customer) return null;
    let id = customerByKey.get(key);
    if (!id) {
      summary.customers.created++;
      id = opts.dryRun
        ? `dry:${key}`
        : (
            await db.customer.create({
              data: {
                externalKey: key,
                name: o.customer.name.slice(0, 191),
                searchKey: toSearchKey([o.customer.name, o.customer.phone].filter(Boolean).join(' ')).slice(
                  0,
                  400,
                ),
                phone: o.customer.phone?.slice(0, 32) ?? null,
                tags: [CHANNELS[o.saleChannel!]?.name ?? o.saleChannel!],
                kvCreatedAt: null,
              },
            })
          ).id;
      customerByKey.set(key, id);
    }
    summary.customers.linked++;
    return id;
  };

  const handle = async (o: ExternalOrder): Promise<void> => {
    for (const l of o.lines) if (!variantBySku.has(l.sku)) unknown.add(l.sku);
    const prev =
      (o.marketplaceCode ? byMarketplace.get(`${o.saleChannel}:${o.marketplaceCode}`) : undefined) ??
      byCode.get(o.code);
    const fields = {
      status: o.status as Prisma.OrderCreateInput['status'],
      total: big(o.total),
      shippingFee: big(o.shippingFee ?? 0),
      completedAt: o.status === 'completed' || o.status === 'delivered' ? o.orderedAt : null,
    };

    if (!prev) {
      const toApply = isActive(o.status)
        ? o.lines.filter((l) => {
            const v = variantBySku.get(l.sku);
            const at = v && snapshotAt.get(v.id);
            return Boolean(at && o.orderedAt > at);
          })
        : [];
      summary.created++;
      summary.stock.applied += toApply.length;
      if (isActive(o.status))
        summary.stock.beforeSnapshot +=
          o.lines.filter((l) => variantBySku.has(l.sku)).length - toApply.length;
      summary.newOrders.push({
        code: o.code,
        channel: o.saleChannel!,
        total: o.total,
        orderedAt: o.orderedAt,
      });
      if (opts.dryRun) return;
      const chId = await channelId(o.saleChannel!);
      const buyerId = await customerId(o);
      await withLedgerTx(db, async (tx) => {
        const order = await tx.order.create({
          data: {
            code: o.code,
            channelId: chId,
            externalCode: o.marketplaceCode ?? null,
            customerId: buyerId,
            warehouseId: opts.warehouseId,
            orderedAt: o.orderedAt,
            source: 'pancake',
            ...fields,
            subtotal: big(o.lines.reduce((a, l) => a + l.unitPrice * l.quantity, 0)),
            stockAppliedAt: toApply.length ? new Date() : null,
            lines: {
              create: o.lines.map((l, i) => {
                const v = variantBySku.get(l.sku);
                return {
                  variantId: v?.id ?? null,
                  sku: l.sku.slice(0, 64),
                  name: l.name.slice(0, 255),
                  qty: new Prisma.Decimal(l.quantity),
                  unitPrice: big(l.unitPrice),
                  discount: 0n,
                  price: big(l.unitPrice),
                  lineTotal: big(l.unitPrice * l.quantity),
                  costSnapshot: v?.costAvg ?? null,
                  sort: i,
                };
              }),
            },
          },
        });
        const moves: MovementInput[] = toApply.map((l) => ({
          warehouseId: opts.warehouseId,
          variantId: variantBySku.get(l.sku)!.id,
          qtyDelta: -l.quantity,
          type: 'sale_out',
          refType: 'order',
          refId: order.id,
          note: `Pancake ${o.code}`,
          occurredAt: o.orderedAt,
        }));
        await applyMovements(tx, moves);
      });
      return;
    }

    // Order already known. One imported from KiotViet keeps KiotViet's data; only a cancellation is applied.
    const fromKiotViet = prev.kiotvietInvoiceCode !== null;
    const cancelNow = o.status === 'cancelled' && prev.status !== 'cancelled';
    if (fromKiotViet && !cancelNow) {
      summary.keptFromKiotViet++;
      return;
    }
    // A Pancake order without a customer yet gets its buyer.
    if (!fromKiotViet && prev.customerId === null && o.customer) {
      const buyerId = await customerId(o);
      if (buyerId && !opts.dryRun)
        await db.order.update({ where: { id: prev.id }, data: { customerId: buyerId } });
    }
    const changed =
      prev.status !== fields.status || prev.total !== fields.total || prev.shippingFee !== fields.shippingFee;
    if (!changed) {
      summary.unchanged++;
      return;
    }
    summary.updated++;
    const reverse = o.status === 'cancelled' && prev.stockAppliedAt !== null;
    if (reverse) summary.stock.reversed += prev.lines.filter((l) => l.variantId).length;
    if (opts.dryRun) return;
    await withLedgerTx(db, async (tx) => {
      if (reverse) {
        const moved = await tx.stockMovement.findMany({
          where: { refType: 'order', refId: prev.id, type: 'sale_out' },
          select: { variantId: true, qtyDelta: true },
        });
        await applyMovements(
          tx,
          moved.map((m) => ({
            warehouseId: opts.warehouseId,
            variantId: m.variantId,
            qtyDelta: m.qtyDelta.neg(),
            type: 'return_in' as const,
            refType: 'order',
            refId: prev.id,
            note: `Hủy đơn ${o.code}`,
          })),
        );
      }
      await tx.order.update({
        where: { id: prev.id },
        data: fromKiotViet
          ? { status: fields.status, stockAppliedAt: reverse ? null : prev.stockAppliedAt }
          : { ...fields, ...(reverse ? { stockAppliedAt: null } : {}) },
      });
    });
  };
  for (const o of wanted) {
    try {
      await handle(o);
    } catch (err) {
      summary.errors.push({ code: o.code, message: err instanceof Error ? err.message : String(err) });
    }
  }
  summary.unknownSkus = [...unknown].sort();
  return summary;
}

async function findMany<K, T>(keys: K[], fn: (chunk: K[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < keys.length; i += CHUNK) out.push(...(await fn(keys.slice(i, i + CHUNK))));
  return out;
}

export interface PancakeSource {
  pullOrders(since?: Date): AsyncIterable<ExternalOrder>;
  pullProducts(since?: Date): AsyncIterable<ExternalProduct>;
}

export interface RunOptions {
  warehouseCode?: string;
  dryRun?: boolean;
  /** First run only: how far back to look (default 14 days). */
  sinceDays?: number;
  /** Preview only: look back `sinceDays` ignoring the saved cursor. Never moves the cursor. */
  ignoreCursor?: boolean;
  now?: () => Date;
}

/**
 * One sync pass: pull orders changed since the saved cursor (minus a safety overlap) and apply them.
 * The cursor moves only after a successful, non-preview pass, so a crash or an outage means the next
 * pass simply covers the gap: nothing is lost when the machine was off.
 */
export async function runPancakeOrderSync(
  db: PrismaClient,
  source: PancakeSource,
  opts: RunOptions = {},
): Promise<OrderSyncSummary & { since: Date }> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now();
  const warehouse = await db.warehouse.findUnique({ where: { code: opts.warehouseCode ?? 'KHO-CHINH' } });
  if (!warehouse) throw new Error(`Không có kho ${opts.warehouseCode ?? 'KHO-CHINH'}`);
  const saved = await db.syncCursor.findUnique({ where: { key: PANCAKE_ORDER_CURSOR } });
  const since =
    saved && !opts.ignoreCursor
      ? new Date(saved.cursor.getTime() - OVERLAP_MS)
      : new Date(startedAt.getTime() - (opts.sinceDays ?? 14) * 86_400_000);

  const orders: ExternalOrder[] = [];
  for await (const o of source.pullOrders(since)) orders.push(o);

  const skuByVariationId = new Map<string, string>();
  if (orders.length) {
    for await (const p of source.pullProducts())
      for (const v of p.variants) skuByVariationId.set(v.externalId, v.sku);
  }
  const summary = await syncPancakeOrders(db, orders, {
    warehouseId: warehouse.id,
    dryRun: opts.ignoreCursor ? true : (opts.dryRun ?? false),
    skuByVariationId,
  });
  if (!summary.dryRun && summary.errors.length === 0) {
    await db.syncCursor.upsert({
      where: { key: PANCAKE_ORDER_CURSOR },
      create: { key: PANCAKE_ORDER_CURSOR, cursor: startedAt },
      update: { cursor: startedAt },
    });
  }
  return { ...summary, since };
}
