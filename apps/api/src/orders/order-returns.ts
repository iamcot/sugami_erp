import { applyMovements, type PrismaClient, withLedgerTx } from '@sugami/db';

export class ReturnError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Stock an order still holds, per variant: the sum of every movement written for it (sale_out minus
 * any return_in). Only variants with a net outflow are listed, as the positive quantity to give back.
 */
export function stillHeld(
  moves: { variantId: string; qtyDelta: { toString(): string } }[],
): Map<string, number> {
  const net = new Map<string, number>();
  for (const m of moves) net.set(m.variantId, (net.get(m.variantId) ?? 0) + Number(m.qtyDelta.toString()));
  const held = new Map<string, number>();
  for (const [v, q] of net) if (q < 0) held.set(v, -q);
  return held;
}

/**
 * Close a returned parcel: either put the goods back in stock (return_in for what the order still holds)
 * or write them off (stock stays as it is). Either way the order leaves the "Hoàn hàng chờ xử lý" count.
 */
export async function handleReturn(
  db: PrismaClient,
  code: string,
  restock: boolean,
  userId?: string,
): Promise<{ restocked: number }> {
  const order = await db.order.findFirst({ where: { OR: [{ id: code }, { code }] } });
  if (!order) throw new ReturnError('Không tìm thấy đơn', 404);
  if (order.status !== 'returned') throw new ReturnError('Đơn này không ở trạng thái hoàn hàng', 409);
  if (order.returnHandledAt) throw new ReturnError('Đơn hoàn này đã được xử lý', 409);
  let restocked = 0;
  await withLedgerTx(db, async (tx) => {
    if (restock) {
      const moves = await tx.stockMovement.findMany({
        where: { refType: 'order', refId: order.id, warehouseId: order.warehouseId },
        select: { variantId: true, qtyDelta: true },
      });
      const held = stillHeld(moves);
      restocked = held.size;
      await applyMovements(
        tx,
        [...held].map(([variantId, qty]) => ({
          warehouseId: order.warehouseId,
          variantId,
          qtyDelta: qty,
          type: 'return_in' as const,
          refType: 'order',
          refId: order.id,
          note: `Nhập lại hàng hoàn đơn ${order.code}`,
          createdBy: userId,
        })),
      );
    }
    await tx.order.update({
      where: { id: order.id },
      data: { returnHandledAt: new Date(), ...(restock ? { stockAppliedAt: null } : {}) },
    });
  });
  return { restocked };
}
