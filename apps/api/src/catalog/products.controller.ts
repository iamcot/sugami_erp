import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { Prisma } from '@sugami/db';
import { toSearchKey } from '@sugami/shared';
import { z } from 'zod';
import { RequirePermissions } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { StorageService } from '../media/storage.service.js';
import { PLATFORM_OF } from '../listings/listings.controller.js';
import { PrismaService } from '../prisma/prisma.service.js';

const ListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: z.string().trim().max(36).optional(),
  /** all | active | draft | archived | out (≤ 0) | negative (< 0) | low (≤ min stock) */
  view: z.enum(['all', 'active', 'draft', 'archived', 'out', 'negative', 'low']).default('all'),
  sort: z.enum(['name', 'code', 'stock', 'price', 'updated']).default('updated'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

const SORT_SQL: Record<z.infer<typeof ListQuery>['sort'], Prisma.Sql> = {
  name: Prisma.sql`p.name`,
  code: Prisma.sql`p.code`,
  stock: Prisma.sql`on_hand`,
  price: Prisma.sql`price_min`,
  updated: Prisma.sql`p.updated_at`,
};

interface Row {
  id: string;
  code: string;
  name: string;
  status: string;
  category: string | null;
  variant_count: bigint;
  image: string | null;
  price_min: bigint | null;
  price_max: bigint | null;
  on_hand: Prisma.Decimal | string | null;
  negative_skus: Prisma.Decimal | string | null;
  low_skus: Prisma.Decimal | string | null;
  updated_at: Date;
}

const n = (v: Prisma.Decimal | string | bigint | null) => Number(v ?? 0);

@Controller('products')
export class ProductsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  /** URLs of stored images by key; empty when storage is not configured so product pages still work. */
  private async urlsFor(keys: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    try {
      const storage = this.storageService.storage;
      await Promise.all(keys.map(async (k) => out.set(k, await storage.url(k))));
    } catch {
      out.clear();
    }
    return out;
  }

  /**
   * Product list with stock summed over warehouses. Search is accent-insensitive on name
   * ("xe dieu khien" finds "Xe điều khiển") and matches product codes, SKUs and barcodes.
   */
  @Get()
  @RequirePermissions('catalog.read')
  async list(@Query() rawQuery: unknown) {
    const q = parseInput(ListQuery, rawQuery);
    const where: Prisma.Sql[] = [];
    if (q.q) {
      const key = `%${toSearchKey(q.q)}%`;
      const raw = `%${q.q}%`;
      where.push(Prisma.sql`(p.search_key LIKE ${key} OR p.code LIKE ${raw} OR EXISTS (
        SELECT 1 FROM variants v2 WHERE v2.product_id = p.id AND (v2.sku LIKE ${raw} OR v2.barcode = ${q.q})))`);
    }
    if (q.categoryId) {
      where.push(Prisma.sql`(p.category_id = ${q.categoryId} OR c.parent_id = ${q.categoryId})`);
    }
    if (q.view === 'active' || q.view === 'draft' || q.view === 'archived') {
      where.push(Prisma.sql`p.status = ${q.view}`);
    } else if (q.view !== 'all') {
      where.push(Prisma.sql`p.status <> 'archived'`);
    }
    const having: Record<string, Prisma.Sql | null> = {
      all: null,
      active: null,
      draft: null,
      archived: null,
      out: Prisma.sql`HAVING on_hand <= 0`,
      negative: Prisma.sql`HAVING negative_skus > 0`,
      low: Prisma.sql`HAVING low_skus > 0`,
    };
    const whereSql = where.length ? Prisma.sql`WHERE ${Prisma.join(where, ' AND ')}` : Prisma.empty;
    const base = Prisma.sql`
      SELECT p.id, p.code, p.name, p.status, c.name AS category, p.updated_at,
             COUNT(vs.id) AS variant_count, MAX(vs.image) AS image, MIN(vs.price) AS price_min, MAX(vs.price) AS price_max,
             COALESCE(SUM(vs.on_hand), 0) AS on_hand,
             SUM(vs.on_hand < 0) AS negative_skus,
             SUM(vs.on_hand <= vs.min_stock AND vs.min_stock > 0) AS low_skus
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN (
        SELECT v.id, v.product_id, v.price, v.min_stock, JSON_UNQUOTE(JSON_EXTRACT(v.image_urls, '$[0]')) AS image,
               COALESCE(SUM(sl.on_hand), 0) AS on_hand
        FROM variants v LEFT JOIN stock_levels sl ON sl.variant_id = v.id
        GROUP BY v.id
      ) vs ON vs.product_id = p.id
      ${whereSql}
      GROUP BY p.id
      ${having[q.view] ?? Prisma.empty}`;

    const dir = q.dir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const db = this.prisma.client;
    const [rows, total, counts] = await Promise.all([
      db.$queryRaw<
        Row[]
      >`${base} ORDER BY ${SORT_SQL[q.sort]} ${dir}, p.code ASC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
      db.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) AS total FROM (${base}) t`,
      this.viewCounts(),
    ]);
    const covers = await this.prisma.client.productMedia.findMany({
      where: { productId: { in: rows.map((r) => r.id) }, role: 'main' },
      orderBy: { sort: 'asc' },
      select: { productId: true, asset: { select: { storageKey: true } } },
    });
    const coverKey = new Map<string, string>();
    for (const c of covers) if (!coverKey.has(c.productId)) coverKey.set(c.productId, c.asset.storageKey);
    const coverUrl = await this.urlsFor([...new Set(coverKey.values())]);
    const links = await this.linkCounts(rows.map((r) => r.id));
    return {
      data: rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        status: r.status,
        category: r.category,
        variantCount: n(r.variant_count),
        image: coverUrl.get(coverKey.get(r.id) ?? '') ?? r.image ?? null,
        priceMin: n(r.price_min),
        priceMax: n(r.price_max),
        onHand: n(r.on_hand),
        negativeSkus: n(r.negative_skus),
        lowSkus: n(r.low_skus),
        updatedAt: r.updated_at.toISOString(),
        links: {
          pancake: links.get(r.id)?.pancake ?? 0,
          shopee: links.get(r.id)?.shopee ?? 0,
          tiktok: links.get(r.id)?.tiktok ?? 0,
        },
      })),
      page: q.page,
      pageSize: q.pageSize,
      total: n(total[0]?.total ?? 0n),
      counts,
    };
  }

  /**
   * Per product, how many of its variants are on Pancake and linked (by Pancake) to a Shopee or TikTok
   * listing. The total to compare with is the product's variant count.
   */
  private async linkCounts(productIds: string[]) {
    const out = new Map<string, { pancake: number; shopee: number; tiktok: number }>();
    if (!productIds.length) return out;
    const ids = Prisma.join(productIds);
    const db = this.prisma.client;
    const [pancake, market] = await Promise.all([
      db.$queryRaw<{ product_id: string; n: bigint }[]>`
        SELECT v.product_id, COUNT(DISTINCT v.id) AS n
        FROM variants v JOIN external_refs e ON e.entity_id = v.id AND e.provider = 'pancake' AND e.entity_type = 'variant'
        WHERE v.product_id IN (${ids}) GROUP BY v.product_id`,
      db.$queryRaw<{ product_id: string; marketplace_id: string | null; n: bigint }[]>`
        SELECT v.product_id, l.marketplace_id, COUNT(DISTINCT cv.variant_id) AS n
        FROM channel_listing_variants cv
        JOIN channel_listings l ON l.id = cv.listing_id
        JOIN variants v ON v.id = cv.variant_id
        WHERE v.product_id IN (${ids}) GROUP BY v.product_id, l.marketplace_id`,
    ]);
    const at = (id: string) => {
      let r = out.get(id);
      if (!r) out.set(id, (r = { pancake: 0, shopee: 0, tiktok: 0 }));
      return r;
    };
    for (const r of pancake) at(r.product_id).pancake = Number(r.n);
    for (const r of market) {
      const platform = PLATFORM_OF[r.marketplace_id ?? ''];
      if (platform) at(r.product_id)[platform] = Number(r.n);
    }
    return out;
  }

  private async viewCounts() {
    const [r] = await this.prisma.client.$queryRaw<Record<string, bigint | Prisma.Decimal | null>[]>`
      SELECT COUNT(*) AS \`all\`,
             SUM(status = 'active') AS active, SUM(status = 'draft') AS draft, SUM(status = 'archived') AS archived,
             SUM(status <> 'archived' AND on_hand <= 0) AS \`out\`,
             SUM(status <> 'archived' AND neg > 0) AS negative,
             SUM(status <> 'archived' AND low > 0) AS low
      FROM (
        SELECT p.status, COALESCE(SUM(vs.on_hand), 0) AS on_hand, SUM(vs.on_hand < 0) AS neg,
               SUM(vs.on_hand <= vs.min_stock AND vs.min_stock > 0) AS low
        FROM products p
        LEFT JOIN (
          SELECT v.id, v.product_id, v.min_stock, COALESCE(SUM(sl.on_hand), 0) AS on_hand
          FROM variants v LEFT JOIN stock_levels sl ON sl.variant_id = v.id GROUP BY v.id
        ) vs ON vs.product_id = p.id
        GROUP BY p.id
      ) t`;
    return Object.fromEntries(Object.entries(r ?? {}).map(([k, v]) => [k, Number(v ?? 0)]));
  }

  /** Product detail by id or code: variants with stock per warehouse. */
  @Get(':idOrCode')
  @RequirePermissions('catalog.read')
  async get(@Param('idOrCode') idOrCode: string) {
    const product = await this.prisma.client.product.findFirst({
      where: { OR: [{ id: idOrCode }, { code: idOrCode }] },
      include: {
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        options: { orderBy: { sort: 'asc' }, select: { name: true } },
        variants: {
          orderBy: { sku: 'asc' },
          include: { stockLevels: { include: { warehouse: { select: { code: true, name: true } } } } },
        },
      },
    });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');
    const media = await this.prisma.client.productMedia.findMany({
      where: { productId: product.id, variantId: { not: null } },
      orderBy: { sort: 'asc' },
      select: { variantId: true, asset: { select: { storageKey: true } } },
    });
    const links = await this.prisma.client.channelListingVariant.findMany({
      where: { variantId: { in: product.variants.map((v) => v.id) } },
      select: {
        sku: true,
        name: true,
        price: true,
        quantity: true,
        variantId: true,
        listing: { select: { id: true, name: true, shopKey: true, imageUrl: true } },
      },
    });
    const stored = await this.urlsFor([...new Set(media.map((m) => m.asset.storageKey))]);
    const storedByVariant = new Map<string, string[]>();
    for (const m of media) {
      const u = stored.get(m.asset.storageKey);
      if (u) storedByVariant.set(m.variantId!, [...(storedByVariant.get(m.variantId!) ?? []), u]);
    }
    return {
      product: {
        id: product.id,
        code: product.code,
        name: product.name,
        status: product.status,
        description: product.description,
        category: product.category,
        brand: product.brand,
        options: product.options.map((o) => o.name),
        listings: links.map((l) => ({
          id: l.listing.id,
          name: l.listing.name,
          shop: l.listing.shopKey,
          imageUrl: l.listing.imageUrl,
          variantId: l.variantId,
          option: l.name,
          marketplaceSku: l.sku,
          price: l.price === null ? null : Number(l.price),
          quantity: l.quantity === null ? null : Number(l.quantity),
        })),
        createdAt: product.createdAt.toISOString(),
        updatedAt: product.updatedAt.toISOString(),
        variants: product.variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          barcode: v.barcode,
          imageUrls:
            storedByVariant.get(v.id) ?? (Array.isArray(v.imageUrls) ? (v.imageUrls as string[]) : []),
          optionValues: v.optionValues,
          price: Number(v.price),
          costAvg: Number(v.costAvg),
          minStock: Number(v.minStock),
          status: v.status,
          onHand: v.stockLevels.reduce((a, s) => a + Number(s.onHand), 0),
          stock: v.stockLevels.map((s) => ({ warehouse: s.warehouse.code, onHand: Number(s.onHand) })),
        })),
      },
    };
  }
}
