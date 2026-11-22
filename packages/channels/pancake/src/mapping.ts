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
 * are confirmed with `pnpm --filter @sugami/channels-pancake probe` on the real shop and added here.
 */
export const MARKETPLACES: Record<string, string> = { '-3': 'shopee' };

export function channelOfOrder(o: Order): string {
  if (o.marketplace_id) return MARKETPLACES[o.marketplace_id] ?? `pancake:${o.marketplace_id}`;
  if (o.page_id) return 'facebook';
  return 'store';
}

/** SKU of a variation: its display code (KiotViet code after import), else barcode, else Pancake id. */
export const variationSku = (v: { display_id?: string | null; barcode?: string | null; id?: string }) =>
  v.display_id || v.barcode || v.id || '';

export function toExternalVariant(v: Variation): ExternalVariant {
  const stock: Record<string, number> = {};
  for (const w of v.variations_warehouses ?? []) stock[w.warehouse_id] = w.actual_remain_quantity ?? w.remain_quantity ?? 0;
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

/** Pancake order → channel-neutral order. No customer data is copied. */
export function toExternalOrder(o: Order): ExternalOrder {
  const status = ORDER_STATUS[o.status];
  if (!status) throw new Error(`Unknown Pancake order status ${o.status} on order ${o.id}`);
  return {
    externalId: String(o.id),
    code: `PC${o.display_id ?? o.id}`,
    marketplaceCode: o.invoice_info_list?.find((i) => i.order_sn)?.order_sn ?? undefined,
    saleChannel: channelOfOrder(o),
    status,
    orderedAt: parsePancakeTime(o.inserted_at),
    total: o.total_price ?? 0,
    shippingFee: o.shipping_fee ?? undefined,
    platformFee: o.fee_marketplace ?? undefined,
    lines: o.items.map((i) => ({
      sku: variationSku({ display_id: i.variation_info?.display_id, barcode: i.variation_info?.barcode, id: i.variation_id ?? undefined }),
      name: i.variation_info?.name ?? '',
      quantity: i.quantity,
      unitPrice: i.is_bonus_product ? 0 : unitPrice(i),
    })),
  };
}
