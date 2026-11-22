import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import type { Prisma } from '@sugami/db';
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
