import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@sugami/db';
import type { Storage } from '@sugami/storage';
import { mediaPath, UPLOAD_TYPES } from './media.rules.js';

export interface MirrorSummary {
  dryRun: boolean;
  /** Variants that still have source image URLs but no stored image. */
  pending: number;
  processed: number;
  /** Images saved to storage / images reused because the same file was already stored. */
  stored: number;
  reused: number;
  /** Variants whose images could not all be downloaded. */
  failed: { sku: string; url: string; reason: string }[];
  /** Variants still waiting after this call (call again with `afterSku` = nextAfter). */
  remaining: number;
  nextAfter: string | null;
}

const MAX_BYTES = UPLOAD_TYPES['image/jpeg']!.maxBytes;
const TIMEOUT_MS = 15_000;
const CONCURRENCY = 4;
const MAX_PER_VARIANT = 6;

/** Only public https hosts: no IP literals, localhost or internal names. */
export function isSafeImageUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.')) return false;
  if (/^[\d.]+$/.test(h) || h.includes(':')) return false;
  return true;
}

const EXT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

async function download(url: string): Promise<{ bytes: Buffer; mime: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) throw new Error('Ảnh quá lớn');
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error('Ảnh quá lớn');
  if (bytes.length === 0) throw new Error('Ảnh rỗng');
  let mime = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!mime.startsWith('image/')) {
    const ext = new URL(url).pathname.split('.').pop()?.toLowerCase() ?? '';
    mime = EXT_TYPE[ext] ?? mime;
  }
  if (UPLOAD_TYPES[mime]?.kind !== 'image') throw new Error(`Không phải ảnh (${mime || '?'})`);
  return { bytes, mime };
}

/**
 * Copy variant images from their source URLs (KiotViet file, Pancake listings) into our storage and
 * attach them to the product/variant. The same file used by several variants is stored once
 * (matched by SHA-256). Variants that already have a stored image are skipped, so reruns are cheap.
 */
export async function mirrorVariantImages(
  db: PrismaClient,
  storage: Storage,
  opts: { dryRun: boolean; limit: number; afterSku?: string },
): Promise<MirrorSummary> {
  const withUrls = await db.variant.findMany({
    where: {
      imageUrls: { not: Prisma.DbNull },
      media: { none: {} },
      ...(opts.afterSku ? { sku: { gt: opts.afterSku } } : {}),
    },
    select: { id: true, sku: true, productId: true, imageUrls: true },
    orderBy: { sku: 'asc' },
  });
  const todo = withUrls.filter((v) => Array.isArray(v.imageUrls) && v.imageUrls.length > 0);
  const batch = todo.slice(0, opts.limit);
  const summary: MirrorSummary = {
    dryRun: opts.dryRun,
    pending: todo.length,
    processed: 0,
    stored: 0,
    reused: 0,
    failed: [],
    remaining: todo.length,
    nextAfter: null,
  };
  if (opts.dryRun) return summary;

  const one = async (v: (typeof batch)[number]) => {
    const urls = (v.imageUrls as string[]).filter(isSafeImageUrl).slice(0, MAX_PER_VARIANT);
    let sort = 0;
    for (const url of urls) {
      try {
        const { bytes, mime } = await download(url);
        const checksum = createHash('sha256').update(bytes).digest('hex');
        let asset = await db.mediaAsset.findFirst({ where: { checksum, status: 'ready' } });
        if (asset) summary.reused++;
        else {
          const rule = UPLOAD_TYPES[mime]!;
          const id = randomUUID();
          const key = storage.key(mediaPath(id, rule.ext));
          await storage.put(key, bytes, mime);
          asset = await db.mediaAsset.create({
            data: {
              id,
              kind: 'image',
              status: 'ready',
              storageKey: key,
              originalName: (new URL(url).pathname.split('/').pop() || `${v.sku}.${rule.ext}`).slice(0, 255),
              mime,
              sizeBytes: BigInt(bytes.length),
              checksum,
              source: 'import',
              tags: { sourceUrl: url },
            },
          });
          summary.stored++;
        }
        await db.productMedia.create({
          data: {
            productId: v.productId,
            variantId: v.id,
            assetId: asset.id,
            role: sort === 0 ? 'main' : 'gallery',
            sort: sort++,
          },
        });
      } catch (err) {
        summary.failed.push({ sku: v.sku, url, reason: err instanceof Error ? err.message : String(err) });
      }
    }
    summary.processed++;
  };

  for (let i = 0; i < batch.length; i += CONCURRENCY)
    await Promise.all(batch.slice(i, i + CONCURRENCY).map(one));
  summary.remaining = todo.length - batch.length;
  summary.nextAfter = batch.length ? batch[batch.length - 1]!.sku : null;
  return summary;
}
