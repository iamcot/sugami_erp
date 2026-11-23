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
import { ShippingService } from '../shipping/shipping.service.js';
import { fulfillmentOf, posActions } from './pos-flow.js';
import { availability, createPosOrder, PosError, runPosAction } from './pos-orders.js';
import { DraftBody, PosPayload } from './pos-schema.js';
import { ahamoveConfigured, bookOrder, cancelTrip, quoteOrder, refreshOrder } from './ahamove.js';

const CheckoutBody = z.object({
  mode: z.enum(['retail', 'delivery']),
  payload: PosPayload,
  /** Sell more than what is left (stock goes negative). */
  allowOversell: z.boolean().default(false),
});

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly shipping: ShippingService,
  ) {}

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
    const avail = await availability(
      db,
      wh?.id ?? '',
      rows.map((r) => r.id),
    );
    return {
      data: rows.map((r) => ({
        reserved: avail.get(r.id)?.reserved ?? 0,
        available: avail.get(r.id)?.available ?? 0,
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
    const avail = await availability(
      db,
      wh?.id ?? '',
      vs.map((v) => v.id),
    );
    return {
      data: vs.map((v) => ({
        reserved: avail.get(v.id)?.reserved ?? 0,
        available: avail.get(v.id)?.available ?? 0,
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
      data: {
        label: b.label ?? `Hóa đơn ${count + 1}`,
        mode: b.mode,
        payload: b.payload,
        createdBy: user.id,
      },
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
      createPosOrder(this.prisma.client, {
        mode: b.mode,
        payload: b.payload,
        draftId: id,
        userId: user.id,
        allowOversell: b.allowOversell,
      }),
    );
  }

  /** The buttons a counter order offers right now (what each does to stock is in `stock`). */
  @Get('orders/:code/actions')
  @RequirePermissions('orders.read')
  async actions(@Param('code') code: string) {
    const o = await this.prisma.client.order.findUnique({
      where: { code },
      select: {
        source: true,
        status: true,
        fulfillment: true,
        shipAddress: true,
        shipPhone: true,
        carrier: true,
      },
    });
    if (!o) throw new NotFoundException('Không tìm thấy đơn');
    if (o.source !== 'pos') return { fulfillment: null, actions: [] };
    const kind = fulfillmentOf(o);
    return { fulfillment: kind, actions: posActions(kind, o.status) };
  }

  /** Press one button of the state machine. */
  @Post('orders/:code/actions/:key')
  @HttpCode(200)
  @RequirePermissions('orders.write')
  async act(
    @Param('code') code: string,
    @Param('key') key: string,
    @Body() raw: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    const extra = parseInput(
      z.object({
        carrier: z.string().trim().max(255).optional(),
        trackingNo: z.string().trim().max(255).optional(),
      }),
      raw ?? {},
    );
    return this.wrap(async () => {
      // cancelling the order calls off the carrier's pickup too, so no courier turns up for a dead order
      if (key === 'cancel') await this.shipping.cancelForOrder(code);
      return runPosAction(this.prisma.client, code, key, user.id, extra);
    });
  }

  /** Whether Ahamove is set up (keys and pickup address), so the screen knows to offer it. */
  @Get('shipping/ahamove')
  @RequirePermissions('orders.read')
  ahamove() {
    return { configured: ahamoveConfigured() };
  }

  /** Price of each Ahamove service for this order's trip. */
  @Post('orders/:code/ahamove/quote')
  @HttpCode(200)
  @RequirePermissions('orders.write')
  async ahamoveQuote(@Param('code') code: string) {
    return { data: await this.wrap(() => quoteOrder(this.prisma.client, code)) };
  }

  /** Book a driver with the chosen service and hand the parcel over to the carrier in one go. */
  @Post('orders/:code/ahamove/book')
  @HttpCode(200)
  @RequirePermissions('orders.write')
  async ahamoveBook(@Param('code') code: string, @Body() raw: unknown, @CurrentUser() user: AuthUser) {
    const { serviceId } = parseInput(z.object({ serviceId: z.string().trim().min(1).max(64) }), raw);
    return this.wrap(() => bookOrder(this.prisma.client, code, serviceId, user.id));
  }

  /** Pull the latest state of the Ahamove trip (the webhook does this by itself when set up). */
  @Post('orders/:code/ahamove/refresh')
  @HttpCode(200)
  @RequirePermissions('orders.write')
  async ahamoveRefresh(@Param('code') code: string) {
    return this.wrap(() => refreshOrder(this.prisma.client, code));
  }

  @Post('orders/:code/ahamove/cancel')
  @HttpCode(200)
  @RequirePermissions('orders.write')
  async ahamoveCancel(@Param('code') code: string, @Body() raw: unknown) {
    const { reason } = parseInput(z.object({ reason: z.string().trim().max(200).default('') }), raw ?? {});
    return this.wrap(() => cancelTrip(this.prisma.client, code, reason));
  }
}
