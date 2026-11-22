import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query } from '@nestjs/common';
import type { Prisma } from '@sugami/db';
import { toSearchKey } from '@sugami/shared';
import { z } from 'zod';
import { RequirePermissions } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { PrismaService } from '../prisma/prisma.service.js';

const ListQuery = z.object({
  q: z.string().trim().max(64).optional(),
  shop: z.string().trim().max(191).optional(),
  /** linked = every option matched a Sugami variant, partial = some, none = no option matched. */
  link: z.enum(['linked', 'partial', 'none']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

const ProductQuery = z.object({
  q: z.string().trim().max(64).optional(),
  /** linked = has at least one marketplace listing, none = on no marketplace yet. */
  link: z.enum(['linked', 'none']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

const LinkBody = z.object({
  variationId: z.string().trim().min(1).max(36),
  /** null removes the link. */
  variantId: z.string().trim().min(1).max(36).nullable(),
});

const MARKET_NAME: Record<string, string> = { '-3': 'Shopee', '-9': 'TikTok' };

const n = (v: bigint | null) => (v === null ? null : Number(v));

/** Marketplace listings (read-only copies synced from Pancake). */
@Controller('listings')
export class ListingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('catalog.read')
  async list(@Query() raw: unknown) {
    const q = parseInput(ListQuery, raw);
    const db = this.prisma.client;
    const where: Prisma.ChannelListingWhereInput = {
      ...(q.shop ? { shopKey: q.shop } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q } },
              { sku: { contains: q.q } },
              { variations: { some: { sku: { contains: q.q } } } },
              { variations: { some: { variant: { sku: { contains: q.q } } } } },
            ],
          }
        : {}),
      ...(q.link === 'linked'
        ? { variations: { some: {}, none: { variantId: null } } }
        : q.link === 'none'
          ? { variations: { none: { variantId: { not: null } } } }
          : q.link === 'partial'
            ? {
                AND: [
                  { variations: { some: { variantId: null } } },
                  { variations: { some: { variantId: { not: null } } } },
                ],
              }
            : {}),
    };
    const finalWhere = where;
    const [rows, total, shops, counts] = await Promise.all([
      db.channelListing.findMany({
        where: finalWhere,
        orderBy: [{ shopKey: 'asc' }, { name: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          variations: {
            select: { variantId: true, price: true, quantity: true },
          },
        },
      }),
      db.channelListing.count({ where: finalWhere }),
      db.channelListing.groupBy({ by: ['shopKey'], _count: true, orderBy: { shopKey: 'asc' } }),
      db.channelListingVariant.groupBy({ by: ['linkedBy'], _count: true }),
    ]);
    return {
      data: rows.map((l) => {
        const prices = l.variations.map((v) => n(v.price)).filter((p): p is number => p !== null);
        return {
          id: l.id,
          source: l.source,
          shop: l.shopKey,
          name: l.name,
          sku: l.sku,
          imageUrl: l.imageUrl,
          variations: l.variations.length,
          linked: l.variations.filter((v) => v.variantId).length,
          priceMin: prices.length ? Math.min(...prices) : null,
          priceMax: prices.length ? Math.max(...prices) : null,
          quantity: l.variations.reduce((a, v) => a + Number(v.quantity ?? 0), 0),
          syncedAt: l.syncedAt.toISOString(),
        };
      }),
      page: q.page,
      pageSize: q.pageSize,
      total,
      shops: shops.map((s) => ({ shop: s.shopKey, listings: s._count })),
      linkedBy: Object.fromEntries(counts.map((c) => [c.linkedBy ?? 'none', c._count])),
    };
  }

  /** Sugami variants first, each with the marketplace listings linked to it. */
  @Get('by-product')
  @RequirePermissions('catalog.read')
  async byProduct(@Query() raw: unknown) {
    const q = parseInput(ProductQuery, raw);
    const db = this.prisma.client;
    const tokens = toSearchKey(q.q ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 6);
    const where: Prisma.VariantWhereInput = {
      product: { status: { not: 'archived' } },
      ...(tokens.length
        ? {
            AND: tokens.map((t) => ({
              OR: [{ product: { searchKey: { contains: t } } }, { sku: { contains: t } }],
            })),
          }
        : {}),
      ...(q.link === 'linked' ? { listingVariants: { some: {} } } : {}),
      ...(q.link === 'none' ? { listingVariants: { none: {} } } : {}),
    };
    const [rows, total] = await Promise.all([
      db.variant.findMany({
        where,
        orderBy: { sku: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          sku: true,
          optionValues: true,
          imageUrls: true,
          product: { select: { code: true, name: true } },
          stockLevels: { select: { onHand: true } },
          listingVariants: {
            select: {
              id: true,
              name: true,
              sku: true,
              price: true,
              quantity: true,
              linkedBy: true,
              listing: { select: { id: true, name: true, shopKey: true, marketplaceId: true } },
            },
          },
        },
      }),
      db.variant.count({ where }),
    ]);
    return {
      data: rows.map((v) => ({
        id: v.id,
        sku: v.sku,
        productCode: v.product.code,
        name: v.product.name,
        options: Array.isArray(v.optionValues) ? (v.optionValues as string[]) : [],
        imageUrl: Array.isArray(v.imageUrls) ? ((v.imageUrls as string[])[0] ?? null) : null,
        onHand: v.stockLevels.reduce((a, s) => a + Number(s.onHand), 0),
        listings: v.listingVariants.map((lv) => ({
          variationId: lv.id,
          listingId: lv.listing.id,
          channel: MARKET_NAME[lv.listing.marketplaceId ?? ''] ?? lv.listing.marketplaceId ?? '?',
          shop: lv.listing.shopKey,
          title: lv.listing.name,
          variationName: lv.name,
          sku: lv.sku,
          price: n(lv.price),
          quantity: lv.quantity === null ? null : Number(lv.quantity),
          linkedBy: lv.linkedBy,
        })),
      })),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  /** Marketplace options not matched to any Sugami variant yet (to link by hand). */
  @Get('unlinked')
  @RequirePermissions('catalog.read')
  async unlinked(@Query('q') raw?: string) {
    const q = (raw ?? '').trim().slice(0, 64);
    const rows = await this.prisma.client.channelListingVariant.findMany({
      where: {
        variantId: null,
        ...(q
          ? {
              OR: [
                { sku: { contains: q } },
                { name: { contains: q } },
                { listing: { name: { contains: q } } },
              ],
            }
          : {}),
      },
      orderBy: [{ listing: { name: 'asc' } }, { name: 'asc' }],
      take: 40,
      select: {
        id: true,
        name: true,
        sku: true,
        price: true,
        listing: { select: { name: true, shopKey: true, marketplaceId: true, imageUrl: true } },
      },
    });
    return {
      data: rows.map((r) => ({
        variationId: r.id,
        channel: MARKET_NAME[r.listing.marketplaceId ?? ''] ?? r.listing.marketplaceId ?? '?',
        shop: r.listing.shopKey,
        title: r.listing.name,
        imageUrl: r.listing.imageUrl,
        variationName: r.name,
        sku: r.sku,
        price: n(r.price),
      })),
    };
  }

  /** Link (or unlink with variantId null) a marketplace option to a Sugami variant by hand. */
  @Post('link')
  @HttpCode(200)
  @RequirePermissions('catalog.write')
  async link(@Body() raw: unknown) {
    const body = parseInput(LinkBody, raw);
    const db = this.prisma.client;
    const lv = await db.channelListingVariant.findUnique({ where: { id: body.variationId } });
    if (!lv) throw new NotFoundException('Không tìm thấy biến thể trên sàn');
    if (body.variantId) {
      const v = await db.variant.findUnique({ where: { id: body.variantId }, select: { id: true } });
      if (!v) throw new NotFoundException('Không tìm thấy mã hàng');
    }
    await db.channelListingVariant.update({
      where: { id: lv.id },
      data: body.variantId
        ? { variantId: body.variantId, linkedBy: 'manual' }
        : { variantId: null, linkedBy: null },
    });
    return { ok: true };
  }

  @Get(':id')
  @RequirePermissions('catalog.read')
  async get(@Param('id') id: string) {
    const l = await this.prisma.client.channelListing.findUnique({
      where: { id },
      include: {
        variations: {
          orderBy: { name: 'asc' },
          include: {
            variant: {
              select: {
                sku: true,
                barcode: true,
                price: true,
                product: { select: { code: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!l) throw new NotFoundException('Không tìm thấy tin đăng');
    return {
      listing: {
        id: l.id,
        source: l.source,
        shop: l.shopKey,
        externalId: l.externalId,
        name: l.name,
        sku: l.sku,
        price: n(l.price),
        imageUrl: l.imageUrl,
        syncedAt: l.syncedAt.toISOString(),
        variations: l.variations.map((v) => ({
          id: v.id,
          name: v.name,
          sku: v.sku,
          price: n(v.price),
          quantity: v.quantity === null ? null : Number(v.quantity),
          images: Array.isArray(v.images) ? (v.images as string[]) : [],
          linkedBy: v.linkedBy,
          variant: v.variant
            ? {
                sku: v.variant.sku,
                barcode: v.variant.barcode,
                price: Number(v.variant.price),
                product: v.variant.product,
              }
            : null,
        })),
      },
    };
  }
}
