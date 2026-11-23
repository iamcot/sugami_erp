import type { AllingoQuote, InquiryRequest } from '@sugami/carriers-allingo';
import type { ShippingSettings } from './shipping-settings.js';

type Box = ShippingSettings['boxes'][number];

/** Smallest box that takes the weight; the box without an upper limit when it is heavier than all. */
export function pickBox(totalGrams: number, boxes: Box[]): Box {
  const sorted = [...boxes].sort((a, b) => (a.maxGrams ?? Infinity) - (b.maxGrams ?? Infinity));
  return sorted.find((b) => b.maxGrams === null || totalGrams <= b.maxGrams) ?? sorted.at(-1)!;
}

/** Weight of an order: product weights times quantity, an assumed weight for products without one. */
export function orderWeight(
  lines: { qty: number; weightGrams: number | null }[],
  defaultItemGrams: number,
): { grams: number; unknown: number } {
  let grams = 0;
  let unknown = 0;
  for (const l of lines) {
    if (l.weightGrams && l.weightGrams > 0) grams += l.weightGrams * l.qty;
    else {
      grams += defaultItemGrams * l.qty;
      unknown += 1;
    }
  }
  return { grams: Math.round(grams), unknown };
}

/** Carrier groups of the price table: normal parcels, and same-day couriers. */
export type QuoteGroup = 'standard' | 'fast';
const ON_DEMAND = new Set([
  'ahamove',
  'grab',
  'grabexpress',
  'lalamove',
  'gsm',
  'bedelivery',
  'be',
  'greensm',
]);

export function groupOf(
  q: Pick<AllingoQuote, 'partner' | 'estimated_minutes' | 'mode'> & Partial<AllingoQuote>,
): QuoteGroup {
  // Allingo labels nothing itself; the request filter (standard / on_demand) is the authority when we used it
  if (q.mode) return q.mode === 'on_demand' ? 'fast' : 'standard';
  const id = q.partner.id.toLowerCase();
  // exact ids: a prefix test would take "bestexpress" for "be"
  if (ON_DEMAND.has(id) || id.startsWith('grab')) return 'fast';
  const name = (q.service_name ?? '').toLowerCase();
  if (/on[- ]?demand|siêu tốc|hỏa tốc|instant/.test(name)) return 'fast';
  // a range counted in days is a normal parcel whatever the minutes say
  if (/ngày|day/i.test(q.estimated_delivery_range ?? '')) return 'standard';
  return q.estimated_minutes != null && q.estimated_minutes <= 360 ? 'fast' : 'standard';
}

/** How soon a same-day courier delivers: right away, within 4 hours, or later the same day. */
export type Speed = 'instant' | 'h4' | 'today' | 'other';

/**
 * Minutes a courier needs: the carrier's own estimate when it gives one, otherwise a guess from the
 * service name ("Siêu tốc", "2H", "Nhanh"...), so couriers can be grouped and sorted by time.
 */
export function guessMinutes(q: {
  etaMinutes: number | null;
  serviceName: string;
  etaText?: string | null;
}): number | null {
  // "1-2 ngày": the carrier's own text is days, whatever minutes it also reports
  const days = /(\d+)(?:\s*-\s*(\d+))?\s*ngày/i.exec(q.etaText ?? '');
  if (days) return Number(days[2] ?? days[1]) * 1440;
  if (q.etaMinutes != null) return q.etaMinutes;
  const n = q.serviceName.toLowerCase();
  const hours = /(\d+)\s*(h\b|giờ)/.exec(n);
  if (hours) return Number(hours[1]) * 60;
  if (/siêu tốc|hỏa tốc|instant|ngay|ưu tiên|bike/.test(n)) return 45;
  if (/nhanh|express|eco|tiết kiệm/.test(n)) return 90;
  return null;
}

export function speedOf(minutes: number | null): Speed {
  if (minutes == null) return 'today';
  if (minutes <= 90) return 'instant';
  if (minutes <= 240) return 'h4';
  if (minutes <= 720) return 'today';
  return 'other';
}

export interface QuoteRow {
  serviceId: string;
  serviceName: string;
  partnerId: string;
  partnerName: string;
  group: QuoteGroup;
  price: number;
  etaText: string | null;
  etaMinutes: number | null;
  /** etaMinutes, or a guess from the service name when the carrier gives none (for grouping and sorting). */
  sortMinutes: number | null;
  speed: Speed;
  available: boolean;
  unavailableReason: string | null;
  cheapest: boolean;
  fastest: boolean;
  /** ISO time to have the parcel packed by: the carrier's next pickup, when the shop set pickup times. */
  packDeadline: string | null;
  /** A line about the service, its full terms, and the fee lines, when the carrier gives them. */
  info: string | null;
  details: string | null;
  breakdown: { name: string; value: number }[];
  /** Optional extras of the service (Ahamove: SMS, fragile, tip...). */
  extras: unknown[];
  /** What the carrier lets the seller follow: route, driver position, link, driver details. */
  tracking: string[];
}

/** Quotes as table rows: grouped, cheapest first, with "rẻ nhất" and "nhanh nhất" marked inside each group. */
export function toQuoteRows(quotes: AllingoQuote[]): QuoteRow[] {
  const rows: QuoteRow[] = quotes.map((q) => ({
    serviceId: q.service_id,
    serviceName: q.service_name,
    partnerId: q.partner.id,
    partnerName: q.partner.name,
    group: groupOf(q),
    price: q.price + (q.addons_fee ?? 0),
    etaText: q.estimated_delivery_range ?? null,
    etaMinutes: q.estimated_minutes ?? null,
    sortMinutes: null,
    speed: 'today',
    available: q.available !== false,
    unavailableReason: q.available === false ? (q.error_code ?? 'Không khả dụng') : null,
    cheapest: false,
    fastest: false,
    packDeadline: null,
    info: q.info ?? null,
    details: q.details ?? null,
    breakdown: q.breakdown ?? [],
    extras: q.extras ?? [],
    tracking: [
      q.tracking?.track_link ? 'link theo dõi' : '',
      q.tracking?.driver_location ? 'vị trí tài xế' : '',
      q.tracking?.live_route ? 'lộ trình' : '',
      q.tracking?.driver_info ? 'thông tin tài xế' : '',
    ].filter(Boolean),
  }));
  for (const r of rows) {
    r.sortMinutes = guessMinutes(r);
    r.speed = speedOf(r.sortMinutes);
  }
  for (const group of ['standard', 'fast'] as const) {
    const ok = rows.filter((r) => r.group === group && r.available);
    if (ok.length > 1) {
      const minPrice = Math.min(...ok.map((r) => r.price));
      ok.forEach((r) => (r.cheapest = r.price === minPrice));
      const withEta = ok.filter((r) => r.sortMinutes != null);
      if (withEta.length > 1) {
        const minEta = Math.min(...withEta.map((r) => r.sortMinutes!));
        withEta.forEach((r) => (r.fastest = r.sortMinutes === minEta));
      }
    }
  }
  return rows.sort((a, b) => Number(b.available) - Number(a.available) || a.price - b.price);
}

export interface ParcelInput {
  grams: number;
  box: Box;
  codAmount: number;
  payee: 'sender' | 'receiver';
  declaredValue: number;
}

export interface ReceiverInput {
  name: string;
  phone: string;
  address: string;
  ward?: string | null;
  province?: string | null;
}

/** The request body Allingo wants for both the fee quote and the shipment. */
export function buildInquiry(
  pickup: ShippingSettings['pickup'],
  to: ReceiverInput,
  parcel: ParcelInput,
): InquiryRequest {
  return {
    pickup: {
      contact_name: pickup.name,
      contact_phone: pickup.phone,
      address_line: pickup.address,
      ...(pickup.ward ? { ward: pickup.ward } : {}),
      ...(pickup.province ? { province: pickup.province } : {}),
    },
    dropoff: {
      contact_name: to.name,
      contact_phone: to.phone,
      address_line: to.address,
      ...(to.ward ? { ward: to.ward } : {}),
      ...(to.province ? { province: to.province } : {}),
    },
    package: {
      weight: Math.max(0.1, Math.round(parcel.grams) / 1000),
      length: parcel.box.lengthCm,
      width: parcel.box.widthCm,
      height: parcel.box.heightCm,
      declared_value: parcel.declaredValue,
    },
    cod_amount: parcel.codAmount,
    use_insurance: false,
    payee: parcel.payee,
    delivery_payment_method: parcel.payee === 'sender' ? 'credit' : 'cash',
  };
}

/** Missing pickup settings block shipping with a message the seller can act on. */
export function pickupProblem(p: ShippingSettings['pickup']): string | null {
  if (!p.name || !p.phone || !p.address || !p.province)
    return 'Chưa nhập điểm lấy hàng: vào Cài đặt → Vận chuyển điền tên, số điện thoại, địa chỉ và tỉnh/thành';
  return null;
}

const VN_OFFSET_MS = 7 * 3_600_000;

/** The next pickup (UTC instant) among "HH:mm" times of the day in Vietnam time; null when none are set. */
export function nextPickup(times: string[], now = new Date()): Date | null {
  const slots = times
    .map((t) => /^(\d{1,2}):(\d{2})$/.exec(t))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => Number(m[1]) * 60 + Number(m[2]))
    .sort((a, b) => a - b);
  if (!slots.length) return null;
  const local = new Date(now.getTime() + VN_OFFSET_MS);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - VN_OFFSET_MS;
  for (const day of [0, 1]) {
    for (const m of slots) {
      const at = midnight + day * 86_400_000 + m * 60_000;
      if (at > now.getTime()) return new Date(at);
    }
  }
  return null;
}

/** Keep the carriers the shop enabled in the Giao thường tab (all of them when none is enabled yet). */
export function applyCarrierSettings(
  rows: QuoteRow[],
  carriers: ShippingSettings['carriers'],
  now = new Date(),
): QuoteRow[] {
  const enabled = Object.entries(carriers).filter(([, c]) => c.enabled);
  const out = rows.filter(
    (r) => r.group !== 'standard' || enabled.length === 0 || carriers[r.partnerId]?.enabled,
  );
  for (const r of out)
    if (r.group === 'standard')
      r.packDeadline = nextPickup(carriers[r.partnerId]?.pickupTimes ?? [], now)?.toISOString() ?? null;
  return out;
}

/** Vietnamese names of Allingo add-ons (GET /addons is English). */
const ADDON_VI: Record<string, { name: string; description: string }> = {
  DOOR_TO_DOOR: { name: 'Giao tận tay', description: 'Tài xế đưa hàng tận tay người nhận' },
  SMS: { name: 'SMS báo khách', description: 'Nhắn SMS cho người nhận khi tài xế tới' },
  ROUND_TRIP: { name: 'Khứ hồi', description: 'Tài xế chờ rồi quay lại điểm lấy hàng' },
  IS_FRAGILE: { name: 'Hàng dễ vỡ', description: 'Tài xế xử lý cẩn thận' },
  THERMAL_BAG: { name: 'Túi giữ nhiệt', description: 'Cho hàng cần giữ nhiệt' },
  LARGE_THERMAL_BAG: { name: 'Túi giữ nhiệt lớn', description: 'Túi 40×40 cm cho đơn lớn' },
  ALLOW_INSPECTION: {
    name: 'Cho xem hàng (đồng kiểm)',
    description: 'Người nhận được mở kiểm hàng trước khi nhận',
  },
  TRY_ON: { name: 'Cho thử hàng', description: 'Người nhận được thử hàng trước khi nhận (gồm đồng kiểm)' },
  PARTIAL_DELIVERY: {
    name: 'Giao một phần',
    description: 'Người nhận giữ một phần hàng và trả tiền phần đó, phần còn lại hoàn về shop',
  },
};

/** What the shop may switch on for an Allingo service: the add-ons it lists that can be sent by key. */
export function addonExtras(svc: {
  addons: { key: string | null; name: string; price: number | null; carrier_option: boolean }[];
}) {
  return svc.addons
    .filter((a) => a.key && !a.carrier_option)
    .map((a) => ({
      id: a.key!,
      name: ADDON_VI[a.key!]?.name ?? a.name,
      description: ADDON_VI[a.key!]?.description ?? null,
      kind: 'bool' as const,
      price: a.price ?? 0,
      maxInput: null,
      tiers: [],
    }));
}

/** Why a service cannot take this parcel (its published limits and COD support), or null. */
export function serviceProblem(
  svc: { limits: Record<string, number | null>; supports_cod: boolean },
  parcel: { grams: number; box: { lengthCm: number; widthCm: number; heightCm: number }; codAmount: number },
): string | null {
  const kg = parcel.grams / 1000;
  const l = svc.limits;
  if (l.max_weight_kg != null && kg > l.max_weight_kg) return `Quá tải trọng ${l.max_weight_kg} kg`;
  if (l.min_weight_kg != null && kg < l.min_weight_kg) return `Dưới tải tối thiểu ${l.min_weight_kg} kg`;
  const sides = [parcel.box.lengthCm, parcel.box.widthCm, parcel.box.heightCm].sort((a, b) => b - a);
  const caps = [l.max_length_cm, l.max_width_cm, l.max_height_cm]
    .filter((x): x is number => x != null)
    .sort((a, b) => b - a);
  if (caps.length === 3 && sides.some((v, i) => v > caps[i]!)) return 'Quá kích thước cho phép của dịch vụ';
  if (l.max_total_dimension_cm != null && sides.reduce((a, b) => a + b, 0) > l.max_total_dimension_cm)
    return 'Quá tổng kích thước cho phép của dịch vụ';
  if (parcel.codAmount > 0 && !svc.supports_cod) return 'Dịch vụ không hỗ trợ thu hộ COD';
  return null;
}
