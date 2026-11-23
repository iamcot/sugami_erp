import { applyMovements, Prisma, type PrismaClient, touchLastPurchase, withLedgerTx } from '@sugami/db';
import { toSearchKey } from '@sugami/shared';
import { fulfillmentOf, holdsStock, posActions, SHIPPING_TEXT } from './pos-flow.js';
import type { PosPayload } from './pos-schema.js';

/** Hand-over deadline of a POS order: midnight (24h) at the end of the day after it was created, Vietnam time. */
export function handoverDeadline(createdAt: Date): Date {
  const VN = 7 * 3_600_000;
  const DAY = 86_400_000;
  const startOfDayVn = Math.floor((createdAt.getTime() + VN) / DAY) * DAY - VN;
  return new Date(startOfDayVn + 2 * DAY);
}

export class PosError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

/** Statuses in which a delivery order holds goods for its buyer but they are still on the shelf. */
const HOLDING = ['new', 'confirmed', 'packing'] as const;

/**
 * Stock on the shelf, what open delivery orders have set aside, and what can still be sold. The held
 * amount is computed from the orders themselves (not a stored counter), so it can never drift.
 */
export async function availability(db: PrismaClient, warehouseId: string, variantIds: string[]) {
  const out = new Map<string, { onHand: number; reserved: number; available: number }>();
  if (!variantIds.length) return out;
  const levels = await db.stockLevel.findMany({
    where: { warehouseId, variantId: { in: variantIds } },
    select: { variantId: true, onHand: true },
  });
  const held = await db.orderLine.groupBy({
    by: ['variantId'],
    where: {
      variantId: { in: variantIds },
      order: { source: 'pos', warehouseId, stockAppliedAt: null, status: { in: [...HOLDING] } },
    },
    _sum: { qty: true },
  });
  const onHand = new Map(levels.map((l) => [l.variantId, Number(l.onHand)]));
  const reserved = new Map(held.map((h) => [h.variantId!, Number(h._sum.qty ?? 0)]));
  for (const id of variantIds) {
    const o = onHand.get(id) ?? 0;
    const r = reserved.get(id) ?? 0;
    out.set(id, { onHand: o, reserved: r, available: o - r });
  }
  return out;
}

const CODE_PREFIX = 'BH';
const WAREHOUSE = () => process.env.POS_WAREHOUSE || 'KHO-CHINH';
const big = (n: number) => BigInt(Math.round(n));

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
  return {
    subtotal: Math.round(subtotal),
    total,
    paid,
    cod: mode === 'delivery' && p.cod ? total - paid : 0,
  };
}

/**
 * Turn a counter sale into an order: lines priced as typed, stock taken from the warehouse in the same
 * transaction (a counter sale is always "now", so it always takes stock), customer created if only a
 * name/phone was typed. A retail sale is completed on the spot; a delivery starts as "new" and moves on
 * by hand (shipped, delivered, ...).
 */
export async function createPosOrder(
  db: PrismaClient,
  input: {
    mode: 'retail' | 'delivery';
    payload: PosPayload;
    draftId?: string;
    userId?: string;
    allowOversell?: boolean;
  },
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
  for (const l of p.lines)
    if (!byId.has(l.variantId)) throw new PosError('Có sản phẩm không còn trong hệ thống');
  const channel = await db.channel.upsert({
    where: { code: 'store' },
    create: { code: 'store', type: 'store', name: 'Bán trực tiếp' },
    update: {},
  });
  const t = posTotals(p, mode);
  // Selling more than what is left (shelf minus what other open deliveries hold) needs a deliberate "sell anyway".
  if (!input.allowOversell) {
    const avail = await availability(
      db,
      warehouse.id,
      p.lines.map((l) => l.variantId),
    );
    const short = p.lines
      .map((l) => ({ l, a: avail.get(l.variantId)?.available ?? 0 }))
      .filter(({ l, a }) => l.qty > a)
      .map(({ l, a }) => `${byId.get(l.variantId)!.sku} cần ${l.qty}, còn bán ${Math.max(a, 0)}`);
    if (short.length) throw new PosError(`Không đủ tồn: ${short.join('; ')}`, 409);
  }
  if (mode === 'delivery' && !p.receiver.address && !p.receiver.phone)
    throw new PosError('Bán giao hàng cần ít nhất địa chỉ hoặc số điện thoại người nhận');

  // A buyer who is not in the list yet is created here: typed on the screen, or (delivery) the receiver.
  let customerId = p.customer?.id ?? null;
  const typedName = p.customer?.name || (mode === 'delivery' && p.customer ? p.receiver.name : '') || '';
  const typedPhone = p.customer?.phone || (mode === 'delivery' && p.customer ? p.receiver.phone : '') || '';
  if (!customerId && p.customer && (typedName || typedPhone)) {
    const existing = typedPhone
      ? await db.customer.findFirst({ where: { phone: typedPhone }, select: { id: true } })
      : null;
    customerId =
      existing?.id ??
      (
        await db.customer.create({
          data: {
            name: typedName || null,
            phone: typedPhone || null,
            email: p.customer.email || null,
            addressLine: p.customer.addressLine || (mode === 'delivery' ? p.receiver.address : '') || null,
            region: p.customer.region || (mode === 'delivery' ? p.receiver.area : '') || null,
            ward: p.customer.ward || (mode === 'delivery' ? p.receiver.ward : '') || null,
            searchKey: toSearchKey([typedName, typedPhone].filter(Boolean).join(' ')).slice(0, 400),
            tags: ['Bán trực tiếp'],
          },
        })
      ).id;
  }

  const now = new Date();
  const at = p.orderedAt ? new Date(p.orderedAt) : now;
  if (at.getTime() > now.getTime() + 5 * 60_000) throw new PosError('Thời gian bán không được ở tương lai');
  if (customerId) await touchLastPurchase(db, customerId, at);
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
            orderedAt: at,
            shipByAt: handoverDeadline(at),
            paymentMethod: t.paid > 0 ? p.paymentMethod : null,
            completedAt: retail ? at : null,
            source: 'pos',
            fulfillment: mode,
            stockAppliedAt: retail ? now : null,
            internalNote:
              [!retail && p.receiver.name ? `Người nhận: ${p.receiver.name}` : '', p.note]
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
        // a delivery keeps its stock on the shelf until the parcel is handed over ("Giao cho ĐVVC")
        if (retail)
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
              occurredAt: at,
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
 * Run one button of the state machine on a counter order: the status moves along the allowed edge and stock
 * follows the button (sale_out when the goods leave, return_in when they come back), all in one transaction.
 * Marketplace orders are not handled here: they follow their channel.
 */
export async function runPosAction(
  db: PrismaClient,
  code: string,
  key: string,
  userId?: string,
  /** Handing over to the carrier can set who carries it and the tracking number. */
  extra: { carrier?: string; trackingNo?: string } = {},
): Promise<{ status: string }> {
  const order = await db.order.findUnique({ where: { code }, include: { lines: true } });
  if (!order) throw new PosError('Không tìm thấy đơn', 404);
  if (order.source !== 'pos') throw new PosError('Chỉ đơn bán tại quầy mới có các nút xử lý này', 409);
  const kind = fulfillmentOf(order);
  const action = posActions(kind, order.status).find((a) => a.key === key);
  if (!action) throw new PosError('Đơn đã đổi trạng thái, không còn thao tác này (tải lại trang)', 409);
  const wasHolding = order.stockAppliedAt !== null;
  const willHold = holdsStock(kind, action.to);
  const lines = order.lines.filter((l) => l.variantId);
  await withLedgerTx(db, async (tx) => {
    if (wasHolding && !willHold)
      await applyMovements(
        tx,
        lines.map((l) => ({
          warehouseId: order.warehouseId,
          variantId: l.variantId!,
          qtyDelta: Number(l.qty),
          type: 'return_in' as const,
          refType: 'order',
          refId: order.id,
          note: `${action.label} đơn ${order.code}`,
          createdBy: userId,
        })),
      );
    if (!wasHolding && willHold)
      await applyMovements(
        tx,
        lines.map((l) => ({
          warehouseId: order.warehouseId,
          variantId: l.variantId!,
          qtyDelta: -Number(l.qty),
          type: 'sale_out' as const,
          refType: 'order',
          refId: order.id,
          note: `${action.label} đơn ${order.code}`,
          createdBy: userId,
        })),
      );
    const done = action.to === 'completed';
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: action.to,
        fulfillment: kind,
        shippingStatus: SHIPPING_TEXT[action.to],
        stockAppliedAt: willHold ? (order.stockAppliedAt ?? new Date()) : null,
        // a counter return puts the goods back right here, so there is nothing left to handle
        returnHandledAt: action.to === 'returned' ? new Date() : null,
        completedAt: done
          ? new Date()
          : action.to === 'cancelled' || action.to === 'returned'
            ? null
            : order.completedAt,
        ...(action.key === 'ship'
          ? {
              ...(extra.carrier !== undefined ? { carrier: extra.carrier || null } : {}),
              ...(extra.trackingNo !== undefined ? { trackingNo: extra.trackingNo || null } : {}),
            }
          : {}),
        // COD collected: a completed delivery is paid in full
        ...(done ? { paidAmount: order.total, codAmount: 0n } : {}),
      },
    });
  });
  return { status: action.to };
}
