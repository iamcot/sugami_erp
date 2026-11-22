/**
 * Marketplace listings Pancake pulled from Shopee/TikTok (`GET /marketplace/products`): each listing has
 * variations with the seller SKU, price, stock and image URLs. Read-only; used to fill product images.
 */
import { z } from 'zod';
import type { PancakeClient } from './client.js';

const str = z.string().nullish();
/** Codes the shop typed can come back as numbers (e.g. 1031); keep them as text. */
const code = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v == null ? v : String(v)));

export const ListingVariation = z.looseObject({
  id: z.string(),
  name: str,
  sku: code,
  images: z.array(z.string()).nullish(),
  price: z.number().nullish(),
  quantity: z.number().nullish(),
  linked_product_custom_id: code,
  linked_variation_custom_id: code,
});

export const Listing = z.looseObject({
  id: z.string(),
  name: str,
  sku: code,
  marketplace_id: str,
  marketplace_shop_name: str,
  price: z.number().nullish(),
  linked_product_custom_id: code,
  /** Name of the Pancake product it is linked to (listing-level link, for listings without options). */
  linked_product_name: str,
  variations: z.array(ListingVariation).nullish(),
});
export type Listing = z.infer<typeof Listing>;

export async function* pullListings(client: PancakeClient): AsyncIterable<Listing> {
  for await (const raw of client.paginate<unknown>('/marketplace/products')) yield Listing.parse(raw);
}

/** Shop names such as "SuGaMi - PH" / "SuGaMi - MY" are other countries; the Vietnam shop has no suffix. */
export const isOtherCountryShop = (name: string | null | undefined) =>
  /\s-\s*(PH|MY|SG|TH|ID)\b/i.test(name ?? '');

export interface ListingImage {
  sku: string;
  images: string[];
  /** Listing title, shop name and variation price, for the report. */
  shop: string;
  price: number | null;
}

/** SKU → images from listings. Vietnam shop first; a SKU takes the first listing that has images. */
export function imagesBySku(listings: Listing[]): Map<string, ListingImage> {
  const ordered = [...listings].sort(
    (a, b) =>
      Number(isOtherCountryShop(a.marketplace_shop_name)) -
      Number(isOtherCountryShop(b.marketplace_shop_name)),
  );
  const out = new Map<string, ListingImage>();
  for (const l of ordered) {
    for (const v of l.variations ?? []) {
      const sku = (v.sku ?? '').trim() || ((l.variations?.length ?? 0) === 1 ? (l.sku ?? '').trim() : '');
      const images = (v.images ?? []).filter((u) => /^https?:\/\//.test(u));
      if (sku && images.length && !out.has(sku))
        out.set(sku, { sku, images, shop: l.marketplace_shop_name ?? '', price: v.price ?? null });
    }
  }
  return out;
}
