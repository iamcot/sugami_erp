import { applyMovements, type PrismaClient, withLedgerTx } from '@sugami/db';
import { fulfillmentOf, holdsStock, SHIPPING_TEXT } from '../pos/pos-flow.js';

export interface BulkResult {
  done: string[];
  skipped: { code: string; reason: string }[];
}

/** Why an order cannot be forced to completed, or null when it can. */
export function cannotComplete(o: { source: string; status: string }): string | null {
  if (o.source === 'pancake') return 'Đơn sàn đi theo trạng thái trên sàn';
  if (o.status === 'completed') return 'Đã hoàn tất';
  if (o.status === 'cancelled' || o.status === 'returned') return 'Đơn đã hủy hoặc hoàn';
  return null;
}

export interface BulkPlan {
  /** Counter orders whose stock leaves the warehouse now. */
  take: string[];
  /** Orders that only change status (stock already out, or KiotViet orders). */
  statusOnly: string[];
  skipped: { code: string; reason: string }[];
}

/** What completing these orders would do, shown to the seller before they confirm. */
export async function planComplete(db: PrismaClient, codes: string[]): Promise<BulkPlan> {
  const orders = await db.order.findMany({ where: { code: { in: codes } } });
  const plan: BulkPlan = { take: [], statusOnly: [], skipped: [] };
  for (const code of codes) {
    const o = orders.find((x) => x.code === code);
    const why = o ? cannotComplete(o) : 'Không tìm thấy';
    if (why || !o) plan.skipped.push({ code, reason: why ?? 'Không tìm thấy' });
    else if (takesStock(o)) plan.take.push(code);
    else plan.statusOnly.push(code);
  }
  return plan;
}

function takesStock(
  o: Parameters<typeof fulfillmentOf>[0] & { source: string; stockAppliedAt: Date | null },
) {
  return o.source === 'pos' && o.stockAppliedAt === null && holdsStock(fulfillmentOf(o), 'completed');
}

/**
 * Close orders the shop has already delivered but never moved along (e.g. a counter order left at
 * "Đã xác nhận"). Counter orders take their stock now if they had not yet (as "Giao cho ĐVVC" would)
 * and count as paid in full; KiotViet orders only change status, their stock came with the import.
 * Marketplace orders follow the marketplace and are skipped.
 */
export async function completeOrders(
  db: PrismaClient,
  codes: string[],
  userId?: string,
): Promise<BulkResult> {
  const orders = await db.order.findMany({ where: { code: { in: codes } }, include: { lines: true } });
  const res: BulkResult = { done: [], skipped: [] };
  for (const code of codes)
    if (!orders.some((o) => o.code === code)) res.skipped.push({ code, reason: 'Không tìm thấy' });
  for (const order of orders) {
    const why = cannotComplete(order);
    if (why) {
      res.skipped.push({ code: order.code, reason: why });
      continue;
    }
    const pos = order.source === 'pos';
    const kind = fulfillmentOf(order);
    const take = takesStock(order);
    await withLedgerTx(db, async (tx) => {
      if (take)
        await applyMovements(
          tx,
          order.lines
            .filter((l) => l.variantId)
            .map((l) => ({
              warehouseId: order.warehouseId,
              variantId: l.variantId!,
              qtyDelta: -Number(l.qty),
              type: 'sale_out' as const,
              refType: 'order',
              refId: order.id,
              note: `Hoàn tất đơn ${order.code}`,
              createdBy: userId,
            })),
        );
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          shippingStatus: pos ? SHIPPING_TEXT.completed : order.shippingStatus,
          ...(pos
            ? {
                fulfillment: kind,
                paidAmount: order.total,
                codAmount: 0n,
                stockAppliedAt: order.stockAppliedAt ?? (take ? new Date() : null),
              }
            : {}),
        },
      });
    });
    res.done.push(order.code);
  }
  return res;
}
