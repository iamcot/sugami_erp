/**
 * Writes to Pancake (trial phase): create one product with its variations, set stock per warehouse.
 * Everything here is explicit and one product at a time; nothing runs on a schedule.
 */
import type { PancakeClient } from './client.js';
import { Variation } from './schemas.js';

export interface PushVariantInput {
  sku: string;
  barcode: string | null;
  optionValues: string[];
  /** VND. */
  price: number;
  /** VND. */
  cost: number;
  /** Stock to create the variation with. */
  onHand: number;
}

export interface PushProductInput {
  code: string;
  name: string;
  description: string | null;
  options: string[];
  variants: PushVariantInput[];
}

export interface PancakeWarehouse {
  id: string;
  name?: string | null;
}

/**
 * Body of `POST /shops/{id}/products`. Seller codes go in `custom_id` (product code, SKU), which is
 * also what Pancake uses to link marketplace listings (`linked_variation_custom_id`).
 */
export function buildCreateProductBody(p: PushProductInput, warehouseId: string) {
  return {
    product: {
      name: p.name,
      type: 'product',
      custom_id: p.code,
      ...(p.description ? { note_product: p.description } : {}),
      ...(p.options.length
        ? {
            product_attributes: p.options.map((name, i) => ({
              name,
              values: [...new Set(p.variants.map((v) => v.optionValues[i]).filter((x): x is string => !!x))],
            })),
          }
        : {}),
      variations: p.variants.map((v) => ({
        custom_id: v.sku,
        ...(v.barcode ? { barcode: v.barcode } : {}),
        fields: p.options.map((name, i) => ({ name, value: v.optionValues[i] ?? '' })),
        retail_price: v.price,
        price_at_counter: v.price,
        last_imported_price: v.cost,
        variations_warehouses: [{ warehouse_id: warehouseId, remain_quantity: Math.max(0, v.onHand) }],
      })),
    },
  };
}

export async function listWarehouses(client: PancakeClient): Promise<PancakeWarehouse[]> {
  const res = await client.get<{ data?: PancakeWarehouse[] }>('/warehouses');
  return res.data ?? [];
}

/** Variations on Pancake whose `custom_id` or `display_id` is one of `skus`, keyed by SKU. */
export async function findVariationsBySku(
  client: PancakeClient,
  skus: string[],
): Promise<Map<string, Variation>> {
  const want = new Set(skus);
  const all: Variation[] = [];
  const perProduct = new Map<string, number>();
  for await (const raw of client.paginate<unknown>('/products/variations')) {
    const v = Variation.parse(raw);
    if (v.is_removed) continue;
    all.push(v);
    perProduct.set(v.product_id, (perProduct.get(v.product_id) ?? 0) + 1);
  }
  const found = new Map<string, Variation>();
  for (const v of all) {
    // A product imported from a KiotViet row has one variation (display id "1") and carries the
    // KiotViet code on the product itself, so a single-variation product also answers to that code.
    const own = perProduct.get(v.product_id) === 1 ? v.product?.display_id : undefined;
    const sku = [v.custom_id, v.display_id, own].find((c): c is string => !!c && want.has(c));
    if (sku && !found.has(sku)) found.set(sku, v);
  }
  return found;
}

export async function createProduct(
  client: PancakeClient,
  p: PushProductInput,
  warehouseId: string,
): Promise<void> {
  await client.post('/products', buildCreateProductBody(p, warehouseId));
}

/** Set the real inventory of one variation in one warehouse (not just the sellable quantity). */
export async function setStock(
  client: PancakeClient,
  variationId: string,
  warehouseId: string,
  quantity: number,
): Promise<void> {
  await client.post('/variations/update_quantity', {
    is_actual_remain_quantity: true,
    variations_warehouses: [
      { variation_id: variationId, warehouse_id: warehouseId, remain_quantity: Math.max(0, quantity) },
    ],
  });
}
