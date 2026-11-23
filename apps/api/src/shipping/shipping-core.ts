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

export function groupOf(q: Pick<AllingoQuote, 'partner' | 'estimated_minutes'>): QuoteGroup {
  const id = q.partner.id.toLowerCase();
  if (ON_DEMAND.has(id) || [...ON_DEMAND].some((p) => id.startsWith(p))) return 'fast';
  return q.estimated_minutes != null && q.estimated_minutes <= 360 ? 'fast' : 'standard';
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
  available: boolean;
  unavailableReason: string | null;
  cheapest: boolean;
  fastest: boolean;
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
    available: q.available !== false,
    unavailableReason: q.available === false ? (q.error_code ?? 'Không khả dụng') : null,
    cheapest: false,
    fastest: false,
  }));
  for (const group of ['standard', 'fast'] as const) {
    const ok = rows.filter((r) => r.group === group && r.available);
    if (ok.length > 1) {
      const minPrice = Math.min(...ok.map((r) => r.price));
      ok.forEach((r) => (r.cheapest = r.price === minPrice));
      const withEta = ok.filter((r) => r.etaMinutes != null);
      if (withEta.length > 1) {
        const minEta = Math.min(...withEta.map((r) => r.etaMinutes!));
        withEta.forEach((r) => (r.fastest = r.etaMinutes === minEta));
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
