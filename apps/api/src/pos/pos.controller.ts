import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { toSearchKey } from '@sugami/shared';
import { Prisma } from '@sugami/db';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { changePosOrderStatus, createPosOrder, PosError } from './pos-orders.js';
import { DraftBody, POS_STATUSES, PosPayload } from './pos-schema.js';

const StatusBody = z.object({ status: z.enum(POS_STATUSES) });
const CheckoutBody = z.object({ mode: z.enum(['retail', 'delivery']), payload: PosPayload });

interface SearchRow {
  id: string;
  sku: string;
  barcode: string | null;
  price: bigint;
  option_values: unknown;
  product_name: string;
  image: string | null;
  on_hand: Prisma.Decimal | null;
}

/** Counter sales: product search, several open drafts, checkout into an order. */
@Controller('pos')
export class PosController {
  constructor(private readonly prisma: PrismaService) {}

  private wrap<T>(fn: () => Promise<T>): Promise<T> {
    return fn().catch((err: unknown) => {
      if (err instanceof PosError) {
        if (err.status === 404) throw new NotFoundException(err.message);
        if (err.status === 409) throw new ConflictException(err.message);
        throw new BadRequestException(err.message);
      }
      throw err;
    });
  }

  /** Variants matching a SKU, barcode or name, with price, image and stock in the sales warehouse. */
  @Get('search')
  @RequirePermissions('orders.write')
  async search(@Query('q') raw?: string, @Query('inStock') inStock?: string) {
    const q = (raw ?? '').trim().slice(0, 64);
    const db = this.prisma.client;
    const wh = await db.warehouse.findUnique({ where: { code: process.env.POS_WAREHOUSE || 'KHO-CHINH' } });
    const key = `%${toSearchKey(q)}%`;
    const like = `%${q}%`;
    const rows = await db.$queryRaw<SearchRow[]>`
      SELECT v.id, v.sku, v.barcode, v.price, v.option_values, p.name AS product_name,
             JSON_UNQUOTE(JSON_EXTRACT(v.image_urls, '$[0]')) AS image, sl.on_hand
      FROM variants v
      JOIN products p ON p.id = v.product_id
      LEFT JOIN stock_levels sl ON sl.variant_id = v.id AND sl.warehouse_id = ${wh?.id ?? ''}
      WHERE p.status <> 'archived'
        ${q ? Prisma.sql`AND (v.sku LIKE ${like} OR v.barcode = ${q} OR p.search_key LIKE ${key} OR p.code LIKE ${like})` : Prisma.empty}
        ${inStock === '1' ? Prisma.sql`AND sl.on_hand > 0` : Prisma.empty}
      ORDER BY p.updated_at DESC, v.sku ASC
      LIMIT 30`;
    return {
      data: rows.map((r) => ({
        id: r.id,
        sku: r.sku,
        barcode: r.barcode,
        price: Number(r.price),
        productName: r.product_name,
        optionValues: r.option_values,
        image: r.image,
        onHand: r.on_hand === null ? 0 : Number(r.on_hand),
      })),
    };
  }

  /** Line details for a draft (name, option text, stock) so a reloaded screen can show it. */
  @Post('variants')
  @HttpCode(200)
  @RequirePermissions('orders.write')
  async variants(@Body() raw: unknown) {
    const { ids } = parseInput(z.object({ ids: z.array(z.string().max(36)).max(200) }), raw);
    const db = this.prisma.client;
    const wh = await db.warehouse.findUnique({ where: { code: process.env.POS_WAREHOUSE || 'KHO-CHINH' } });
    const vs = await db.variant.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        sku: true,
        barcode: true,
        price: true,
        optionValues: true,
        imageUrls: true,
        product: { select: { name: true } },
        stockLevels: { where: { warehouseId: wh?.id ?? '' }, select: { onHand: true } },
      },
    });
    return {
      data: vs.map((v) => ({
        id: v.id,
        sku: v.sku,
        barcode: v.barcode,
        price: Number(v.price),
        productName: v.product.name,
        optionValues: v.optionValues,
        image: Array.isArray(v.imageUrls) ? ((v.imageUrls[0] as string | undefined) ?? null) : null,
        onHand: Number(v.stockLevels[0]?.onHand ?? 0),
      })),
    };
  }

  @Get('drafts')
  @RequirePermissions('orders.write')
  async drafts() {
    const rows = await this.prisma.client.posDraft.findMany({ orderBy: { createdAt: 'asc' } });
    return { data: rows.map((d) => ({ id: d.id, label: d.label, mode: d.mode, payload: d.payload })) };
  }

  @Post('drafts')
  @RequirePermissions('orders.write')
  async createDraft(@Body() raw: unknown, @CurrentUser() user: AuthUser) {
    const b = parseInput(DraftBody, raw);
    const db = this.prisma.client;
    const count = await db.posDraft.count();
    if (count >= 20) throw new BadRequestException('Đang mở quá nhiều đơn nháp (tối đa 20)');
    const d = await db.posDraft.create({
      data: { label: b.label ?? `Hóa đơn ${count + 1}`, mode: b.mode, payload: b.payload, createdBy: user.id },
    });
    return { id: d.id, label: d.label, mode: d.mode, payload: d.payload };
  }

  @Put('drafts/:id')
  @RequirePermissions('orders.write')
  async saveDraft(@Param('id') id: string, @Body() raw: unknown) {
    const b = parseInput(DraftBody, raw);
    const r = await this.prisma.client.posDraft.updateMany({
      where: { id },
      data: { ...(b.label ? { label: b.label } : {}), mode: b.mode, payload: b.payload },
    });
    if (!r.count) throw new NotFoundException('Đơn nháp đã được thanh toán hoặc xóa');
    return { ok: true };
  }

  @Delete('drafts/:id')
  @HttpCode(204)
  @RequirePermissions('orders.write')
  async deleteDraft(@Param('id') id: string) {
    await this.prisma.client.posDraft.deleteMany({ where: { id } });
  }

  /** Pay: turns the sale into an order, takes stock and removes the draft. */
  @Post('drafts/:id/checkout')
  @HttpCode(200)
  @RequirePermissions('orders.write')
  async checkout(@Param('id') id: string, @Body() raw: unknown, @CurrentUser() user: AuthUser) {
    const b = parseInput(CheckoutBody, raw);
    return this.wrap(() =>
      createPosOrder(this.prisma.client, { mode: b.mode, payload: b.payload, draftId: id, userId: user.id }),
    );
  }

  /** Move a counter order to another status by hand. */
  @Post('orders/:code/status')
  @HttpCode(200)
  @RequirePermissions('orders.write')
  async status(@Param('code') code: string, @Body() raw: unknown, @CurrentUser() user: AuthUser) {
    const { status } = parseInput(StatusBody, raw);
    await this.wrap(() => changePosOrderStatus(this.prisma.client, code, status, user.id));
    return { ok: true, status };
  }
}
