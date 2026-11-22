// Integration tests against a real MySQL (DATABASE_URL). Skipped when no database is configured.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from './client.js';
import type { PrismaClient } from './generated/prisma/client.js';
import {
  applyMovements,
  cancelStockDocument,
  confirmStockDocument,
  StockDocumentError,
  withLedgerTx,
} from './ledger.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('stock ledger (MySQL)', () => {
  let prisma: PrismaClient;
  const run = randomUUID().slice(0, 8).toUpperCase();
  let wh1: string;
  let wh2: string;
  let variantId: string;

  const level = async (warehouseId: string) =>
    Number(
      (await prisma.stockLevel.findUnique({ where: { warehouseId_variantId: { warehouseId, variantId } } }))
        ?.onHand ?? 0,
    );

  const doc = async (
    type: 'receipt' | 'transfer' | 'adjustment',
    lines: { qty: number; cost?: number }[],
    to?: string,
  ) =>
    prisma.stockDocument.create({
      data: {
        code: `T${run}-${randomUUID().slice(0, 6)}`,
        type,
        warehouseId: wh1,
        toWarehouseId: to,
        lines: {
          create: lines.map((l) => ({
            variantId,
            quantity: l.qty,
            unitCost: l.cost ? BigInt(l.cost) : null,
          })),
        },
      },
    });

  beforeAll(async () => {
    prisma = createPrismaClient();
    wh1 = (await prisma.warehouse.create({ data: { code: `W1-${run}`, name: 'Kho test 1' } })).id;
    wh2 = (await prisma.warehouse.create({ data: { code: `W2-${run}`, name: 'Kho test 2' } })).id;
    const product = await prisma.product.create({
      data: {
        code: `P-${run}`,
        name: 'Xe điều khiển test',
        searchKey: 'xe dieu khien test',
        variants: { create: [{ sku: `P-${run}-DO`, optionValues: ['Đỏ'] }] },
      },
      include: { variants: true },
    });
    variantId = product.variants[0]!.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('receipts update on-hand, balance snapshots and average cost', async () => {
    const r1 = await doc('receipt', [{ qty: 10, cost: 100000 }]);
    await confirmStockDocument(prisma, r1.id);
    const r2 = await doc('receipt', [{ qty: 10, cost: 120000 }]);
    await confirmStockDocument(prisma, r2.id);

    expect(await level(wh1)).toBe(20);
    const v = await prisma.variant.findUniqueOrThrow({ where: { id: variantId } });
    expect(Number(v.costAvg)).toBe(110000);
    const moves = await prisma.stockMovement.findMany({ where: { variantId }, orderBy: { id: 'asc' } });
    expect(moves.map((m) => Number(m.balanceAfter))).toEqual([10, 20]);
  });

  it('refuses to confirm twice', async () => {
    const r = await doc('receipt', [{ qty: 1, cost: 1 }]);
    await confirmStockDocument(prisma, r.id);
    await expect(confirmStockDocument(prisma, r.id)).rejects.toBeInstanceOf(StockDocumentError);
    await cancelStockDocument(prisma, r.id);
    expect(await level(wh1)).toBe(20);
  });

  it('transfers between warehouses and cancels with reversing movements', async () => {
    const t = await doc('transfer', [{ qty: 5 }], wh2);
    await confirmStockDocument(prisma, t.id);
    expect([await level(wh1), await level(wh2)]).toEqual([15, 5]);

    await cancelStockDocument(prisma, t.id);
    expect([await level(wh1), await level(wh2)]).toEqual([20, 0]);
    const reversals = await prisma.stockMovement.count({ where: { documentId: t.id, refType: 'cancel' } });
    expect(reversals).toBe(2);
  });

  it('serialises concurrent movements on the same row', async () => {
    await Promise.all(
      Array.from({ length: 15 }, () =>
        withLedgerTx(prisma, (tx) =>
          applyMovements(tx, [{ warehouseId: wh1, variantId, qtyDelta: 1, type: 'adjust' }]),
        ),
      ),
    );
    expect(await level(wh1)).toBe(35);
  });

  it('keeps stock_levels equal to the sum of the ledger', async () => {
    for (const wh of [wh1, wh2]) {
      const sum = await prisma.stockMovement.aggregate({
        where: { variantId, warehouseId: wh },
        _sum: { qtyDelta: true },
      });
      expect(Number(sum._sum.qtyDelta ?? 0)).toBe(await level(wh));
    }
  });
});
