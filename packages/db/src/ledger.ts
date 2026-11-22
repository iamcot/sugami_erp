import { weightedAverageCost } from '@sugami/shared';
import { Prisma, type PrismaClient } from './generated/prisma/client.js';
import type { MovementType, StockDocumentType } from './generated/prisma/enums.js';

type Tx = Prisma.TransactionClient;

export interface MovementInput {
  warehouseId: string;
  variantId: string;
  /** Signed quantity change. */
  qtyDelta: Prisma.Decimal | number | string;
  type: MovementType;
  /** VND per unit; only used for inbound movements to update average cost. */
  unitCost?: number;
  documentId?: string;
  refType?: string;
  refId?: string;
  note?: string;
  occurredAt?: Date;
  createdBy?: string;
}

const D = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);

/** Movement types that bring goods in at a known cost and so update the average cost. */
const COSTED_INBOUND: ReadonlySet<MovementType> = new Set(['opening', 'purchase_in', 'kiotviet_import']);

/**
 * Lock the stock_levels row (SELECT ... FOR UPDATE), creating it first if missing, and return on_hand.
 * Selecting before inserting avoids the shared-lock upgrade deadlock of INSERT IGNORE + FOR UPDATE.
 */
async function lockStockLevel(tx: Tx, warehouseId: string, variantId: string): Promise<Prisma.Decimal> {
  const select = () => tx.$queryRaw<{ on_hand: Prisma.Decimal | string }[]>`
    SELECT on_hand FROM stock_levels WHERE warehouse_id = ${warehouseId} AND variant_id = ${variantId} FOR UPDATE`;
  let rows = await select();
  if (rows.length === 0) {
    await tx.$executeRaw`
      INSERT IGNORE INTO stock_levels (warehouse_id, variant_id, on_hand, reserved, incoming, updated_at)
      VALUES (${warehouseId}, ${variantId}, 0, 0, 0, NOW(3))`;
    rows = await select();
  }
  return D(rows[0]?.on_hand ?? 0);
}

/** True for MySQL deadlock / lock-wait timeout errors, which are safe to retry. */
export function isRetryableTxError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(1213|1205)\b|Deadlock found|Lock wait timeout/.test(msg);
}

/** Run a ledger transaction, retrying on deadlocks (up to 3 attempts). */
export async function withLedgerTx<T>(
  prisma: PrismaClient,
  fn: (tx: Tx) => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await prisma.$transaction(fn);
    } catch (err) {
      if (i >= attempts || !isRetryableTxError(err)) throw err;
      await new Promise((r) => setTimeout(r, 20 * i + Math.random() * 30));
    }
  }
}

/**
 * Append movements to the ledger and update stock_levels in the same transaction.
 * This is the ONLY way stock may change.
 */
export async function applyMovements(tx: Tx, inputs: MovementInput[]): Promise<bigint[]> {
  const ids: bigint[] = [];
  for (const m of inputs) {
    const qty = D(m.qtyDelta);
    if (qty.isZero()) continue;

    const before = await lockStockLevel(tx, m.warehouseId, m.variantId);
    const after = before.plus(qty);

    if (qty.isPositive() && m.unitCost !== undefined && COSTED_INBOUND.has(m.type)) {
      const variant = await tx.variant.findUniqueOrThrow({
        where: { id: m.variantId },
        select: { costAvg: true },
      });
      const totals = await tx.stockLevel.aggregate({
        where: { variantId: m.variantId },
        _sum: { onHand: true },
      });
      const totalOnHand = Number(totals._sum.onHand ?? 0);
      const cost = weightedAverageCost(totalOnHand, Number(variant.costAvg), qty.toNumber(), m.unitCost);
      await tx.variant.update({ where: { id: m.variantId }, data: { costAvg: BigInt(cost) } });
    }

    const movement = await tx.stockMovement.create({
      data: {
        warehouseId: m.warehouseId,
        variantId: m.variantId,
        qtyDelta: qty,
        unitCost: m.unitCost !== undefined ? BigInt(Math.round(m.unitCost)) : null,
        balanceAfter: after,
        type: m.type,
        documentId: m.documentId,
        refType: m.refType,
        refId: m.refId,
        note: m.note,
        occurredAt: m.occurredAt,
        createdBy: m.createdBy,
      },
      select: { id: true },
    });
    await tx.stockLevel.update({
      where: { warehouseId_variantId: { warehouseId: m.warehouseId, variantId: m.variantId } },
      data: { onHand: after, lastMovementId: movement.id },
    });
    ids.push(movement.id);
  }
  return ids;
}

export class StockDocumentError extends Error {
  override name = 'StockDocumentError';
}

/** Movement type(s) a confirmed document line produces, with quantity sign. */
function linesToMovements(
  doc: { id: string; type: StockDocumentType; warehouseId: string; toWarehouseId: string | null },
  lines: { variantId: string; quantity: Prisma.Decimal; unitCost: bigint | null }[],
  createdBy?: string,
): MovementInput[] {
  const base = { documentId: doc.id, createdBy };
  return lines.flatMap((l): MovementInput[] => {
    const q = D(l.quantity);
    const cost = l.unitCost !== null ? Number(l.unitCost) : undefined;
    switch (doc.type) {
      case 'receipt':
        return [
          {
            ...base,
            warehouseId: doc.warehouseId,
            variantId: l.variantId,
            qtyDelta: q,
            type: 'purchase_in',
            unitCost: cost,
          },
        ];
      case 'issue':
        return [
          {
            ...base,
            warehouseId: doc.warehouseId,
            variantId: l.variantId,
            qtyDelta: q.neg(),
            type: 'damage',
          },
        ];
      case 'adjustment':
      case 'count':
        return [
          {
            ...base,
            warehouseId: doc.warehouseId,
            variantId: l.variantId,
            qtyDelta: q,
            type: doc.type === 'count' ? 'count' : 'adjust',
          },
        ];
      case 'transfer':
        if (!doc.toWarehouseId)
          throw new StockDocumentError('Transfer document has no destination warehouse');
        return [
          {
            ...base,
            warehouseId: doc.warehouseId,
            variantId: l.variantId,
            qtyDelta: q.neg(),
            type: 'transfer_out',
          },
          {
            ...base,
            warehouseId: doc.toWarehouseId,
            variantId: l.variantId,
            qtyDelta: q,
            type: 'transfer_in',
          },
        ];
      default:
        throw new StockDocumentError(`Unsupported document type: ${String(doc.type)}`);
    }
  });
}

/** Confirm a draft document: writes its movements and marks it confirmed, atomically. */
export async function confirmStockDocument(
  prisma: PrismaClient,
  documentId: string,
  userId?: string,
): Promise<void> {
  await withLedgerTx(prisma, async (tx) => {
    const doc = await tx.stockDocument.findUniqueOrThrow({
      where: { id: documentId },
      include: { lines: true },
    });
    if (doc.status !== 'draft')
      throw new StockDocumentError(`Document ${doc.code} is ${doc.status}, not draft`);
    if (doc.lines.length === 0) throw new StockDocumentError(`Document ${doc.code} has no lines`);
    await applyMovements(tx, linesToMovements(doc, doc.lines, userId));
    await tx.stockDocument.update({
      where: { id: doc.id },
      data: { status: 'confirmed', confirmedAt: new Date() },
    });
  });
}

/**
 * Cancel a confirmed document by appending reversing movements (the ledger is never edited).
 * A draft is simply marked cancelled.
 */
export async function cancelStockDocument(
  prisma: PrismaClient,
  documentId: string,
  userId?: string,
): Promise<void> {
  await withLedgerTx(prisma, async (tx) => {
    const doc = await tx.stockDocument.findUniqueOrThrow({
      where: { id: documentId },
      include: { movements: true },
    });
    if (doc.status === 'cancelled') throw new StockDocumentError(`Document ${doc.code} is already cancelled`);
    if (doc.status === 'confirmed') {
      await applyMovements(
        tx,
        doc.movements.map((m) => ({
          warehouseId: m.warehouseId,
          variantId: m.variantId,
          qtyDelta: D(m.qtyDelta).neg(),
          type: 'adjust' as const,
          documentId: doc.id,
          refType: 'cancel',
          refId: String(m.id),
          note: `Hủy phiếu ${doc.code}`,
          createdBy: userId,
        })),
      );
    }
    await tx.stockDocument.update({
      where: { id: doc.id },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });
  });
}
