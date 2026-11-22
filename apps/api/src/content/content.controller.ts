import { Body, Controller, Get, NotFoundException, Param, Put } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** "base" is the master text; the others override it for one marketplace. */
export const CONTENT_CHANNELS = ['base', 'shopee', 'tiktok'] as const;

const Channel = z.enum(CONTENT_CHANNELS);
const Body_ = z.object({
  title: z.string().trim().max(255).nullable(),
  description: z.string().max(20_000).nullable(),
});

@Controller('products/:code/content')
export class ContentController {
  constructor(private readonly prisma: PrismaService) {}

  private async productId(code: string) {
    const p = await this.prisma.client.product.findUnique({
      where: { code: decodeURIComponent(code) },
      select: { id: true },
    });
    if (!p) throw new NotFoundException('Không thấy sản phẩm');
    return p.id;
  }

  /** The master text plus each marketplace's own version (missing = that marketplace uses the master). */
  @Get()
  @RequirePermissions('catalog.read')
  async get(@Param('code') code: string) {
    const rows = await this.prisma.client.productContent.findMany({
      where: { productId: await this.productId(code) },
    });
    const out: Record<
      string,
      { title: string | null; description: string | null; updatedAt: string } | null
    > = {};
    for (const c of CONTENT_CHANNELS) {
      const r = rows.find((x) => x.channel === c);
      out[c] = r
        ? { title: r.title, description: r.description, updatedAt: r.updatedAt.toISOString() }
        : null;
    }
    return { contents: out };
  }

  /** Save one version; empty title and description remove it (so the marketplace falls back to the master). */
  @Put(':channel')
  @RequirePermissions('catalog.write')
  async put(@Param('code') code: string, @Param('channel') channel: string, @Body() raw: unknown) {
    const ch = parseInput(Channel, channel);
    const body = parseInput(Body_, raw);
    const productId = await this.productId(code);
    const title = body.title || null;
    const description = body.description?.trim() ? body.description : null;
    if (!title && !description) {
      await this.prisma.client.productContent.deleteMany({ where: { productId, channel: ch } });
      return { saved: false };
    }
    await this.prisma.client.productContent.upsert({
      where: { productId_channel: { productId, channel: ch } },
      create: { productId, channel: ch, title, description },
      update: { title, description },
    });
    return { saved: true };
  }
}
