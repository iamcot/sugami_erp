/**
 * Lenient zod schemas for the Pancake fields Sugami reads. Unknown fields pass through, missing
 * optional fields are fine: the docs show only part of each object (Order has 119 attributes).
 * Customer details (names, phones, addresses) are deliberately not read.
 */
import { z } from 'zod';

const int = z.number().nullish();
const str = z.string().nullish();

export const VariationWarehouse = z.looseObject({
  warehouse_id: z.string(),
  remain_quantity: int,
  actual_remain_quantity: int,
  available_quantity: int,
});

export const Variation = z.looseObject({
  id: z.string(),
  display_id: str,
  custom_id: str,
  product_id: z.string(),
  barcode: str,
  retail_price: int,
  last_imported_price: int,
  is_hidden: z.boolean().nullish(),
  is_removed: z.boolean().nullish(),
  updated_at: str,
  fields: z.array(z.looseObject({ name: str, value: str })).nullish(),
  images: z.array(z.string()).nullish(),
  variations_warehouses: z.array(VariationWarehouse).nullish(),
  product: z
    .looseObject({ name: str, display_id: str, custom_id: str, is_published: z.boolean().nullish() })
    .nullish(),
});
export type Variation = z.infer<typeof Variation>;

export const OrderItem = z.looseObject({
  variation_id: str,
  quantity: z.number(),
  discount_each_product: int,
  is_discount_percent: z.boolean().nullish(),
  is_bonus_product: z.boolean().nullish(),
  variation_info: z
    .looseObject({ name: str, display_id: str, custom_id: str, barcode: str, retail_price: int })
    .nullish(),
});

export const Order = z.looseObject({
  id: z.union([z.number(), z.string()]),
  display_id: z.union([z.number(), z.string()]).nullish(),
  status: z.number(),
  inserted_at: z.string(),
  updated_at: str,
  marketplace_id: str,
  order_sources: z.union([z.string(), z.number()]).nullish(),
  is_from_ecommerce: z.boolean().nullish(),
  page_id: str,
  warehouse_id: str,
  total_price: int,
  total_discount: int,
  shipping_fee: int,
  fee_marketplace: int,
  order_currency: str,
  items: z.array(OrderItem).default([]),
  invoice_info_list: z.array(z.looseObject({ order_sn: str })).nullish(),
  partner: z.looseObject({ extend_code: str, partner_name: str, partner_status: str }).nullish(),
});
export type Order = z.infer<typeof Order>;
