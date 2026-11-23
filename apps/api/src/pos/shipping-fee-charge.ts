import type { PrismaClient } from '@sugami/db';

/**
 * The shipping fee the buyer pays through the order ("Khách trả"): added to the order total, to "Thu khác"
 * and, for a COD order, to the COD amount. The amount is remembered on the order so a cancelled waybill
 * can take it back out.
 */
export async function addShippingFee(db: PrismaClient, code: string, fee: bigint) {
  if (fee <= 0n) return;
  const o = await db.order.findUnique({ where: { code }, select: { codAmount: true } });
  if (!o) return;
  await db.order.update({
    where: { code },
    data: {
      otherIncome: { increment: fee },
      total: { increment: fee },
      shippingFeeCharged: { increment: fee },
      ...(o.codAmount > 0n ? { codAmount: { increment: fee } } : {}),
    },
  });
}

/** Takes back what {@link addShippingFee} added (the waybill is cancelled). Returns the amount taken back. */
export async function removeShippingFee(db: PrismaClient, orderId: string): Promise<bigint> {
  const o = await db.order.findUnique({
    where: { id: orderId },
    select: { shippingFeeCharged: true, codAmount: true },
  });
  const fee = o?.shippingFeeCharged ?? 0n;
  if (!o || fee <= 0n) return 0n;
  await db.order.update({
    where: { id: orderId },
    data: {
      otherIncome: { decrement: fee },
      total: { decrement: fee },
      shippingFeeCharged: 0n,
      ...(o.codAmount >= fee ? { codAmount: { decrement: fee } } : {}),
    },
  });
  return fee;
}
