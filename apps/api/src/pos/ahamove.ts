import { removeShippingFee } from './shipping-fee-charge.js';
import {
  ahamoveFromEnv,
  AhamoveError,
  ahamoveStage,
  ahamoveStatusText,
  type AhamoveClient,
  type AhamoveExtra,
  type AhamoveRequestChoice,
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
  if (!client || !pickupFromEnv())
    throw new PosError('Chưa cấu hình Ahamove (xem docs/ban-hang-tai-quay.md)');
  return client;
}
/** For tests. */
export function setAhamoveClient(c: AhamoveClient | null | undefined) {
  client = c;
}

const SERVICES_TTL = 60 * 60_000;
let servicesCache: { at: number; list: AhamoveService[] } | null = null;

/** Every service Ahamove offers in the shop's city (cached for an hour). */
export async function allServices(c: AhamoveClient = getClient()): Promise<AhamoveService[]> {
  if (servicesCache && Date.now() - servicesCache.at < SERVICES_TTL) return servicesCache.list;
  const list = await c.services(process.env.AHAMOVE_CITY_ID || 'SGN');
  servicesCache = { at: Date.now(), list };
  return list;
}

/**
 * Services to price: the ids chosen in Cài đặt → Vận chuyển, else AHAMOVE_SERVICES from .env, else all.
 * A chosen list that matches nothing falls back to all so the price table is never empty by accident.
 */
async function services(c: AhamoveClient, chosen: string[] = []): Promise<AhamoveService[]> {
  const all = await allServices(c);
  const only = chosen.length
    ? chosen
    : (process.env.AHAMOVE_SERVICES ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  const list = only.length ? all.filter((s) => only.includes(s.id)) : all;
  return list.length ? list : all;
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
  summary: string | null;
  details: string | null;
  maxCod: number | null;
  maxKg: number | null;
  extras: AhamoveExtra[];
}

/** Prices of every Ahamove service for a trip from the shop to `dropoff`, cheapest first (refused ones last). */
export async function quoteStops(
  dropoff: AhamoveStop,
  chosen: string[] = [],
  extras: Record<string, AhamoveRequestChoice[]> = {},
): Promise<QuoteRow[]> {
  const c = getClient();
  try {
    const list = await services(c, chosen);
    if (!list.length) throw new PosError('Ahamove chưa có dịch vụ nào ở khu vực này');
    const quotes = await c.quote(
      pickupFromEnv()!,
      dropoff,
      list.map((s) => s.id),
      extras,
    );
    const byId = new Map(list.map((s) => [s.id, s]));
    // a service Ahamove left out of its answer still shows, as unavailable, so nothing vanishes silently
    for (const s of list)
      if (!quotes.some((q) => q.serviceId === s.id))
        quotes.push({
          serviceId: s.id,
          fee: 0,
          distanceKm: null,
          durationMinutes: null,
          breakdown: [],
          error: 'Ahamove không báo giá dịch vụ này cho tuyến này',
        });
    return quotes
      .map((q) => {
        const s = byId.get(q.serviceId);
        return {
          ...q,
          name: s?.name ?? q.serviceId,
          summary: s?.summary ?? null,
          details: s?.details ?? null,
          maxCod: s?.maxCod ?? null,
          maxKg: s?.maxKg ?? null,
          extras: s?.extras ?? [],
        };
      })
      .sort((a, b) => Number(!!a.error) - Number(!!b.error) || a.fee - b.fee);
  } catch (err) {
    return explain(err);
  }
}

/** Prices of every Ahamove service for this order's trip. */
export async function quoteOrder(db: PrismaClient, code: string, chosen: string[] = []): Promise<QuoteRow[]> {
  return quoteStops(dropoffOf(await loadOrder(db, code)), chosen);
}

/** The receiver of a sale still on the counter screen (no order yet) as an Ahamove stop. */
export function dropoffOfReceiver(r: {
  name: string;
  phone: string;
  address: string;
  ward?: string | null;
  province?: string | null;
}): AhamoveStop {
  const full = [r.address, r.ward, r.province].filter(Boolean).join(', ');
  return {
    address: /việt nam$/i.test(full) ? full : `${full}, Việt Nam`,
    name: r.name || 'Khách',
    mobile: r.phone,
  };
}

/**
 * Book the driver. The parcel is NOT handed over yet: the order stays "Đang đóng gói" with the trip saved on it,
 * and moves to "Đang giao" (stock leaves) only when Ahamove reports the driver has picked the parcel up.
 * `scheduleAt` books for a later time.
 */
export async function bookOrder(
  db: PrismaClient,
  code: string,
  serviceId: string,
  _userId?: string,
  scheduleAt?: Date | null,
  requests: AhamoveRequestChoice[] = [],
) {
  const o = await loadOrder(db, code);
  if (!posActions(fulfillmentOf(o), o.status).some((a) => a.key === 'ship'))
    throw new PosError('Đơn chưa ở bước Đang đóng gói nên chưa gọi Ahamove được', 409);
  if (o.carrier === AHAMOVE && o.trackingNo && !/đã hủy/.test(o.shippingStatus ?? ''))
    throw new PosError('Đơn này đã có chuyến Ahamove, hủy chuyến cũ trước', 409);
  const c = getClient();
  let booked: Awaited<ReturnType<AhamoveClient['createOrder']>>;
  try {
    booked = await c.createOrder({
      serviceId,
      pickup: pickupFromEnv()!,
      dropoff: dropoffOf(o),
      payment: process.env.AHAMOVE_PAYMENT === 'BALANCE' ? 'BALANCE' : 'CASH',
      note: o.code,
      ...(requests.length ? { requests } : {}),
      ...(scheduleAt ? { orderTime: Math.floor(scheduleAt.getTime() / 1000) } : {}),
    });
  } catch (err) {
    return explain(err);
  }
  await db.order.update({
    where: { code },
    data: {
      carrier: AHAMOVE,
      trackingNo: booked.orderId,
      trackingUrl: booked.sharedLink,
      shippingStatus: scheduleAt
        ? `Ahamove: hẹn ${scheduleAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })}`
        : ahamoveStatusText(booked.status),
      ...(booked.fee > 0 ? { shippingFee: BigInt(booked.fee) } : {}),
    },
  });
  return { orderId: booked.orderId, status: booked.status, sharedLink: booked.sharedLink, fee: booked.fee };
}

/** Moves a Sugami order along with what Ahamove reports; safe to call repeatedly with the same data. */
export async function applyAhamoveStatus(
  db: PrismaClient,
  ahamoveOrderId: string,
  st: AhamoveOrder,
  userId?: string,
) {
  const o = await db.order.findFirst({ where: { carrier: AHAMOVE, trackingNo: ahamoveOrderId } });
  if (!o) return { matched: false as const };
  const text = ahamoveStatusText(st.status, st.sub_status);
  const stage = ahamoveStage(st.status);
  const open = o.status === 'packing' || o.status === 'shipped';
  const data: Record<string, unknown> = {};
  if (o.shippingStatus !== text && open) data.shippingStatus = text;
  if (stage === 'cancelled' && open)
    data.shippingStatus =
      `${text}${st.cancel_comment ? ` (${st.cancel_comment})` : ''}: gọi lại hoặc đổi cách giao`.slice(
        0,
        255,
      );
  if (st.shared_link && !o.trackingUrl) data.trackingUrl = st.shared_link;
  if (Object.keys(data).length) await db.order.update({ where: { id: o.id }, data });
  const returning = /hoàn hàng/.test(text);
  // the driver has the parcel: hand it over now (stock leaves)
  if ((stage === 'delivering' || stage === 'delivered') && o.status === 'packing')
    await runPosAction(db, o.code, 'ship', userId, { carrier: AHAMOVE, trackingNo: ahamoveOrderId }).catch(
      () => undefined,
    );
  if (stage === 'delivered' && !returning && (o.status === 'packing' || o.status === 'shipped'))
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
    return {
      status: st.status ?? null,
      driver: st.supplier_name ?? null,
      text: ahamoveStatusText(st.status, st.sub_status),
    };
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
  await removeShippingFee(db, o.id);
  // still packing: free the order so another trip can be booked; already handed over: keep the record
  await db.order.update({
    where: { code },
    data:
      o.status === 'packing'
        ? { carrier: null, trackingNo: null, trackingUrl: null, shippingStatus: null }
        : { shippingStatus: 'Ahamove: đã hủy chuyến (hoàn hàng hoặc gọi lại)' },
  });
  return { ok: true };
}

/**
 * "Tìm tài xế ngay" for a trip booked for later: cancel it and book the same service for now.
 * The service is read back from Ahamove; nothing is cancelled unless the old trip can be read.
 */
export async function dispatchNow(db: PrismaClient, code: string) {
  const o = await loadOrder(db, code);
  if (o.carrier !== AHAMOVE || !o.trackingNo) throw new PosError('Đơn này không giao bằng Ahamove', 409);
  const c = getClient();
  let serviceId: string | undefined;
  try {
    serviceId = (await c.getOrder(o.trackingNo)).service_id;
  } catch (err) {
    return explain(err);
  }
  if (!serviceId)
    throw new PosError('Ahamove không trả dịch vụ của chuyến cũ, hãy hủy chuyến rồi chọn lại', 409);
  // a trip Ahamove already cancelled needs no second cancel
  if (!/đã hủy/.test(o.shippingStatus ?? '')) {
    try {
      await c.cancelOrder(o.trackingNo, 'Tìm tài xế ngay');
    } catch (err) {
      return explain(err);
    }
  }
  await db.order.update({
    where: { code },
    data: { carrier: null, trackingNo: null, trackingUrl: null, shippingStatus: null },
  });
  return bookOrder(db, code, serviceId);
}
