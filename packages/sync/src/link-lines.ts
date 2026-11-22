import { applyMovements, type PrismaClient, withLedgerTx } from '@sugami/db';
import { lineKey, SKU_MAP_PROVIDER } from './sku-map.js';

/**
 * Order lines Pancake could not link to a product: no SKU and no variant, only a name that starts with
 * the marketplace's own code. They are grouped by that code so one decision covers every order.
 */
export interface UnlinkedGroup {
  key: string;
  name: string;
  lines: number;
  orders: number;
  qty: number;
  lastOrderedAt: Date;
  unitPrice: number;
}

const unlinkedWhere = { variantId: null, sku: '' } as const;

export async function listUnlinkedLines(db: PrismaClient): Promise<UnlinkedGroup[]> {
  const rows = await db.orderLine.findMany({
    where: { ...unlinkedWhere, order: { status: { notIn: ['cancelled', 'returned'] } } },
    select: { name: true, qty: true, unitPrice: true, orderId: true, order: { select: { orderedAt: true } } },
  });
  const groups = new Map<string, UnlinkedGroup & { orderIds: Set<string> }>();
  for (const r of rows) {
    const key = lineKey(r.name);
    if (!key) continue;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        name: r.name.replace(/^\s*\S+\s+-\s+/, ''),
        lines: 0,
        orders: 0,
        qty: 0,
        lastOrderedAt: r.order.orderedAt,
        unitPrice: Number(r.unitPrice),
        orderIds: new Set(),
      };
      groups.set(key, g);
    }
    g.lines++;
    g.qty += Number(r.qty);
    g.orderIds.add(r.orderId);
    if (r.order.orderedAt > g.lastOrderedAt) {
      g.lastOrderedAt = r.order.orderedAt;
      g.unitPrice = Number(r.unitPrice);
    }
  }
  return [...groups.values()]
    .map(({ orderIds, ...g }) => ({ ...g, orders: orderIds.size }))
    .sort((a, b) => b.lastOrderedAt.getTime() - a.lastOrderedAt.getTime());
}

export interface LinkResult {
  key: string;
  sku: string;
  lines: number;
  orders: number;
  stockApplied: number;
  stockBeforeSnapshot: number;
}

/**
 * Remember that marketplace code `key` is this Sugami variant and give every existing unlinked line with
 * that code its SKU. A line takes stock only if its order is active and after the SKU's opening snapshot
 * (the same rule as the order sync), so linking never double-counts old sales.
 */
export async function linkUnlinkedLines(
  db: PrismaClient,
  input: { key: string; variantId: string },
): Promise<LinkResult> {
  const variant = await db.variant.findUnique({
    where: { id: input.variantId },
    select: { id: true, sku: true, costAvg: true },
  });
  if (!variant) throw new Error('Không tìm thấy mã hàng');
  await db.externalRef.upsert({
    where: {
      provider_entityType_externalId: {
        provider: SKU_MAP_PROVIDER,
        entityType: 'variant',
        externalId: input.key,
      },
    },
    create: {
      provider: SKU_MAP_PROVIDER,
      entityType: 'variant',
      externalId: input.key,
      entityId: variant.id,
    },
    update: { entityId: variant.id },
  });

  const candidates = await db.orderLine.findMany({
    where: { ...unlinkedWhere, name: { startsWith: input.key } },
    include: { order: { select: { id: true, code: true, status: true, orderedAt: true, warehouseId: true, stockAppliedAt: true } } },
  });
  const lines = candidates.filter((l) => lineKey(l.name) === input.key);
  const result: LinkResult = {
    key: input.key,
    sku: variant.sku,
    lines: lines.length,
    orders: new Set(lines.map((l) => l.orderId)).size,
    stockApplied: 0,
    stockBeforeSnapshot: 0,
  };
  const snapshots = await db.stockMovement.groupBy({
    by: ['warehouseId'],
    where: { variantId: variant.id, type: { in: ['kiotviet_import', 'opening'] } },
    _min: { occurredAt: true },
  });
  const snapshotAt = new Map(snapshots.map((s) => [s.warehouseId, s._min.occurredAt]));

  for (const l of lines) {
    const active = l.order.status !== 'cancelled' && l.order.status !== 'returned';
    const at = snapshotAt.get(l.order.warehouseId);
    const takesStock = active && Boolean(at && l.order.orderedAt > at);
    if (active && !takesStock) result.stockBeforeSnapshot++;
    await withLedgerTx(db, async (tx) => {
      await tx.orderLine.update({
        where: { id: l.id },
        data: { variantId: variant.id, sku: variant.sku.slice(0, 64), costSnapshot: variant.costAvg },
      });
      if (!takesStock) return;
      await applyMovements(tx, [
        {
          warehouseId: l.order.warehouseId,
          variantId: variant.id,
          qtyDelta: -Number(l.qty),
          type: 'sale_out',
          refType: 'order',
          refId: l.order.id,
          note: `Ghép mã sàn ${input.key} → ${variant.sku} (đơn ${l.order.code})`,
          occurredAt: l.order.orderedAt,
        },
      ]);
      if (!l.order.stockAppliedAt)
        await tx.order.update({ where: { id: l.order.id }, data: { stockAppliedAt: new Date() } });
    });
    if (takesStock) result.stockApplied++;
  }
  return result;
}
