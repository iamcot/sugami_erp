import type { PrismaClient } from '@sugami/db';
import { PANCAKE_ORDER_CURSOR } from './pancake-orders.js';

/** Row exists = automatic stock push is on (so a missing row is the safe default: off). */
export const STOCK_PUSH_ON = 'pancake:stock-push:on';
/** When the automatic push last ran a pass. */
export const STOCK_PUSH_LAST = 'pancake:stock-push:last';
/** Stock is pushed only when the order sync has pulled everything up to about now. */
const ORDERS_FRESH_MS = 20 * 60_000;
/** Open delivery orders at the counter set stock aside (same rule as the counter page). */
const HOLDING = ['new', 'confirmed', 'packing'];

export interface StockIO {
  /** Set the real inventory of a Pancake variation (in the shop's Pancake warehouse). */
  setStock(variationId: string, qty: number): Promise<void>;
}

export interface StockRef {
  variantId: string;
  variationId: string;
  /** Last quantity we pushed, as text. */
  hash: string | null;
}

export interface StockPushItem {
  variantId: string;
  sku: string;
  variationId: string;
  qty: number;
  previous: string | null;
}

/** What can be sold now: stock on the shelf minus what open counter deliveries have set aside, never below 0. */
export async function sellableByVariant(
  db: PrismaClient,
  warehouseId: string,
  variantIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < variantIds.length; i += 500) {
    const ids = variantIds.slice(i, i + 500);
    const levels = await db.stockLevel.findMany({
      where: { warehouseId, variantId: { in: ids } },
      select: { variantId: true, onHand: true },
    });
    const held = await db.orderLine.groupBy({
      by: ['variantId'],
      where: {
        variantId: { in: ids },
        order: { source: 'pos', warehouseId, stockAppliedAt: null, status: { in: HOLDING as never[] } },
      },
      _sum: { qty: true },
    });
    const onHand = new Map(levels.map((l) => [l.variantId, Number(l.onHand)]));
    const reserved = new Map(held.map((h) => [h.variantId!, Number(h._sum.qty ?? 0)]));
    for (const id of ids)
      out.set(id, Math.max(0, Math.floor((onHand.get(id) ?? 0) - (reserved.get(id) ?? 0))));
  }
  return out;
}

/** Refs whose last pushed number differs from what is sellable now. */
export function selectChanged(
  refs: StockRef[],
  sellable: Map<string, number>,
): (StockRef & { qty: number })[] {
  const out: (StockRef & { qty: number })[] = [];
  for (const r of refs) {
    const qty = sellable.get(r.variantId) ?? 0;
    if (r.hash !== String(qty)) out.push({ ...r, qty });
  }
  return out;
}

async function loadRefs(db: PrismaClient): Promise<StockRef[]> {
  const rows = await db.externalRef.findMany({
    where: { provider: 'pancake', entityType: 'variant' },
    select: { entityId: true, externalId: true, hash: true },
  });
  return rows.map((r) => ({ variantId: r.entityId, variationId: r.externalId, hash: r.hash }));
}

export async function isStockPushOn(db: PrismaClient): Promise<boolean> {
  return Boolean(await db.syncCursor.findUnique({ where: { key: STOCK_PUSH_ON } }));
}

export async function setStockPushOn(db: PrismaClient, on: boolean): Promise<void> {
  if (on)
    await db.syncCursor.upsert({
      where: { key: STOCK_PUSH_ON },
      create: { key: STOCK_PUSH_ON, cursor: new Date() },
      update: { cursor: new Date() },
    });
  else await db.syncCursor.deleteMany({ where: { key: STOCK_PUSH_ON } });
}

export async function stockPushStatus(db: PrismaClient, warehouseId: string) {
  const [on, last, orders, refs] = await Promise.all([
    isStockPushOn(db),
    db.syncCursor.findUnique({ where: { key: STOCK_PUSH_LAST } }),
    db.syncCursor.findUnique({ where: { key: PANCAKE_ORDER_CURSOR } }),
    loadRefs(db),
  ]);
  const sellable = await sellableByVariant(
    db,
    warehouseId,
    refs.map((r) => r.variantId),
  );
  return {
    on,
    lastRunAt: last?.cursor ?? null,
    ordersSyncedAt: orders?.cursor ?? null,
    ordersCaughtUp: Boolean(orders && Date.now() - orders.cursor.getTime() < ORDERS_FRESH_MS),
    onPancake: refs.length,
    pending: selectChanged(refs, sellable).length,
  };
}

async function skuOf(db: PrismaClient, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 500) {
    const rows = await db.variant.findMany({
      where: { id: { in: ids.slice(i, i + 500) } },
      select: { id: true, sku: true },
    });
    for (const r of rows) out.set(r.id, r.sku);
  }
  return out;
}

async function remember(db: PrismaClient, variationId: string, qty: number) {
  await db.externalRef.updateMany({
    where: { provider: 'pancake', entityType: 'variant', externalId: variationId },
    data: { hash: String(qty) },
  });
}

export interface StockPushResult {
  skipped?: 'paused' | 'orders-behind';
  changed: number;
  pushed: number;
  failed: { sku: string; message: string }[];
  sample: { sku: string; qty: number; previous: string | null }[];
}

/**
 * Push stock that changed since the last push. The automatic pass (`auto`) does nothing while paused or while
 * the order sync is behind: pushing then would overwrite Pancake's stock with a number that misses orders
 * Pancake already took.
 */
export async function runStockPush(
  db: PrismaClient,
  io: StockIO,
  opts: { warehouseId: string; dryRun: boolean; auto: boolean; limit?: number },
): Promise<StockPushResult> {
  const empty: StockPushResult = { changed: 0, pushed: 0, failed: [], sample: [] };
  if (opts.auto) {
    if (!(await isStockPushOn(db))) return { ...empty, skipped: 'paused' };
    const orders = await db.syncCursor.findUnique({ where: { key: PANCAKE_ORDER_CURSOR } });
    if (!orders || Date.now() - orders.cursor.getTime() > ORDERS_FRESH_MS)
      return { ...empty, skipped: 'orders-behind' };
  }
  const refs = await loadRefs(db);
  const sellable = await sellableByVariant(
    db,
    opts.warehouseId,
    refs.map((r) => r.variantId),
  );
  const changed = selectChanged(refs, sellable);
  const skus = await skuOf(
    db,
    changed.slice(0, 500).map((c) => c.variantId),
  );
  const result: StockPushResult = {
    changed: changed.length,
    pushed: 0,
    failed: [],
    sample: changed.slice(0, 50).map((c) => ({
      sku: skus.get(c.variantId) ?? c.variantId,
      qty: c.qty,
      previous: c.hash,
    })),
  };
  if (opts.dryRun) return result;
  for (const c of changed.slice(0, opts.limit ?? 300)) {
    try {
      await io.setStock(c.variationId, c.qty);
      await remember(db, c.variationId, c.qty);
      result.pushed++;
    } catch (e) {
      result.failed.push({ sku: skus.get(c.variantId) ?? c.variantId, message: (e as Error).message });
    }
  }
  if (opts.auto)
    await db.syncCursor.upsert({
      where: { key: STOCK_PUSH_LAST },
      create: { key: STOCK_PUSH_LAST, cursor: new Date() },
      update: { cursor: new Date() },
    });
  return result;
}

export interface StockDiff {
  sku: string;
  sugami: number;
  pancake: number | null;
}

/**
 * Compare Sugami's sellable stock with Pancake's real stock, per variant. With `apply`, set Pancake to Sugami's
 * number where they differ and remember the number for every variant on Pancake, so later automatic passes
 * only push what changes afterwards.
 */
export async function reconcileWithPancake(
  db: PrismaClient,
  io: StockIO,
  pancakeStock: Map<string, number | null>,
  opts: { warehouseId: string; apply: boolean },
): Promise<{
  onPancake: number;
  different: number;
  fixed: number;
  failed: { sku: string; message: string }[];
  sample: StockDiff[];
}> {
  const refs = await loadRefs(db);
  const sellable = await sellableByVariant(
    db,
    opts.warehouseId,
    refs.map((r) => r.variantId),
  );
  const skus = await skuOf(
    db,
    refs.map((r) => r.variantId),
  );
  const diffs = refs.filter(
    (r) => (pancakeStock.get(r.variationId) ?? null) !== (sellable.get(r.variantId) ?? 0),
  );
  const out = {
    onPancake: refs.length,
    different: diffs.length,
    fixed: 0,
    failed: [] as { sku: string; message: string }[],
    sample: diffs.slice(0, 100).map((r) => ({
      sku: skus.get(r.variantId) ?? r.variantId,
      sugami: sellable.get(r.variantId) ?? 0,
      pancake: pancakeStock.get(r.variationId) ?? null,
    })),
  };
  if (!opts.apply) return out;
  const bad = new Set<string>();
  for (const r of diffs) {
    try {
      await io.setStock(r.variationId, sellable.get(r.variantId) ?? 0);
      out.fixed++;
    } catch (e) {
      bad.add(r.variationId);
      out.failed.push({ sku: skus.get(r.variantId) ?? r.variantId, message: (e as Error).message });
    }
  }
  for (const r of refs)
    if (!bad.has(r.variationId)) await remember(db, r.variationId, sellable.get(r.variantId) ?? 0);
  return out;
}
