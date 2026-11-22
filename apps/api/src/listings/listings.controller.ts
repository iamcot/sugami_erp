import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@sugami/db';
import { z } from 'zod';
import { RequirePermissions } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { PrismaService } from '../prisma/prisma.service.js';

const ListQuery = z.object({
  q: z.string().trim().max(64).optional(),
  shop: z.string().trim().max(191).optional(),
  platform: z.enum(['shopee', 'tiktok']).optional(),
  /** Only listings with an option linked to a variant of this Sugami product. */
  productCode: z.string().trim().max(64).optional(),
  /** linked = every option matched a Sugami variant, partial = some, none = no option matched. */
  link: z.enum(['linked', 'partial', 'none', 'unresolved']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** Pancake marketplace_id → platform shown in the UI. */
export const PLATFORM_OF: Record<string, 'shopee' | 'tiktok'> = { '-3': 'shopee', '-9': 'tiktok' };

const ConfirmBody = z.object({
  variationId: z.string().trim().min(1).max(36),
  /** null removes the confirmation. */
  variantId: z.string().trim().min(1).max(36).nullable(),
});

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
      ...(q.platform
        ? {
            marketplaceId: {
              in: Object.entries(PLATFORM_OF)
                .filter(([, p]) => p === q.platform)
                .map(([id]) => id),
            },
          }
        : {}),
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
      ...(q.link === 'unresolved'
        ? { variations: { some: { linkedBy: 'unresolved' } } }
        : q.link === 'linked'
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
    const finalWhere: Prisma.ChannelListingWhereInput = q.productCode
      ? { AND: [where, { variations: { some: { variant: { product: { code: q.productCode } } } } }] }
      : where;
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
          platform: PLATFORM_OF[l.marketplaceId ?? ''] ?? null,
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

  /**
   * Pancake reports a link but its API does not say to which product (e.g. a listing without options only
   * carries "1"). Confirm the Sugami variant by hand; later syncs keep it while Pancake keeps the link.
   */
  @Post('confirm')
  @HttpCode(200)
  @RequirePermissions('catalog.write')
  async confirm(@Body() raw: unknown) {
    const body = parseInput(ConfirmBody, raw);
    const db = this.prisma.client;
    const lv = await db.channelListingVariant.findUnique({ where: { id: body.variationId } });
    if (!lv) throw new NotFoundException('Không tìm thấy biến thể trên sàn');
    if (lv.linkedBy !== 'unresolved' && lv.linkedBy !== 'manual')
      throw new UnprocessableEntityException('Chỉ xác nhận được khi Pancake đã nối nhưng chưa rõ sản phẩm');
    if (body.variantId) {
      const v = await db.variant.findUnique({ where: { id: body.variantId }, select: { id: true } });
      if (!v) throw new NotFoundException('Không tìm thấy mã hàng');
    }
    await db.channelListingVariant.update({
      where: { id: lv.id },
      data: body.variantId
        ? { variantId: body.variantId, linkedBy: 'manual' }
        : { variantId: null, linkedBy: 'unresolved' },
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
