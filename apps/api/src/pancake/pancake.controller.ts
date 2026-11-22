import {
  Body,
  Get,
  Query,
  ConflictException,
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  imagesBySku,
  isOtherCountryShop,
  type Listing,
  PancakeAdapter,
  PancakeClient,
  PancakeError,
  pullListings,
  type PushProductInput,
} from '@sugami/channels-pancake';
import {
  linkUnlinkedLines,
  listUnlinkedLines,
  runPancakeOrderSync,
  syncChannelListings,
  syncListingImages,
  syncPancakeVariantRefs,
} from '@sugami/sync';
import { toSearchKey } from '@sugami/shared';
import { z } from 'zod';
import { RequirePermissions } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PancakePushError, planProductPush, pushProduct, syncProductStock } from './pancake-push.js';

const Body_ = z.object({
  /** Preview only (default). Nothing is written to Pancake unless this is false. */
  dryRun: z.boolean().default(true),
  warehouseId: z.string().trim().min(1).max(64).optional(),
});

/** Shop-name endings of other countries ("SuGaMi - PH"); the Vietnam shop has no suffix. */
const OTHER_SHOP_SUFFIXES = [' - PH', ' - MY', ' - SG', ' - TH', ' - ID'];

const ImagesBody = z.object({
  dryRun: z.boolean().default(true),
  /** Also replace images that came from the KiotViet file. */
  replace: z.boolean().default(false),
});

const SyncBody = z.object({
  dryRun: z.boolean().default(true),
  /** Only used when the sync has never run: how far back to look. */
  sinceDays: z.number().int().min(1).max(1500).default(14),
  /** Look back sinceDays ignoring the saved cursor (updates older orders when not a preview). */
  rescan: z.boolean().default(false),
  /** Fixed date range YYYY-MM-DD (Vietnam time) to backfill history; the saved cursor is untouched. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

const LinkBody = z.object({
  /** The marketplace's own code at the start of the unlinked line name. */
  key: z.string().trim().min(4).max(64),
  variantId: z.string().trim().min(1).max(36),
});

/** Manual, one-product-at-a-time writes to Pancake for the trial. */
@Controller('pancake')
export class PancakeController {
  constructor(private readonly prisma: PrismaService) {}

  private client() {
    const apiKey = process.env.PANCAKE_API_KEY;
    const shopId = process.env.PANCAKE_SHOP_ID;
    if (!apiKey || !shopId)
      throw new ServiceUnavailableException('Chưa cấu hình PANCAKE_API_KEY / PANCAKE_SHOP_ID');
    return new PancakeClient({ apiKey, shopId });
  }

  private async load(code: string): Promise<PushProductInput> {
    const p = await this.prisma.client.product.findFirst({
      where: { OR: [{ id: code }, { code }] },
      include: {
        options: { orderBy: { sort: 'asc' }, select: { name: true } },
        variants: { orderBy: { sku: 'asc' }, include: { stockLevels: { select: { onHand: true } } } },
      },
    });
    if (!p) throw new NotFoundException('Không tìm thấy sản phẩm');
    if (!p.variants.length) throw new UnprocessableEntityException('Sản phẩm chưa có mã hàng');
    return {
      code: p.code,
      name: p.name,
      description: p.description,
      options: p.options.map((o) => o.name),
      variants: p.variants.map((v) => ({
        sku: v.sku,
        barcode: v.barcode,
        optionValues: (v.optionValues as string[]) ?? [],
        price: Number(v.price),
        cost: Number(v.costAvg),
        onHand: v.stockLevels.reduce((a, s) => a + Number(s.onHand), 0),
      })),
    };
  }

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof PancakePushError) {
        const body = { message: err.message, ...err.extra };
        throw err.status === 409 ? new ConflictException(body) : new UnprocessableEntityException(body);
      }
      if (err instanceof PancakeError)
        throw new UnprocessableEntityException(`Pancake từ chối: ${err.message}`);
      throw err;
    }
  }

  /** Create the product on Pancake with the same SKUs and Sugami's stock. Preview by default. */
  @Post('products/:code/push')
  @HttpCode(200)
  @RequirePermissions('catalog.write')
  push(@Param('code') code: string, @Body() raw: unknown) {
    const { dryRun, warehouseId } = parseInput(Body_, raw ?? {});
    return this.guard(async () => {
      const input = await this.load(code);
      const client = this.client();
      if (dryRun) return { dryRun, ...(await planProductPush(client, input, warehouseId)) };
      return { dryRun, ...(await pushProduct(client, input, warehouseId)) };
    });
  }

  /** Set Pancake's stock of this product's SKUs to Sugami's stock. Preview by default. */
  @Post('products/:code/stock')
  @HttpCode(200)
  @RequirePermissions('inventory.write')
  stock(@Param('code') code: string, @Body() raw: unknown) {
    const { dryRun, warehouseId } = parseInput(Body_, raw ?? {});
    return this.guard(async () =>
      syncProductStock(this.client(), await this.load(code), { dryRun, warehouseId }),
    );
  }

  /**
   * Run one Pancake order sync now (the worker does the same every 5 minutes). Preview by default:
   * shows which orders would be created and how much stock they would take, writing nothing.
   */
  @Post('sync-orders')
  @HttpCode(200)
  @RequirePermissions('orders.write', 'inventory.write')
  syncOrders(@Body() raw: unknown) {
    const { dryRun, sinceDays, rescan, from, to } = parseInput(SyncBody, raw ?? {});
    const range = from
      ? {
          from: new Date(`${from}T00:00:00+07:00`),
          to: new Date(new Date(`${to ?? from}T00:00:00+07:00`).getTime() + 86_400_000),
        }
      : undefined;
    return this.guard(() =>
      runPancakeOrderSync(this.prisma.client, new PancakeAdapter(this.client()), {
        warehouseCode: process.env.PANCAKE_SYNC_WAREHOUSE || 'KHO-CHINH',
        dryRun,
        sinceDays,
        ignoreCursor: rescan,
        range,
      }),
    );
  }

  /** Order lines Pancake did not link to a product, grouped by marketplace code. */
  @Get('unlinked-lines')
  @RequirePermissions('orders.read')
  async unlinked() {
    const groups = await listUnlinkedLines(this.prisma.client);
    return {
      data: groups.map((g) => ({ ...g, lastOrderedAt: g.lastOrderedAt.toISOString() })),
      lines: groups.reduce((a, g) => a + g.lines, 0),
    };
  }

  /**
   * Find Sugami variants to link a marketplace code to. Matches an exact barcode, a SKU fragment, or every
   * word of the name (any order, accents ignored). Long marketplace titles that match nothing are retried
   * with fewer leading words, so pasting a whole title still suggests the likely product.
   */
  @Get('variant-search')
  @RequirePermissions('catalog.read')
  async variantSearch(@Query('q') raw?: string) {
    const q = (raw ?? '').trim().slice(0, 200);
    if (q.length < 2) return { data: [] };
    const db = this.prisma.client;
    const words = toSearchKey(q)
      .split(/\s+/)
      .filter((w) => w.length >= 2)
      .slice(0, 8);
    const select = {
      id: true,
      sku: true,
      barcode: true,
      price: true,
      optionValues: true,
      product: { select: { name: true } },
    } as const;
    const find = (tokens: string[]) =>
      db.variant.findMany({
        where: {
          product: { status: { not: 'archived' } },
          OR: [
            { barcode: q },
            { sku: { contains: q } },
            {
              AND: tokens.map((t) => ({
                OR: [{ product: { searchKey: { contains: t } } }, { sku: { contains: t } }],
              })),
            },
          ],
        },
        take: 20,
        orderBy: { sku: 'asc' },
        select,
      });
    let rows = words.length ? await find(words) : [];
    for (const n of [4, 3, 2]) if (!rows.length && words.length > n) rows = await find(words.slice(0, n));
    return {
      data: rows.map((v) => ({
        id: v.id,
        sku: v.sku,
        barcode: v.barcode,
        price: Number(v.price),
        productName: v.product.name,
        optionValues: v.optionValues,
      })),
    };
  }

  /** Link a marketplace code to a Sugami variant: existing unlinked lines get the SKU and take stock. */
  @Post('link-line')
  @HttpCode(200)
  @RequirePermissions('orders.write', 'inventory.write')
  async linkLine(@Body() raw: unknown) {
    const body = parseInput(LinkBody, raw);
    try {
      return await linkUnlinkedLines(this.prisma.client, body);
    } catch (err) {
      throw new UnprocessableEntityException(err instanceof Error ? err.message : String(err));
    }
  }

  /** Store the marketplace listings Pancake pulled and match their options to Sugami variants. Preview by default. */
  @Post('sync-listings')
  @HttpCode(200)
  @RequirePermissions('catalog.write')
  syncListings(@Body() raw: unknown) {
    const { dryRun } = parseInput(Body_, raw ?? {});
    return this.guard(async () => {
      const listings: Listing[] = [];
      for await (const l of pullListings(this.client())) listings.push(l);
      // Only the Vietnam shop: PH/MY shops share the marketplace id but are other countries.
      const vn = listings.filter((l) => !isOtherCountryShop(l.marketplace_shop_name));
      const otherShops = OTHER_SHOP_SUFFIXES.map((x) => ({ shopKey: { endsWith: x } }));
      const stale = await this.prisma.client.channelListing.count({
        where: { source: 'pancake', OR: otherShops },
      });
      if (!dryRun && stale)
        await this.prisma.client.channelListing.deleteMany({ where: { source: 'pancake', OR: otherShops } });
      const summary = await syncChannelListings(
        this.prisma.client,
        vn.map((l) => ({
          source: 'pancake',
          externalId: l.id,
          shopName: l.marketplace_shop_name,
          marketplaceId: l.marketplace_id,
          name: l.name ?? l.sku ?? l.id,
          sku: l.sku,
          price: l.price,
          variations: (l.variations ?? []).map((v) => ({
            externalId: v.id,
            name: v.name,
            sku: v.sku,
            price: v.price,
            quantity: v.quantity,
            images: (v.images ?? []).filter((u) => /^https?:\/\//.test(u)),
            linkedCustomId: v.linked_variation_custom_id || v.linked_product_custom_id,
          })),
        })),
        { dryRun },
      );
      // Which SKUs exist on Pancake (the "Pancake" link shown on the product list).
      const pancakeVariants: { externalId: string; sku: string }[] = [];
      for await (const p of new PancakeAdapter(this.client()).pullProducts())
        for (const v of p.variants) pancakeVariants.push({ externalId: v.externalId, sku: v.sku });
      const pancake = await syncPancakeVariantRefs(this.prisma.client, pancakeVariants, { dryRun });
      return {
        ...summary,
        pancake,
        skippedOtherCountry: listings.length - vn.length,
        removedOtherCountry: stale,
      };
    });
  }

  /** Fill product images from the marketplace listings Pancake pulled (matched by seller SKU). Preview by default. */
  @Post('sync-images')
  @HttpCode(200)
  @RequirePermissions('catalog.write')
  syncImages(@Body() raw: unknown) {
    const { dryRun, replace } = parseInput(ImagesBody, raw ?? {});
    return this.guard(async () => {
      const listings: Listing[] = [];
      for await (const l of pullListings(this.client()))
        if (!isOtherCountryShop(l.marketplace_shop_name)) listings.push(l);
      return {
        listings: listings.length,
        ...(await syncListingImages(
          this.prisma.client,
          { bySku: imagesBySku(listings) },
          { dryRun, replace },
        )),
      };
    });
  }
}
