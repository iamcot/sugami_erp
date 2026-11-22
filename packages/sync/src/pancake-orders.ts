import type { ExternalOrder, ExternalProduct } from '@sugami/channels-core';
import { toSearchKey } from '@sugami/shared';
import { learnSkuMap, lineKey, loadSkuMap, pairLines } from './sku-map.js';
import { applyMovements, type MovementInput, Prisma, type PrismaClient, withLedgerTx } from '@sugami/db';

export const PANCAKE_ORDER_CURSOR = 'pancake:orders';

const CHANNELS: Record<string, { type: 'shopee' | 'tiktok'; name: string }> = {
  shopee: { type: 'shopee', name: 'Shopee' },
  tiktok: { type: 'tiktok', name: 'TikTok Shop' },
};
/** Re-read this much before the cursor: Pancake's updated_at window is not exact. */
const OVERLAP_MS = 10 * 60 * 1000;
const CHUNK = 400;
const WINDOW_MS = 30 * 86_400_000;
const NEW_ORDERS_KEPT = 50;

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
  /** Orders already imported from KiotViet: kept as they are (status, stock); Pancake adds carrier, tracking and buyer, and applies cancellations. */
  keptFromKiotViet: number;
  /** Orders from KiotViet that gained carrier, tracking number or buyer from Pancake. */
  enriched: number;
  stock: { applied: number; beforeSnapshot: number; reversed: number };
  /** Customers created from order buyers (nickname) and orders attached to a customer. */
  customers: { created: number; linked: number };
  unknownSkus: string[];
  /** Order lines with no SKU: the listing is not linked to a Pancake product, so no stock is deducted. */
  unlinkedLines: number;
  /** Orders Pancake created earlier that were duplicates of a KiotViet invoice: removed (stock given back). */
  duplicatesMerged: number;
  /** Marketplace codes learned from orders that exist in KiotViet too (code → Sugami variant). */
  skuMap: { learned: number; conflicts: number; ambiguous: number };
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
    enriched: 0,
    stock: { applied: 0, beforeSnapshot: 0, reversed: 0 },
    customers: { created: 0, linked: 0 },
    unknownSkus: [],
    unlinkedLines: 0,
    duplicatesMerged: 0,
    skuMap: { learned: 0, conflicts: 0, ambiguous: 0 },
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

  // Lines Pancake could not link get their SKU from codes learned earlier (marketplace code → variant).
  const lineKeys = [
    ...new Set(
      wanted.flatMap((o) =>
        o.lines
          .filter((l) => !l.sku)
          .map((l) => lineKey(l.name))
          .filter((k): k is string => !!k),
      ),
    ),
  ];
  const skuMap = await loadSkuMap(db, lineKeys);
  if (skuMap.size) {
    const mapped = await db.variant.findMany({
      where: { id: { in: [...new Set(skuMap.values())] } },
      select: { id: true, sku: true },
    });
    const skuById = new Map(mapped.map((v) => [v.id, v.sku]));
    for (const o of wanted)
      for (const l of o.lines) {
        const k = !l.sku ? lineKey(l.name) : undefined;
        const sku = k ? skuById.get(skuMap.get(k) ?? '') : undefined;
        if (sku) l.sku = sku;
      }
  }

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
        include: {
          lines: true,
          channel: { select: { code: true } },
          customer: { select: { id: true, externalKey: true, name: true } },
        },
      }),
    )),
    ...(await findMany(
      wanted.map((o) => o.code),
      (chunk) =>
        db.order.findMany({
          where: { code: { in: chunk } },
          include: {
            lines: true,
            channel: { select: { code: true } },
            customer: { select: { id: true, externalKey: true, name: true } },
          },
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

  /** Lines of an active order whose SKU is known and whose sale is after the SKU's opening stock snapshot. */
  const linesToApply = (o: ExternalOrder) =>
    isActive(o.status)
      ? o.lines.filter((l) => {
          const v = variantBySku.get(l.sku);
          const at = v && snapshotAt.get(v.id);
          return Boolean(at && o.orderedAt > at);
        })
      : [];
  const lineSig = (xs: { sku: string; qty: number }[]) =>
    xs
      .map((x) => `${x.sku}:${x.qty}`)
      .sort()
      .join('|');

  const handle = async (o: ExternalOrder): Promise<void> => {
    for (const l of o.lines) {
      if (!l.sku) summary.unlinkedLines++;
      else if (!variantBySku.has(l.sku)) unknown.add(l.sku);
    }
    const prev =
      (o.marketplaceCode ? byMarketplace.get(`${o.saleChannel}:${o.marketplaceCode}`) : undefined) ??
      byCode.get(o.code);
    const fields = {
      status: o.status as Prisma.OrderCreateInput['status'],
      total: big(o.total),
      shippingFee: big(o.shippingFee ?? 0),
      carrier: o.carrier?.slice(0, 255) ?? null,
      trackingNo: o.trackingNo?.slice(0, 255) ?? null,
      externalCode: o.marketplaceCode ?? null,
      shipByAt: o.shipByAt ?? null,
      shipAddress: o.shipAddress?.slice(0, 500) ?? null,
      shipPhone: o.shipPhone?.slice(0, 32) ?? null,
      shipProvince: o.shipProvince?.slice(0, 128) ?? null,
      platformFee: big(o.platformFee ?? 0),
      feeDetail: o.feeDetail ?? Prisma.DbNull,
      completedAt: o.status === 'completed' || o.status === 'delivered' ? o.orderedAt : null,
    };

    if (!prev) {
      const toApply = linesToApply(o);
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
    // An order Pancake created before the KiotViet invoice was imported (their numbers did not match yet)
    // is a duplicate of that invoice: give its stock back and drop it; the KiotViet order stays.
    const twin = fromKiotViet ? byCode.get(o.code) : undefined;
    if (twin && twin.id !== prev.id && twin.kiotvietInvoiceCode === null) {
      summary.duplicatesMerged++;
      if (!opts.dryRun) {
        await withLedgerTx(db, async (tx) => {
          if (twin.stockAppliedAt !== null) {
            const moved = await tx.stockMovement.findMany({
              where: { refType: 'order', refId: twin.id, type: 'sale_out' },
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
                refId: twin.id,
                note: `Gộp đơn trùng ${o.code} với ${prev.code}`,
              })),
            );
          }
          await tx.order.delete({ where: { id: twin.id } });
        });
      }
    }
    // The same order on both sides tells which Sugami variant a marketplace code stands for.
    const unlinked = o.lines
      .filter((l) => !l.externalVariantId)
      .map((l) => ({ key: lineKey(l.name), quantity: l.quantity }))
      .filter((l): l is { key: string; quantity: number } => !!l.key);
    const knownLines = prev.lines
      .filter((l) => l.variantId)
      .map((l) => ({ variantId: l.variantId!, quantity: Number(l.qty) }));
    if (unlinked.length && knownLines.length) {
      const { pairs, ambiguous } = pairLines(unlinked, knownLines);
      summary.skuMap.ambiguous += ambiguous;
      const r = await learnSkuMap(db, pairs, skuMap, opts.dryRun);
      summary.skuMap.learned += r.learned;
      summary.skuMap.conflicts += r.conflicts;
    }
    const cancelNow = o.status === 'cancelled' && prev.status !== 'cancelled';
    if (fromKiotViet) {
      // KiotViet's status and stock stay as they are; Pancake adds what KiotViet does not have.
      const patch: Prisma.OrderUncheckedUpdateInput = {};
      if (fields.carrier && fields.carrier !== prev.carrier) patch.carrier = fields.carrier;
      if (fields.trackingNo && fields.trackingNo !== prev.trackingNo) patch.trackingNo = fields.trackingNo;
      if (fields.shipByAt && fields.shipByAt.getTime() !== prev.shipByAt?.getTime())
        patch.shipByAt = fields.shipByAt;
      if (fields.shipAddress && fields.shipAddress !== prev.shipAddress)
        patch.shipAddress = fields.shipAddress;
      if (fields.shipPhone && fields.shipPhone !== prev.shipPhone) patch.shipPhone = fields.shipPhone;
      if (fields.shipProvince && fields.shipProvince !== prev.shipProvince)
        patch.shipProvince = fields.shipProvince;
      if (fields.platformFee > 0n && fields.platformFee !== prev.platformFee) {
        patch.platformFee = fields.platformFee;
        patch.feeDetail = fields.feeDetail;
      }
      const key = keyOf(o);
      let enrichedCustomer = false;
      if (o.customer && key) {
        const c = prev.customer;
        if (!c) {
          const buyerId = await customerId(o);
          if (buyerId) patch.customerId = buyerId;
          enrichedCustomer = true;
        } else if (!c.externalKey && !customerByKey.has(key)) {
          // A KiotViet customer (KHSPE...) learns its Shopee nickname.
          summary.customers.linked++;
          enrichedCustomer = true;
          customerByKey.set(key, c.id);
          if (!opts.dryRun)
            await db.customer.update({
              where: { id: c.id },
              data: {
                externalKey: key,
                ...(!c.name || c.name.includes('*')
                  ? {
                      name: o.customer.name.slice(0, 191),
                      searchKey: toSearchKey(o.customer.name).slice(0, 400),
                    }
                  : {}),
              },
            });
        }
      }
      if (Object.keys(patch).length || enrichedCustomer) {
        summary.enriched++;
        if (!opts.dryRun && Object.keys(patch).length)
          await db.order.update({ where: { id: prev.id }, data: patch });
      } else if (!cancelNow) {
        summary.keptFromKiotViet++;
      }
      if (!cancelNow) return;
    }
    // A Pancake order without a customer yet gets its buyer.
    if (!fromKiotViet && prev.customerId === null && o.customer) {
      const buyerId = await customerId(o);
      if (buyerId && !opts.dryRun)
        await db.order.update({ where: { id: prev.id }, data: { customerId: buyerId } });
    }
    // An order Pancake owns can have its products replaced there (e.g. an unlinked line swapped for a
    // product with our SKU): then the lines and their stock effect are redone.
    const relines =
      !fromKiotViet &&
      lineSig(prev.lines.map((l) => ({ sku: l.sku, qty: Number(l.qty) }))) !==
        lineSig(o.lines.map((l) => ({ sku: l.sku.slice(0, 64), qty: l.quantity })));
    const changed =
      relines ||
      prev.status !== fields.status ||
      prev.total !== fields.total ||
      prev.shippingFee !== fields.shippingFee ||
      prev.carrier !== fields.carrier ||
      prev.trackingNo !== fields.trackingNo ||
      prev.shipByAt?.getTime() !== fields.shipByAt?.getTime() ||
      (!fromKiotViet && prev.externalCode !== fields.externalCode) ||
      prev.shipAddress !== fields.shipAddress ||
      prev.shipPhone !== fields.shipPhone ||
      prev.shipProvince !== fields.shipProvince ||
      prev.platformFee !== fields.platformFee;
    if (!changed) {
      summary.unchanged++;
      return;
    }
    summary.updated++;
    const reverse = (o.status === 'cancelled' || relines) && prev.stockAppliedAt !== null;
    if (reverse) summary.stock.reversed += prev.lines.filter((l) => l.variantId).length;
    const reApply = relines ? linesToApply(o) : [];
    if (relines) summary.stock.applied += reApply.length;
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
            note: relines && o.status !== 'cancelled' ? `Đổi sản phẩm đơn ${o.code}` : `Hủy đơn ${o.code}`,
          })),
        );
      }
      if (relines) {
        await tx.orderLine.deleteMany({ where: { orderId: prev.id } });
        await tx.orderLine.createMany({
          data: o.lines.map((l, i) => {
            const v = variantBySku.get(l.sku);
            return {
              orderId: prev.id,
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
        });
        await applyMovements(
          tx,
          reApply.map((l) => ({
            warehouseId: opts.warehouseId,
            variantId: variantBySku.get(l.sku)!.id,
            qtyDelta: -l.quantity,
            type: 'sale_out' as const,
            refType: 'order',
            refId: prev.id,
            note: `Pancake ${o.code}`,
            occurredAt: o.orderedAt,
          })),
        );
      }
      await tx.order.update({
        where: { id: prev.id },
        data: fromKiotViet
          ? { status: fields.status, stockAppliedAt: reverse ? null : prev.stockAppliedAt }
          : {
              ...fields,
              ...(relines
                ? { stockAppliedAt: reApply.length ? new Date() : null }
                : reverse
                  ? { stockAppliedAt: null }
                  : {}),
            },
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

function mergeSummaries(a: OrderSyncSummary, b: OrderSyncSummary): OrderSyncSummary {
  return {
    dryRun: a.dryRun,
    fetched: a.fetched + b.fetched,
    skipped: {
      currency: a.skipped.currency + b.skipped.currency,
      channel: a.skipped.channel + b.skipped.channel,
    },
    created: a.created + b.created,
    updated: a.updated + b.updated,
    unchanged: a.unchanged + b.unchanged,
    keptFromKiotViet: a.keptFromKiotViet + b.keptFromKiotViet,
    enriched: a.enriched + b.enriched,
    stock: {
      applied: a.stock.applied + b.stock.applied,
      beforeSnapshot: a.stock.beforeSnapshot + b.stock.beforeSnapshot,
      reversed: a.stock.reversed + b.stock.reversed,
    },
    customers: {
      created: a.customers.created + b.customers.created,
      linked: a.customers.linked + b.customers.linked,
    },
    unknownSkus: [...new Set([...a.unknownSkus, ...b.unknownSkus])].sort(),
    unlinkedLines: a.unlinkedLines + b.unlinkedLines,
    duplicatesMerged: a.duplicatesMerged + b.duplicatesMerged,
    skuMap: {
      learned: a.skuMap.learned + b.skuMap.learned,
      conflicts: a.skuMap.conflicts + b.skuMap.conflicts,
      ambiguous: a.skuMap.ambiguous + b.skuMap.ambiguous,
    },
    newOrders: [...a.newOrders, ...b.newOrders].slice(0, NEW_ORDERS_KEPT),
    errors: [...a.errors, ...b.errors],
  };
}

async function findMany<K, T>(keys: K[], fn: (chunk: K[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < keys.length; i += CHUNK) out.push(...(await fn(keys.slice(i, i + CHUNK))));
  return out;
}

export interface PancakeSource {
  pullOrders(since?: Date, until?: Date): AsyncIterable<ExternalOrder>;
  pullProducts(since?: Date): AsyncIterable<ExternalProduct>;
}

export interface RunOptions {
  warehouseCode?: string;
  dryRun?: boolean;
  /** First run only: how far back to look (default 14 days). */
  sinceDays?: number;
  /** Look back `sinceDays` ignoring the saved cursor, to update older orders. */
  ignoreCursor?: boolean;
  /** Fixed date range (history backfill): ignores the cursor and leaves it where it is. */
  range?: { from: Date; to: Date };
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
  const since = opts.range
    ? opts.range.from
    : saved && !opts.ignoreCursor
      ? new Date(saved.cursor.getTime() - OVERLAP_MS)
      : new Date(startedAt.getTime() - (opts.sinceDays ?? 14) * 86_400_000);

  // A long look-back (history backfill) is pulled and applied one month at a time, so memory and
  // each Pancake request stay small; a short window is a single pass as before.
  const end = opts.range?.to ?? startedAt;
  const windows: { from: Date; to?: Date }[] = [];
  for (let from = since; ;) {
    const next = new Date(from.getTime() + WINDOW_MS);
    if (next >= end || end.getTime() - since.getTime() <= WINDOW_MS * 1.5) {
      windows.push({ from, to: opts.range ? end : undefined });
      break;
    }
    windows.push({ from, to: next });
    from = next;
  }

  let skuByVariationId: Map<string, string> | undefined;
  const loadSkus = async () => {
    const m = new Map<string, string>();
    for await (const p of source.pullProducts()) for (const v of p.variants) m.set(v.externalId, v.sku);
    return m;
  };
  let summary: OrderSyncSummary | undefined;
  for (const w of windows) {
    const orders: ExternalOrder[] = [];
    for await (const o of source.pullOrders(w.from, w.to)) orders.push(o);
    if (orders.length) skuByVariationId ??= await loadSkus();
    const part = await syncPancakeOrders(db, orders, {
      warehouseId: warehouse.id,
      dryRun: opts.dryRun ?? false,
      skuByVariationId,
    });
    summary = summary ? mergeSummaries(summary, part) : part;
  }
  summary ??= await syncPancakeOrders(db, [], { warehouseId: warehouse.id, dryRun: opts.dryRun ?? false });
  if (!opts.range && !summary.dryRun && summary.errors.length === 0) {
    await db.syncCursor.upsert({
      where: { key: PANCAKE_ORDER_CURSOR },
      create: { key: PANCAKE_ORDER_CURSOR, cursor: startedAt },
      update: { cursor: startedAt },
    });
  }
  return { ...summary, since };
}
