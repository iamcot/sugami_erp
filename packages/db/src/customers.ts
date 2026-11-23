import type { PrismaClient } from './generated/prisma/client.js';

/**
 * Remember the customer's most recent purchase (never moves it back). Customers made from marketplace or
 * counter orders have no KiotViet date, so without this they never show up under "Mua gần đây".
 */
export async function touchLastPurchase(
  db: Pick<PrismaClient, 'customer'>,
  customerId: string,
  at: Date,
): Promise<void> {
  await db.customer.updateMany({
    where: { id: customerId, OR: [{ lastPurchaseAt: null }, { lastPurchaseAt: { lt: at } }] },
    data: { lastPurchaseAt: at },
  });
}
