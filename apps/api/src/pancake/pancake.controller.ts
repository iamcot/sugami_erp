import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PancakeAdapter, PancakeClient, PancakeError, type PushProductInput } from '@sugami/channels-pancake';
import { runPancakeOrderSync } from '@sugami/sync';
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

const SyncBody = z.object({
  dryRun: z.boolean().default(true),
  /** Only used when the sync has never run: how far back to look. */
  sinceDays: z.number().int().min(1).max(1500).default(14),
  /** Look back sinceDays ignoring the saved cursor (updates older orders when not a preview). */
  rescan: z.boolean().default(false),
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
    const { dryRun, sinceDays, rescan } = parseInput(SyncBody, raw ?? {});
    return this.guard(() =>
      runPancakeOrderSync(this.prisma.client, new PancakeAdapter(this.client()), {
        warehouseCode: process.env.PANCAKE_SYNC_WAREHOUSE || 'KHO-CHINH',
        dryRun,
        sinceDays,
        ignoreCursor: rescan,
      }),
    );
  }
}
