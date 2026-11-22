import type { ExternalOrder, ExternalProduct, ExternalVariant } from '@sugami/channels-core';
import type { Order, Variation } from './schemas.js';

/**
 * Pancake timestamps are UTC without a zone ("2020-05-12T04:51:42", sometimes with microseconds).
 */
export function parsePancakeTime(s: string): Date {
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`;
  const d = new Date(iso.replace(/(\.\d{3})\d+/, '$1'));
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid Pancake time: ${s}`);
  return d;
}

/** Pancake order status code → Sugami OrderStatus. */
export const ORDER_STATUS: Record<number, string> = {
  0: 'new', // New
  17: 'new', // Waiting for confirmation
  1: 'confirmed',
  11: 'confirmed', // Restocking
  20: 'confirmed', // Purchased
  12: 'packing', // Wait for printing
  13: 'packing', // Printed
  8: 'packing',
  9: 'packing', // Waiting for pick up
  2: 'shipped',
  4: 'shipped', // Returning: still in transit until it is back
  3: 'delivered', // Received
  15: 'delivered', // Partial return
  16: 'completed', // Collected money
  5: 'returned',
  6: 'cancelled',
  7: 'cancelled', // Deleted recently
};

/**
 * Pancake marketplace_id → Sugami channel code. Only Shopee (-3) is shown in the docs; the others
 * are confirmed with `pnpm pancake:probe` on the real shop and added here.
 */
export const MARKETPLACES: Record<string, string> = {
  '-3': 'shopee',
  // Appeared when the TikTok Shop account was connected (probe, 2026-11-22); confirm with a real TikTok order.
  '-9': 'tiktok',
};

export function channelOfOrder(o: Order): string {
  if (o.marketplace_id) return MARKETPLACES[o.marketplace_id] ?? `pancake:${o.marketplace_id}`;
  if (o.page_id) return 'facebook';
  return 'store';
}

/**
 * SKU of a variation: seller code (`custom_id`, set when Sugami pushes a product), else display code
 * (KiotViet code after import), else barcode, else Pancake id.
 */
export const variationSku = (v: {
  custom_id?: string | null;
  display_id?: string | null;
  barcode?: string | null;
  id?: string;
}) => v.custom_id || v.display_id || v.barcode || v.id || '';

export function toExternalVariant(v: Variation): ExternalVariant {
  const stock: Record<string, number> = {};
  for (const w of v.variations_warehouses ?? [])
    stock[w.warehouse_id] = w.actual_remain_quantity ?? w.remain_quantity ?? 0;
  return {
    externalId: v.id,
    sku: variationSku(v),
    barcode: v.barcode ?? undefined,
    name: v.product?.name ?? variationSku(v),
    optionValues: (v.fields ?? []).map((f) => f.value ?? '').filter(Boolean),
    price: v.retail_price ?? undefined,
    stock,
    imageUrls: v.images ?? undefined,
  };
}

/** Group a flat variation list into products, keeping first-seen order. */
export function groupVariations(variations: Variation[]): ExternalProduct[] {
  const products = new Map<string, ExternalProduct>();
  for (const v of variations) {
    if (v.is_removed) continue;
    let p = products.get(v.product_id);
    if (!p) {
      p = {
        externalId: v.product_id,
        code: v.product?.display_id || v.product?.custom_id || variationSku(v),
        name: v.product?.name ?? variationSku(v),
        isActive: false,
        variants: [],
      };
      products.set(v.product_id, p);
    }
    p.variants.push(toExternalVariant(v));
    if (!v.is_hidden) p.isActive = true;
    if (v.updated_at) {
      const t = parsePancakeTime(v.updated_at);
      if (!p.modifiedAt || t > p.modifiedAt) p.modifiedAt = t;
    }
  }
  return [...products.values()];
}

const unitPrice = (item: Order['items'][number]) => {
  const price = item.variation_info?.retail_price ?? 0;
  const d = item.discount_each_product ?? 0;
  return Math.max(0, Math.round(item.is_discount_percent ? price * (1 - d / 100) : price - d));
};

const unmasked = (v: string | null | undefined) => {
  const t = v?.trim();
  return t && !t.includes('*') ? t : undefined;
};

/**
 * Buyer of an order. Shopee shows the buyer's nickname in `customer.username`; the billing name and
 * phone are masked ("T******u"), so masked values are dropped.
 */
export function buyerOf(o: Order): { name: string; phone?: string } | undefined {
  const name = unmasked(o.customer?.username) ?? unmasked(o.customer?.name) ?? unmasked(o.bill_full_name);
  if (!name) return undefined;
  const phone = [o.bill_phone_number, ...(o.customer?.phone_numbers ?? [])]
    .map((p) => unmasked(p)?.replace(/[\s.()-]/g, ''))
    .find((p): p is string => !!p && p.length >= 6);
  return { name, ...(phone ? { phone } : {}) };
}

/** Unix seconds (Shopee), milliseconds, or an ISO string → Date; undefined when unreadable. */
export function parseDeadline(v: number | string | null | undefined): Date | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : /^\d+(\.\d+)?$/.test(v) ? Number(v) : NaN;
  const d = Number.isNaN(n) ? new Date(v) : new Date(n < 1e11 ? n * 1000 : n);
  const y = d.getUTCFullYear();
  return Number.isNaN(d.getTime()) || y < 2000 || y > 2100 ? undefined : d;
}

/** Fee breakdown: only numeric entries, e.g. { commission_fee: 12000, service_fee: 3000 }. */
export function feeDetailOf(o: Order): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o.advanced_platform_fee ?? {})) {
    const n = typeof v === 'string' ? Number(v) : v;
    if (typeof n === 'number' && Number.isFinite(n) && n !== 0) out[k] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Pancake order → channel-neutral order. The buyer is only the nickname (and phone when unmasked); the shipping address is kept as text for the order. */
export function toExternalOrder(o: Order): ExternalOrder {
  const status = ORDER_STATUS[o.status];
  if (!status) throw new Error(`Unknown Pancake order status ${o.status} on order ${o.id}`);
  return {
    externalId: String(o.id),
    code: `PC${o.display_id ?? o.id}`,
    marketplaceCode: o.invoice_info_list?.find((i) => i.order_sn)?.order_sn ?? undefined,
    saleChannel: channelOfOrder(o),
    status,
    currency: o.order_currency ?? undefined,
    customer: buyerOf(o),
    carrier: o.partner?.partner_name?.trim() || undefined,
    trackingNo: o.partner?.extend_code?.trim() || undefined,
    orderedAt: parsePancakeTime(o.inserted_at),
    shipByAt:
      parseDeadline(o.additional_info?.ship_by_date) ?? parseDeadline(o.additional_info?.delivery_deadline),
    shipAddress: o.shipping_address?.full_address?.trim() || undefined,
    shipProvince: o.shipping_address?.province_name?.trim() || undefined,
    feeDetail: feeDetailOf(o),
    total: o.total_price ?? 0,
    shippingFee: o.shipping_fee ?? undefined,
    platformFee: o.fee_marketplace ?? undefined,
    lines: o.items.map((i) => ({
      externalVariantId: i.variation_id ?? undefined,
      sku: variationSku({
        custom_id: i.variation_info?.custom_id,
        display_id: i.variation_info?.display_id,
        barcode: i.variation_info?.barcode,
        id: i.variation_id ?? undefined,
      }),
      name: i.variation_info?.name ?? '',
      quantity: i.quantity,
      unitPrice: i.is_bonus_product ? 0 : unitPrice(i),
    })),
  };
}
