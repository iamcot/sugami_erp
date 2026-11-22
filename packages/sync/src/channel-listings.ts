import type { Prisma, PrismaClient } from '@sugami/db';
import { loadSkuMap } from './sku-map.js';

export interface ListingVariationInput {
  externalId: string;
  name?: string | null;
  /** Seller SKU on the marketplace. */
  sku?: string | null;
  price?: number | null;
  quantity?: number | null;
  images: string[];
  /** SKU of the product the marketplace variation is linked to in the source system (Pancake). */
  linkedCustomId?: string | null;
}

export interface ListingInput {
  source: string;
  externalId: string;
  shopName?: string | null;
  marketplaceId?: string | null;
  name: string;
  sku?: string | null;
  price?: number | null;
  variations: ListingVariationInput[];
}

export interface ListingSyncSummary {
  dryRun: boolean;
  listings: number;
  variations: number;
  /** Listings new to Sugami / already known. */
  created: number;
  updated: number;
  matched: { link: number; sku: number; barcode: number; orders: number };
  unmatched: number;
  /** Unmatched seller SKUs (sample). */
  unmatchedSkus: string[];
}

const clean = (v: string | null | undefined) => v?.trim() || undefined;

/**
 * Store marketplace listings and match each variation to a Sugami variant: by the link set in the
 * source system, by seller SKU = Sugami SKU, by seller SKU = barcode, or by a code learned from orders.
 * Listings are copies; reruns update them in place.
 */
export async function syncChannelListings(
  db: PrismaClient,
  listings: ListingInput[],
  opts: { dryRun: boolean },
): Promise<ListingSyncSummary> {
  const summary: ListingSyncSummary = {
    dryRun: opts.dryRun,
    listings: listings.length,
    variations: listings.reduce((a, l) => a + l.variations.length, 0),
    created: 0,
    updated: 0,
    matched: { link: 0, sku: 0, barcode: 0, orders: 0 },
    unmatched: 0,
    unmatchedSkus: [],
  };
  const sellerSku = (l: ListingInput, v: ListingVariationInput) =>
    clean(v.sku) ?? (l.variations.length === 1 ? clean(l.sku) : undefined);

  const codes = [
    ...new Set(
      listings.flatMap((l) =>
        l.variations.flatMap((v) =>
          [clean(v.linkedCustomId), sellerSku(l, v)].filter((c): c is string => !!c),
        ),
      ),
    ),
  ];
  const bySku = new Map<string, string>();
  const byBarcode = new Map<string, string>();
  for (let i = 0; i < codes.length; i += 400) {
    const chunk = codes.slice(i, i + 400);
    const rows = await db.variant.findMany({
      where: { OR: [{ sku: { in: chunk } }, { barcode: { in: chunk } }] },
      select: { id: true, sku: true, barcode: true },
    });
    for (const r of rows) {
      bySku.set(r.sku, r.id);
      if (r.barcode) byBarcode.set(r.barcode, r.id);
    }
  }
  const learned = await loadSkuMap(db, codes);
  const match = (l: ListingInput, v: ListingVariationInput) => {
    const link = clean(v.linkedCustomId);
    const sku = sellerSku(l, v);
    if (link && bySku.has(link)) return { id: bySku.get(link)!, by: 'link' as const };
    if (sku && bySku.has(sku)) return { id: bySku.get(sku)!, by: 'sku' as const };
    if (sku && byBarcode.has(sku)) return { id: byBarcode.get(sku)!, by: 'barcode' as const };
    if (sku && learned.has(sku)) return { id: learned.get(sku)!, by: 'orders' as const };
    return undefined;
  };

  const now = new Date();
  for (const l of listings) {
    const shopKey = l.shopName ?? '';
    const where = { source_shopKey_externalId: { source: l.source, shopKey, externalId: l.externalId } };
    const data = {
      marketplaceId: l.marketplaceId ?? null,
      name: l.name.slice(0, 512),
      sku: clean(l.sku)?.slice(0, 128) ?? null,
      price: l.price == null ? null : BigInt(Math.round(l.price)),
      imageUrl: l.variations.flatMap((v) => v.images)[0]?.slice(0, 1000) ?? null,
      syncedAt: now,
    };
    const had = await db.channelListing.findUnique({ where, select: { id: true } });
    if (had) summary.updated++;
    else summary.created++;
    let listingId: string | undefined;
    if (!opts.dryRun) {
      listingId = (
        await db.channelListing.upsert({
          where,
          create: { source: l.source, shopKey, externalId: l.externalId, ...data },
          update: data,
          select: { id: true },
        })
      ).id;
    }
    for (const v of l.variations) {
      const m = match(l, v);
      if (m) summary.matched[m.by]++;
      else {
        summary.unmatched++;
        const s = sellerSku(l, v);
        if (s && summary.unmatchedSkus.length < 20) summary.unmatchedSkus.push(s);
      }
      if (!listingId) continue;
      const vdata = {
        name: v.name?.slice(0, 512) ?? null,
        sku: clean(v.sku)?.slice(0, 128) ?? null,
        price: v.price == null ? null : BigInt(Math.round(v.price)),
        quantity: v.quantity ?? null,
        images: v.images as Prisma.InputJsonValue,
        variantId: m?.id ?? null,
        linkedBy: m?.by ?? null,
      };
      await db.channelListingVariant.upsert({
        where: { listingId_externalId: { listingId, externalId: v.externalId } },
        create: { listingId, externalId: v.externalId, ...vdata },
        update: vdata,
      });
    }
  }
  return summary;
}
