import {
  applyMovements,
  currentShopId,
  Prisma,
  type PrismaClient,
  touchLastPurchase,
  withLedgerTx,
} from '@sugami/db';
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
  // made-to-order lines hold their materials, qty per unit × line qty
  const heldParts = await db.orderLineComponent.findMany({
    where: {
      variantId: { in: variantIds },
      orderLine: {
        order: { source: 'pos', warehouseId, stockAppliedAt: null, status: { in: [...HOLDING] } },
      },
    },
    select: { variantId: true, qty: true, orderLine: { select: { qty: true } } },
  });
  const onHand = new Map(levels.map((l) => [l.variantId, Number(l.onHand)]));
  const reserved = new Map(held.map((h) => [h.variantId!, Number(h._sum.qty ?? 0)]));
  for (const p of heldParts)
    reserved.set(p.variantId, (reserved.get(p.variantId) ?? 0) + Number(p.qty) * Number(p.orderLine.qty));
  for (const id of variantIds) {
    const o = onHand.get(id) ?? 0;
    const r = reserved.get(id) ?? 0;
    out.set(id, { onHand: o, reserved: r, available: o - r });
  }
  return out;
}

const CODE_PREFIX = 'BH';
const big = (n: number) => BigInt(Math.round(n));

/**
 * The shop's sales warehouse: POS_WAREHOUSE (default KHO-CHINH) when the shop has it, otherwise its
 * first active warehouse (a new shop gets one when it is created).
 */
export async function posWarehouse(db: PrismaClient) {
  return (
    (await db.warehouse.findFirst({
      where: { code: process.env.POS_WAREHOUSE || 'KHO-CHINH', isActive: true },
    })) ?? (await db.warehouse.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } }))
  );
}

/** One material of a made-to-order line: quantity per unit of the line and its average cost. */
export interface LinePart {
  variantId: string;
  sku: string;
  name: string;
  qty: number;
  unitCost: number;
}

/** Cost of ONE unit of a line made of `parts`, VND (rounded). */
export const partsCost = (parts: Pick<LinePart, 'qty' | 'unitCost'>[]) =>
  Math.round(parts.reduce((a, p) => a + p.qty * p.unitCost, 0));

/** Stock a sale takes: lines with parts take their materials (× line qty), the others their own product. */
export function stockNeeds(lines: { variantId: string | null; qty: number; parts: LinePart[] | null }[]) {
  const need = new Map<string, number>();
  const add = (id: string, q: number) => need.set(id, Math.round(((need.get(id) ?? 0) + q) * 1000) / 1000);
  for (const l of lines) {
    if (l.parts) for (const p of l.parts) add(p.variantId, p.qty * l.qty);
    else if (l.variantId) add(l.variantId, l.qty);
  }
  return need;
}

const variantLabel = (v: { sku: string; optionValues: unknown; product: { name: string } }) => {
  const opts = Object.values((v.optionValues ?? {}) as Record<string, unknown>).join(' / ');
  return `${v.product.name}${opts ? ` - ${opts}` : ''}`.slice(0, 255);
};

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
  const { mode } = input;
  const p = {
    ...input.payload,
    lines: input.payload.lines.map((l) =>
      l.components ? { ...l, components: l.components.filter((c) => c.qty > 0) } : l,
    ),
  };
  if (!p.lines.length) throw new PosError('Đơn chưa có sản phẩm');
  const warehouse = await posWarehouse(db);
  if (!warehouse) throw new PosError('Không tìm thấy kho bán hàng');
  const ids = new Set<string>();
  for (const l of p.lines) {
    if (l.variantId) ids.add(l.variantId);
    for (const c of l.components ?? []) ids.add(c.variantId);
  }
  const variants = await db.variant.findMany({
    where: { id: { in: [...ids] } },
    select: {
      id: true,
      sku: true,
      costAvg: true,
      optionValues: true,
      product: { select: { name: true, kind: true } },
      comboItems: {
        select: {
          quantity: true,
          component: {
            select: {
              id: true,
              sku: true,
              costAvg: true,
              optionValues: true,
              product: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  if (variants.length !== ids.size) throw new PosError('Có sản phẩm không còn trong hệ thống');
  // Made-to-order lines: the materials typed on the screen, or the finished product's bill of materials.
  const resolved = p.lines.map((l) => {
    const v = l.variantId ? byId.get(l.variantId)! : null;
    if (!v && !l.components?.length)
      throw new PosError(`Thành phẩm "${l.name || 'theo yêu cầu'}" chưa chọn nguyên liệu`);
    if (v?.product.kind === 'finished' && l.components && !l.components.length)
      throw new PosError(`Thành phẩm ${v.sku} chưa chọn nguyên liệu`);
    let parts: LinePart[] | null = null;
    if (l.components?.length) {
      parts = l.components.map((c) => {
        const m = byId.get(c.variantId)!;
        return {
          variantId: m.id,
          sku: m.sku,
          name: variantLabel(m),
          qty: c.qty,
          unitCost: Number(m.costAvg),
        };
      });
    } else if (v?.product.kind === 'finished') {
      if (!v.comboItems.length) throw new PosError(`Thành phẩm ${v.sku} chưa có định mức nguyên liệu`);
      parts = v.comboItems.map((c) => ({
        variantId: c.component.id,
        sku: c.component.sku,
        name: variantLabel(c.component),
        qty: Number(c.quantity),
        unitCost: Number(c.component.costAvg),
      }));
    }
    return { line: l, variant: v, parts, variantId: v?.id ?? null, qty: l.qty };
  });
  const needs = stockNeeds(resolved);
  const skuOf = new Map(variants.map((v) => [v.id, v.sku]));
  for (const r of resolved) for (const part of r.parts ?? []) skuOf.set(part.variantId, part.sku);
  const channel = await db.channel.upsert({
    where: { shopId_code: { shopId: currentShopId(), code: 'store' } },
    create: { code: 'store', type: 'store', name: 'Bán trực tiếp' },
    update: {},
  });
  const t = posTotals(p, mode);
  // Selling more than what is left (shelf minus what other open deliveries hold) needs a deliberate "sell anyway".
  if (!input.allowOversell) {
    const avail = await availability(db, warehouse.id, [...needs.keys()]);
    const short = [...needs]
      .map(([id, q]) => ({ id, q, a: avail.get(id)?.available ?? 0 }))
      .filter(({ q, a }) => q > a)
      .map(({ id, q, a }) => `${skuOf.get(id)} cần ${q}, còn bán ${Math.max(a, 0)}`);
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
              create: resolved.map(({ line: l, variant: v, parts }, i) => ({
                variantId: v?.id ?? null,
                sku: (v?.sku ?? 'TUY-CHON').slice(0, 64),
                name: (l.name || (v ? variantLabel(v) : 'Thành phẩm theo yêu cầu')).slice(0, 255),
                qty: new Prisma.Decimal(l.qty),
                unitPrice: big(l.price),
                discount: 0n,
                price: big(l.price),
                lineTotal: big(l.price * l.qty),
                costSnapshot: parts ? big(partsCost(parts)) : (v?.costAvg ?? null),
                sort: i,
                ...(parts
                  ? {
                      components: {
                        create: parts.map((c) => ({
                          variantId: c.variantId,
                          sku: c.sku.slice(0, 64),
                          name: c.name,
                          qty: new Prisma.Decimal(c.qty),
                          unitCost: big(c.unitCost),
                        })),
                      },
                    }
                  : {}),
              })),
            },
          },
          select: { id: true, code: true },
        });
        // a delivery keeps its stock on the shelf until the parcel is handed over ("Giao cho ĐVVC")
        if (retail)
          await applyMovements(
            tx,
            [...needs].map(([variantId, q]) => ({
              warehouseId: warehouse.id,
              variantId,
              qtyDelta: -q,
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
  const order = await db.order.findFirst({
    where: { code },
    include: { lines: { include: { components: true } } },
  });
  if (!order) throw new PosError('Không tìm thấy đơn', 404);
  if (order.source !== 'pos') throw new PosError('Chỉ đơn bán tại quầy mới có các nút xử lý này', 409);
  const kind = fulfillmentOf(order);
  const action = posActions(kind, order.status).find((a) => a.key === key);
  if (!action) throw new PosError('Đơn đã đổi trạng thái, không còn thao tác này (tải lại trang)', 409);
  const wasHolding = order.stockAppliedAt !== null;
  const willHold = holdsStock(kind, action.to);
  // made-to-order lines move their materials, the others their own product
  const needs = stockNeeds(
    order.lines.map((l) => ({
      variantId: l.variantId,
      qty: Number(l.qty),
      parts: l.components.length
        ? l.components.map((c) => ({
            variantId: c.variantId,
            sku: c.sku,
            name: c.name,
            qty: Number(c.qty),
            unitCost: 0,
          }))
        : null,
    })),
  );
  await withLedgerTx(db, async (tx) => {
    if (wasHolding && !willHold)
      await applyMovements(
        tx,
        [...needs].map(([variantId, q]) => ({
          warehouseId: order.warehouseId,
          variantId,
          qtyDelta: q,
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
        [...needs].map(([variantId, q]) => ({
          warehouseId: order.warehouseId,
          variantId,
          qtyDelta: -q,
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
