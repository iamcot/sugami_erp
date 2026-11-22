import type { Prisma, PrismaClient } from '@sugami/db';

export interface ListingImageSource {
  /** SKU → image URLs from marketplace listings. */
  bySku: Map<string, { images: string[] }>;
}

export interface ImageSyncSummary {
  dryRun: boolean;
  /** SKUs that have images on some listing. */
  listingSkus: number;
  /** Sugami variants that matched one of those SKUs. */
  matched: number;
  /** Matched variants that got images (they had none). */
  updated: number;
  /** Matched variants that already had images and were left alone (unless `replace`). */
  keptExisting: number;
  /** Listing SKUs that are not in Sugami (sample). */
  unknownSkus: string[];
}

/**
 * Fill variant images from marketplace listings matched by seller SKU. Images from the KiotViet file
 * are kept unless `replace` is set. The URLs are stored as they are (not copied to storage).
 */
export async function syncListingImages(
  db: PrismaClient,
  source: ListingImageSource,
  opts: { dryRun: boolean; replace?: boolean },
): Promise<ImageSyncSummary> {
  const skus = [...source.bySku.keys()];
  const summary: ImageSyncSummary = {
    dryRun: opts.dryRun,
    listingSkus: skus.length,
    matched: 0,
    updated: 0,
    keptExisting: 0,
    unknownSkus: [],
  };
  const known = new Set<string>();
  for (let i = 0; i < skus.length; i += 400) {
    const chunk = skus.slice(i, i + 400);
    const variants = await db.variant.findMany({
      where: { sku: { in: chunk } },
      select: { id: true, sku: true, imageUrls: true },
    });
    for (const v of variants) {
      known.add(v.sku);
      summary.matched++;
      const has = Array.isArray(v.imageUrls) && v.imageUrls.length > 0;
      if (has && !opts.replace) {
        summary.keptExisting++;
        continue;
      }
      const images = source.bySku.get(v.sku)!.images.slice(0, 9);
      if (has && JSON.stringify(v.imageUrls) === JSON.stringify(images)) continue;
      summary.updated++;
      if (!opts.dryRun)
        await db.variant.update({
          where: { id: v.id },
          data: { imageUrls: images as Prisma.InputJsonValue },
        });
    }
  }
  summary.unknownSkus = skus.filter((s) => !known.has(s)).slice(0, 20);
  return summary;
}
