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
import { currentShopId, Prisma } from '@sugami/db';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { fulfillmentOf, posActions } from './pos-flow.js';
import { availability, createPosOrder, PosError, posWarehouse, runPosAction } from './pos-orders.js';
import { DraftBody, PosPayload } from './pos-schema.js';

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
  kind: 'goods' | 'material' | 'finished';
  cost_avg: bigint;
  image: string | null;
  on_hand: Prisma.Decimal | null;
}

/** Bill of materials of finished variants, for the counter screen to show and edit. */
async function recipes(db: PrismaService['client'], variantIds: string[]) {
  const items = variantIds.length
    ? await db.comboItem.findMany({
        where: { comboVariantId: { in: variantIds } },
        select: {
          comboVariantId: true,
          quantity: true,
          component: {
            select: {
              id: true,
              sku: true,
              costAvg: true,
              optionValues: true,
              product: { select: { name: true } },
            },
          },
        },
      })
    : [];
  const out = new Map<
    string,
    { variantId: string; sku: string; name: string; qty: number; cost: number }[]
  >();
  for (const i of items) {
    const opts = Object.values((i.component.optionValues ?? {}) as Record<string, unknown>).join(' / ');
    const list = out.get(i.comboVariantId) ?? [];
    list.push({
      variantId: i.component.id,
      sku: i.component.sku,
      name: `${i.component.product.name}${opts ? ` - ${opts}` : ''}`,
      qty: Number(i.quantity),
      cost: Number(i.component.costAvg),
    });
    out.set(i.comboVariantId, list);
  }
  return out;
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
  async search(
    @Query('q') raw?: string,
    @Query('inStock') inStock?: string,
    @Query('kind') kindRaw?: string,
  ) {
    const q = (raw ?? '').trim().slice(0, 64);
    const kind = ['goods', 'material', 'finished'].includes(kindRaw ?? '') ? kindRaw : null;
    const db = this.prisma.client;
    const wh = await posWarehouse(db);
    const key = `%${toSearchKey(q)}%`;
    const like = `%${q}%`;
    const rows = await db.$queryRaw<SearchRow[]>`
      SELECT v.id, v.sku, v.barcode, v.price, v.option_values, p.name AS product_name, p.kind, v.cost_avg,
             JSON_UNQUOTE(JSON_EXTRACT(v.image_urls, '$[0]')) AS image, sl.on_hand
      FROM variants v
      JOIN products p ON p.id = v.product_id
      LEFT JOIN stock_levels sl ON sl.variant_id = v.id AND sl.warehouse_id = ${wh?.id ?? ''}
      WHERE p.shop_id = ${currentShopId()} AND p.status <> 'archived'
        ${kind ? Prisma.sql`AND p.kind = ${kind}` : Prisma.empty}
        ${q ? Prisma.sql`AND (v.sku LIKE ${like} OR v.barcode = ${q} OR p.search_key LIKE ${key} OR p.code LIKE ${like})` : Prisma.empty}
        ${inStock === '1' ? Prisma.sql`AND sl.on_hand > 0` : Prisma.empty}
      ORDER BY p.updated_at DESC, v.sku ASC
      LIMIT 30`;
    const avail = await availability(
      db,
      wh?.id ?? '',
      rows.map((r) => r.id),
    );
    const bom = await recipes(
      db,
      rows.filter((r) => r.kind === 'finished').map((r) => r.id),
    );
    return {
      data: rows.map((r) => ({
        kind: r.kind,
        cost: Number(r.cost_avg),
        components: bom.get(r.id) ?? null,
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
    const wh = await posWarehouse(db);
    const vs = await db.variant.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        sku: true,
        barcode: true,
        price: true,
        optionValues: true,
        imageUrls: true,
        costAvg: true,
        product: { select: { name: true, kind: true } },
        stockLevels: { where: { warehouseId: wh?.id ?? '' }, select: { onHand: true } },
      },
    });
    const avail = await availability(
      db,
      wh?.id ?? '',
      vs.map((v) => v.id),
    );
    const bom = await recipes(
      db,
      vs.filter((v) => v.product.kind === 'finished').map((v) => v.id),
    );
    return {
      data: vs.map((v) => ({
        kind: v.product.kind,
        cost: Number(v.costAvg),
        components: bom.get(v.id) ?? null,
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
    const o = await this.prisma.client.order.findFirst({
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
    return this.wrap(() => runPosAction(this.prisma.client, code, key, user.id, extra));
  }
}
