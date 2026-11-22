import { applyMovements, Prisma, type PrismaClient, withLedgerTx } from '@sugami/db';
import { toSearchKey } from '@sugami/shared';
import type { PosPayload } from './pos-schema.js';

export class PosError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

const CODE_PREFIX = 'BH';
const WAREHOUSE = () => process.env.POS_WAREHOUSE || 'KHO-CHINH';
const big = (n: number) => BigInt(Math.round(n));
const isActive = (status: string) => status !== 'cancelled' && status !== 'returned';

async function nextCode(db: PrismaClient): Promise<string> {
  const last = await db.order.findFirst({
    where: { code: { startsWith: CODE_PREFIX }, source: 'pos' },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  const n = last ? Number.parseInt(last.code.slice(CODE_PREFIX.length), 10) || 0 : 0;
  return `${CODE_PREFIX}${String(n + 1).padStart(6, '0')}`;
}

/** Totals of a counter sale: what the buyer owes and what is collected on delivery. */
export function posTotals(p: PosPayload, mode: 'retail' | 'delivery') {
  const subtotal = p.lines.reduce((a, l) => a + l.price * l.qty, 0);
  const total = Math.max(0, Math.round(subtotal) - p.discount + p.otherIncome);
  const paid = Math.min(p.paid, total);
  return { subtotal: Math.round(subtotal), total, paid, cod: mode === 'delivery' && p.cod ? total - paid : 0 };
}

/**
 * Turn a counter sale into an order: lines priced as typed, stock taken from the warehouse in the same
 * transaction (a counter sale is always "now", so it always takes stock), customer created if only a
 * name/phone was typed. A retail sale is completed on the spot; a delivery starts as "new" and moves on
 * by hand (shipped, delivered, ...).
 */
export async function createPosOrder(
  db: PrismaClient,
  input: { mode: 'retail' | 'delivery'; payload: PosPayload; draftId?: string; userId?: string },
): Promise<{ code: string; id: string }> {
  const { mode, payload: p } = input;
  if (!p.lines.length) throw new PosError('Đơn chưa có sản phẩm');
  const warehouse = await db.warehouse.findUnique({ where: { code: WAREHOUSE() } });
  if (!warehouse || !warehouse.isActive) throw new PosError('Không tìm thấy kho bán hàng');
  const variants = await db.variant.findMany({
    where: { id: { in: p.lines.map((l) => l.variantId) } },
    select: { id: true, sku: true, costAvg: true, optionValues: true, product: { select: { name: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  for (const l of p.lines) if (!byId.has(l.variantId)) throw new PosError('Có sản phẩm không còn trong hệ thống');
  const channel = await db.channel.upsert({
    where: { code: 'store' },
    create: { code: 'store', type: 'store', name: 'Bán trực tiếp' },
    update: {},
  });
  const t = posTotals(p, mode);
  if (mode === 'delivery' && !p.receiver.address && !p.receiver.phone)
    throw new PosError('Bán giao hàng cần ít nhất địa chỉ hoặc số điện thoại người nhận');

  let customerId = p.customer?.id ?? null;
  if (!customerId && (p.customer?.name || p.customer?.phone)) {
    customerId = (
      await db.customer.create({
        data: {
          name: p.customer.name || null,
          phone: p.customer.phone || null,
          searchKey: toSearchKey([p.customer.name, p.customer.phone].filter(Boolean).join(' ')).slice(0, 400),
          tags: ['Bán trực tiếp'],
        },
      })
    ).id;
  }

  const now = new Date();
  const retail = mode === 'retail';
  for (let attempt = 0; ; attempt++) {
    const code = await nextCode(db);
    try {
      return await withLedgerTx(db, async (tx) => {
        const order = await tx.order.create({
          data: {
            code,
            channelId: channel.id,
            customerId,
            warehouseId: warehouse.id,
            status: retail ? 'completed' : 'new',
            shippingStatus: retail ? null : 'Chờ xử lý',
            carrier: retail ? null : p.carrier || null,
            trackingNo: retail ? null : p.trackingNo || null,
            shipAddress: retail
              ? null
              : [p.receiver.address, p.receiver.ward, p.receiver.area].filter(Boolean).join(', ') || null,
            shipPhone: retail ? null : p.receiver.phone || null,
            shipProvince: retail ? null : p.receiver.area || null,
            subtotal: big(t.subtotal),
            discount: big(p.discount),
            otherIncome: big(p.otherIncome),
            total: big(t.total),
            paidAmount: big(t.paid),
            codAmount: big(t.cod),
            shippingFee: big(retail ? 0 : p.shippingFee),
            orderedAt: now,
            completedAt: retail ? now : null,
            source: 'pos',
            stockAppliedAt: now,
            internalNote: [!retail && p.receiver.name ? `Người nhận: ${p.receiver.name}` : '', p.note]
              .filter(Boolean)
              .join('\n')
              .slice(0, 1000) || null,
            lines: {
              create: p.lines.map((l, i) => {
                const v = byId.get(l.variantId)!;
                const opts = Object.values((v.optionValues ?? {}) as Record<string, unknown>).join(' / ');
                return {
                  variantId: v.id,
                  sku: v.sku.slice(0, 64),
                  name: `${v.product.name}${opts ? ` - ${opts}` : ''}`.slice(0, 255),
                  qty: new Prisma.Decimal(l.qty),
                  unitPrice: big(l.price),
                  discount: 0n,
                  price: big(l.price),
                  lineTotal: big(l.price * l.qty),
                  costSnapshot: v.costAvg,
                  sort: i,
                };
              }),
            },
          },
          select: { id: true, code: true },
        });
        await applyMovements(
          tx,
          p.lines.map((l) => ({
            warehouseId: warehouse.id,
            variantId: l.variantId,
            qtyDelta: -l.qty,
            type: 'sale_out' as const,
            refType: 'order',
            refId: order.id,
            note: `Bán hàng ${order.code}`,
            occurredAt: now,
            createdBy: input.userId,
          })),
        );
        if (input.draftId) await tx.posDraft.deleteMany({ where: { id: input.draftId } });
        return order;
      });
    } catch (err) {
      const dup = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (!dup || attempt >= 4) throw err;
    }
  }
}

/**
 * Move a counter order to another status by hand. Cancelled/returned give the stock back; moving an order
 * out of those takes it again. Only counter orders can be changed this way (marketplace orders follow
 * their channel).
 */
export async function changePosOrderStatus(
  db: PrismaClient,
  code: string,
  status: string,
  userId?: string,
): Promise<void> {
  const order = await db.order.findUnique({ where: { code }, include: { lines: true } });
  if (!order) throw new PosError('Không tìm thấy đơn', 404);
  if (order.source !== 'pos') throw new PosError('Chỉ đổi tay được trạng thái đơn bán tại quầy', 409);
  if (order.status === status) return;
  const wasActive = isActive(order.status);
  const willBeActive = isActive(status);
  await withLedgerTx(db, async (tx) => {
    const lines = order.lines.filter((l) => l.variantId);
    if (wasActive && !willBeActive && order.stockAppliedAt)
      await applyMovements(
        tx,
        lines.map((l) => ({
          warehouseId: order.warehouseId,
          variantId: l.variantId!,
          qtyDelta: Number(l.qty),
          type: 'return_in' as const,
          refType: 'order',
          refId: order.id,
          note: `${status === 'returned' ? 'Hoàn' : 'Hủy'} đơn ${order.code}`,
          createdBy: userId,
        })),
      );
    if (!wasActive && willBeActive)
      await applyMovements(
        tx,
        lines.map((l) => ({
          warehouseId: order.warehouseId,
          variantId: l.variantId!,
          qtyDelta: -Number(l.qty),
          type: 'sale_out' as const,
          refType: 'order',
          refId: order.id,
          note: `Mở lại đơn ${order.code}`,
          createdBy: userId,
        })),
      );
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: status as never,
        completedAt: status === 'completed' || status === 'delivered' ? (order.completedAt ?? new Date()) : null,
        stockAppliedAt: willBeActive ? (order.stockAppliedAt ?? new Date()) : order.stockAppliedAt,
        shippingStatus:
          { new: 'Chờ xử lý', confirmed: 'Đã xác nhận', packing: 'Đang đóng gói', shipped: 'Đang giao', delivered: 'Giao thành công', completed: order.shippingStatus, cancelled: 'Đã hủy', returned: 'Hoàn hàng' }[
            status
          ] ?? order.shippingStatus,
      },
    });
  });
}
