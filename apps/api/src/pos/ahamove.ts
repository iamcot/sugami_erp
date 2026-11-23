import {
  ahamoveFromEnv,
  AhamoveError,
  ahamoveStage,
  ahamoveStatusText,
  type AhamoveClient,
  type AhamoveOrder,
  type AhamoveQuote,
  type AhamoveService,
  type AhamoveStop,
} from '@sugami/channels-ahamove';
import type { PrismaClient } from '@sugami/db';
import { fulfillmentOf, posActions } from './pos-flow.js';
import { PosError, runPosAction } from './pos-orders.js';

export const AHAMOVE = 'Ahamove';

/** Pickup point (the shop) from the environment; Ahamove needs a real address to price a trip. */
export function pickupFromEnv(env: NodeJS.ProcessEnv = process.env): AhamoveStop | null {
  const { AHAMOVE_PICKUP_NAME: name, AHAMOVE_PICKUP_PHONE: mobile, AHAMOVE_PICKUP_ADDRESS: address } = env;
  if (!name || !mobile || !address) return null;
  const lat = Number(env.AHAMOVE_PICKUP_LAT);
  const lng = Number(env.AHAMOVE_PICKUP_LNG);
  return { name, mobile, address, ...(lat && lng ? { lat, lng } : {}) };
}

export function ahamoveConfigured(): boolean {
  return Boolean(process.env.AHAMOVE_API_KEY && process.env.AHAMOVE_MOBILE && pickupFromEnv());
}

let client: AhamoveClient | null | undefined;
function getClient(): AhamoveClient {
  if (client === undefined) client = ahamoveFromEnv();
  if (!client || !pickupFromEnv()) throw new PosError('Chưa cấu hình Ahamove (xem docs/ban-hang-tai-quay.md)');
  return client;
}
/** For tests. */
export function setAhamoveClient(c: AhamoveClient | null | undefined) {
  client = c;
}

const SERVICES_TTL = 60 * 60_000;
let servicesCache: { at: number; list: AhamoveService[] } | null = null;

/** Services offered in the shop's city. AHAMOVE_SERVICES (comma-separated ids) narrows the list. */
async function services(c: AhamoveClient): Promise<AhamoveService[]> {
  if (servicesCache && Date.now() - servicesCache.at < SERVICES_TTL) return servicesCache.list;
  const all = await c.services(process.env.AHAMOVE_CITY_ID || 'SGN');
  const only = (process.env.AHAMOVE_SERVICES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const list = only.length ? all.filter((s) => only.includes(s.id)) : all;
  servicesCache = { at: Date.now(), list };
  return list;
}

const MAP_ERRORS: Record<string, string> = {
  INVALID_DELIVERY_AREA: 'Địa chỉ nhận ngoài vùng Ahamove phục vụ',
  INVALID_PICKUP_AREA: 'Địa chỉ lấy hàng ngoài vùng Ahamove phục vụ',
  NOT_ENOUGH_CREDIT: 'Tài khoản Ahamove không đủ tiền',
  INVALID_MAX_COD: 'Tiền thu hộ vượt mức tối đa của Ahamove',
  DUPLICATE_TRACKING_NUMBER: 'Đơn này đã được gọi Ahamove rồi',
  INTERNAL_SERVER_ERROR: 'Ahamove không xác định được khu vực của địa chỉ, kiểm tra lại địa chỉ nhận',
};

/** Turns an Ahamove failure into a message the seller can act on. */
export function explain(err: unknown): never {
  if (err instanceof AhamoveError) {
    const known = err.code ? MAP_ERRORS[err.code] : undefined;
    throw new PosError(known ?? `Ahamove báo lỗi: ${err.message.replace(/^Ahamove \w+ \S+ failed /, '')}`);
  }
  throw err;
}

async function loadOrder(db: PrismaClient, code: string) {
  const o = await db.order.findUnique({ where: { code }, include: { customer: { select: { name: true } } } });
  if (!o) throw new PosError('Không tìm thấy đơn', 404);
  if (o.source !== 'pos') throw new PosError('Chỉ đơn bán tại quầy mới gọi được Ahamove', 409);
  return o;
}

type LoadedOrder = Awaited<ReturnType<typeof loadOrder>>;

/** The receiver as Ahamove wants it. The name was saved in the order note when the order was made. */
export function dropoffOf(o: LoadedOrder): AhamoveStop {
  if (!o.shipAddress || !o.shipPhone) throw new PosError('Đơn thiếu địa chỉ hoặc số điện thoại người nhận');
  const fromNote = /^Người nhận: (.+)$/m.exec(o.internalNote ?? '')?.[1];
  return {
    address: /việt nam$/i.test(o.shipAddress) ? o.shipAddress : `${o.shipAddress}, Việt Nam`,
    name: fromNote ?? o.customer?.name ?? 'Khách',
    mobile: o.shipPhone,
    tracking_number: o.code,
    ...(o.codAmount > 0n ? { cod: Number(o.codAmount) } : {}),
  };
}

export interface QuoteRow extends AhamoveQuote {
  name: string;
}

/** Prices of every Ahamove service for this order's trip, cheapest first (refused ones last). */
export async function quoteOrder(db: PrismaClient, code: string): Promise<QuoteRow[]> {
  const o = await loadOrder(db, code);
  const c = getClient();
  try {
    const list = await services(c);
    if (!list.length) throw new PosError('Ahamove chưa có dịch vụ nào ở khu vực này');
    const quotes = await c.quote(pickupFromEnv()!, dropoffOf(o), list.map((s) => s.id));
    const names = new Map(list.map((s) => [s.id, s.name]));
    return quotes
      .map((q) => ({ ...q, name: names.get(q.serviceId) ?? q.serviceId }))
      .sort((a, b) => Number(!!a.error) - Number(!!b.error) || a.fee - b.fee);
  } catch (err) {
    return explain(err);
  }
}

/**
 * Book the driver, then hand the parcel over ("Giao cho ĐVVC": stock leaves, carrier/tracking saved).
 * The hand-over is checked first; if it still fails after booking, the booking is cancelled again.
 */
export async function bookOrder(db: PrismaClient, code: string, serviceId: string, userId?: string) {
  const o = await loadOrder(db, code);
  if (!posActions(fulfillmentOf(o), o.status).some((a) => a.key === 'ship'))
    throw new PosError('Đơn chưa ở bước Đang đóng gói nên chưa giao cho ĐVVC được', 409);
  const c = getClient();
  let booked: Awaited<ReturnType<AhamoveClient['createOrder']>>;
  try {
    booked = await c.createOrder({
      serviceId,
      pickup: pickupFromEnv()!,
      dropoff: dropoffOf(o),
      payment: process.env.AHAMOVE_PAYMENT === 'BALANCE' ? 'BALANCE' : 'CASH',
      note: o.code,
    });
  } catch (err) {
    return explain(err);
  }
  try {
    await runPosAction(db, code, 'ship', userId, { carrier: AHAMOVE, trackingNo: booked.orderId });
  } catch (err) {
    await c.cancelOrder(booked.orderId, 'Shop đổi ý').catch(() => undefined);
    throw err;
  }
  await db.order.update({
    where: { code },
    data: {
      trackingUrl: booked.sharedLink,
      shippingStatus: ahamoveStatusText(booked.status),
      ...(booked.fee > 0 ? { shippingFee: BigInt(booked.fee) } : {}),
    },
  });
  return { orderId: booked.orderId, status: booked.status, sharedLink: booked.sharedLink, fee: booked.fee };
}

/** Moves a Sugami order along with what Ahamove reports; safe to call repeatedly with the same data. */
export async function applyAhamoveStatus(db: PrismaClient, ahamoveOrderId: string, st: AhamoveOrder) {
  const o = await db.order.findFirst({ where: { carrier: AHAMOVE, trackingNo: ahamoveOrderId } });
  if (!o) return { matched: false as const };
  const text = ahamoveStatusText(st.status, st.sub_status);
  const stage = ahamoveStage(st.status);
  const data: Record<string, unknown> = {};
  if (o.shippingStatus !== text && o.status === 'shipped') data.shippingStatus = text;
  if (stage === 'cancelled' && o.status === 'shipped')
    data.shippingStatus = `${text}${st.cancel_comment ? ` (${st.cancel_comment})` : ''}: gọi lại hoặc đổi cách giao`.slice(0, 255);
  if (st.shared_link && !o.trackingUrl) data.trackingUrl = st.shared_link;
  if (Object.keys(data).length) await db.order.update({ where: { id: o.id }, data });
  if (stage === 'delivered' && o.status === 'shipped' && !/hoàn hàng/.test(text))
    await runPosAction(db, o.code, 'deliver').catch(() => undefined);
  return { matched: true as const, code: o.code, stage };
}

/** Asks Ahamove for the current state of the order's trip (for when no webhook arrived). */
export async function refreshOrder(db: PrismaClient, code: string) {
  const o = await loadOrder(db, code);
  if (o.carrier !== AHAMOVE || !o.trackingNo) throw new PosError('Đơn này không giao bằng Ahamove', 409);
  try {
    const st = await getClient().getOrder(o.trackingNo);
    await applyAhamoveStatus(db, o.trackingNo, st);
    return { status: st.status ?? null, driver: st.supplier_name ?? null, text: ahamoveStatusText(st.status, st.sub_status) };
  } catch (err) {
    return explain(err);
  }
}

/** Cancels the trip at Ahamove (only works until the driver has picked the parcel up). */
export async function cancelTrip(db: PrismaClient, code: string, reason: string) {
  const o = await loadOrder(db, code);
  if (o.carrier !== AHAMOVE || !o.trackingNo) throw new PosError('Đơn này không giao bằng Ahamove', 409);
  try {
    await getClient().cancelOrder(o.trackingNo, reason || 'Shop hủy');
  } catch (err) {
    return explain(err);
  }
  await db.order.update({
    where: { code },
    data: { shippingStatus: 'Ahamove: đã hủy chuyến (hoàn hàng hoặc gọi lại)' },
  });
  return { ok: true };
}
