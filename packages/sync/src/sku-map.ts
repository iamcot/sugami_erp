import type { PrismaClient } from '@sugami/db';

/**
 * Marketplace order lines that Pancake has not linked to a product carry no SKU; their name starts
 * with the marketplace's own code ("207086204498 - Bác sĩ…"). We learn which Sugami variant that code
 * stands for from orders that exist on both sides (KiotViet lines know the variant), and keep it as an
 * external_ref so later orders, listing images and a future direct Shopee link can use it.
 */
export const SKU_MAP_PROVIDER = 'pancake_sku';

/** The leading code of a Pancake line name, or undefined when the name has none. */
export function lineKey(name: string | null | undefined): string | undefined {
  const m = /^\s*([A-Za-z0-9._/-]{4,64})\s+-\s+/.exec(name ?? '');
  return m ? m[1] : undefined;
}

export interface PancakeLineRef {
  key: string;
  quantity: number;
}
export interface KnownLineRef {
  variantId: string;
  quantity: number;
}

/**
 * Pair the unlinked Pancake lines of one order with the lines KiotViet recorded for the same order.
 * One line on each side pairs for certain; with several lines a Pancake line pairs only when exactly
 * one unused KiotViet line has the same quantity. Anything else is left out (ambiguous).
 */
export function pairLines(
  pancake: PancakeLineRef[],
  known: KnownLineRef[],
): { pairs: { key: string; variantId: string }[]; ambiguous: number } {
  if (pancake.length === 1 && known.length === 1)
    return { pairs: [{ key: pancake[0]!.key, variantId: known[0]!.variantId }], ambiguous: 0 };
  const used = new Set<number>();
  const pairs: { key: string; variantId: string }[] = [];
  let ambiguous = 0;
  for (const p of pancake) {
    const cand = known
      .map((k, i) => ({ k, i }))
      .filter(({ k, i }) => !used.has(i) && k.quantity === p.quantity);
    if (cand.length === 1) {
      used.add(cand[0]!.i);
      pairs.push({ key: p.key, variantId: cand[0]!.k.variantId });
    } else ambiguous++;
  }
  return { pairs, ambiguous };
}

/** key → variant id for the given marketplace codes. */
export async function loadSkuMap(db: PrismaClient, keys: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < keys.length; i += 400) {
    const rows = await db.externalRef.findMany({
      where: {
        provider: SKU_MAP_PROVIDER,
        entityType: 'variant',
        externalId: { in: keys.slice(i, i + 400) },
      },
      select: { externalId: true, entityId: true },
    });
    for (const r of rows) out.set(r.externalId, r.entityId);
  }
  return out;
}

/** Save new pairs; a key already mapped to another variant is a conflict and keeps its first mapping. */
export async function learnSkuMap(
  db: PrismaClient,
  pairs: { key: string; variantId: string }[],
  known: Map<string, string>,
  dryRun: boolean,
): Promise<{ learned: number; conflicts: number }> {
  let learned = 0;
  let conflicts = 0;
  for (const p of pairs) {
    const have = known.get(p.key);
    if (have) {
      if (have !== p.variantId) conflicts++;
      continue;
    }
    known.set(p.key, p.variantId);
    learned++;
    if (!dryRun)
      await db.externalRef.upsert({
        where: {
          provider_entityType_externalId: {
            provider: SKU_MAP_PROVIDER,
            entityType: 'variant',
            externalId: p.key,
          },
        },
        create: {
          provider: SKU_MAP_PROVIDER,
          entityType: 'variant',
          externalId: p.key,
          entityId: p.variantId,
        },
        update: {},
      });
  }
  return { learned, conflicts };
}
