import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ShippingService } from './shipping.service.js';
import { loadShippingSettings, saveShippingSettings, ShippingSettings } from './shipping-settings.js';

const Parcel = z.object({
  boxKey: z.string().trim().max(20).optional(),
  weightGrams: z.number().int().min(1).max(100_000).optional(),
  lengthCm: z.number().int().min(1).max(200).optional(),
  widthCm: z.number().int().min(1).max(200).optional(),
  heightCm: z.number().int().min(1).max(200).optional(),
  addFeeToOrder: z.boolean().default(false),
});
const CreateBody = Parcel.extend({
  serviceId: z.string().trim().min(1).max(64),
  quotedPrice: z.number().int().min(0),
  /** Book for a later time (ISO); omitted = a driver is looked for now. */
  scheduleAt: z.iso.datetime().optional(),
});
const DraftQuoteBody = Parcel.extend({
  receiver: z.object({
    name: z.string().trim().max(191).default(''),
    phone: z.string().trim().min(1).max(32),
    address: z.string().trim().min(1).max(500),
    ward: z.string().trim().max(128).default(''),
    area: z.string().trim().max(128).default(''),
  }),
  lines: z
    .array(z.object({ variantId: z.string().trim().min(1).max(36), qty: z.number().positive().max(100000) }))
    .min(1)
    .max(200),
  codAmount: z.number().int().min(0).default(0),
  total: z.number().int().min(0).default(0),
});

/** Carrier waybills for self-delivered counter orders, through the Allingo gateway. */
@Controller()
export class ShippingController {
  constructor(
    private readonly shipping: ShippingService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('shipping/status')
  @RequirePermissions('orders.read')
  status() {
    return this.shipping.status();
  }

  @Get('shipping/ahamove-services')
  @RequirePermissions('orders.read')
  async ahamoveServices() {
    return { data: await this.shipping.ahamoveServices() };
  }

  @Get('shipping/settings')
  @RequirePermissions('orders.read')
  settings() {
    return loadShippingSettings(this.prisma.client);
  }

  @Put('shipping/settings')
  @RequirePermissions('settings.write')
  async saveSettings(@Body() raw: unknown) {
    const s = parseInput(ShippingSettings, raw);
    await saveShippingSettings(this.prisma.client, s);
    return s;
  }

  @Get('orders/:code/shipments')
  @RequirePermissions('orders.read')
  list(@Param('code') code: string) {
    return this.shipping.forOrder(code);
  }

  @Post('orders/:code/shipping-quotes')
  @HttpCode(200)
  @RequirePermissions('orders.write')
  quotes(@Param('code') code: string, @Body() raw: unknown) {
    return this.shipping.quotes(code, parseInput(Parcel, raw ?? {}));
  }

  /** Prices for a sale that is still on the counter screen (the order does not exist yet). */
  @Post('shipping/quotes')
  @HttpCode(200)
  @RequirePermissions('orders.write')
  draftQuotes(@Body() raw: unknown) {
    return this.shipping.draftQuotes(parseInput(DraftQuoteBody, raw));
  }

  @Post('orders/:code/dispatch-now')
  @HttpCode(200)
  @RequirePermissions('orders.write')
  dispatchNow(@Param('code') code: string, @Body() raw: unknown, @CurrentUser() user: AuthUser) {
    const { shipmentId } = parseInput(
      z.object({ shipmentId: z.string().trim().max(36).optional() }),
      raw ?? {},
    );
    return this.shipping.dispatchNow(code, shipmentId, user.id);
  }

  @Post('shipments/:id/refresh')
  @HttpCode(200)
  @RequirePermissions('orders.write')
  refresh(@Param('id') id: string) {
    return this.shipping.refresh(id);
  }

  @Post('orders/:code/shipments')
  @HttpCode(200)
  @RequirePermissions('orders.write')
  create(@Param('code') code: string, @Body() raw: unknown, @CurrentUser() user: AuthUser) {
    return this.shipping.create(code, parseInput(CreateBody, raw), user.id);
  }

  @Post('shipments/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('orders.write')
  cancel(@Param('id') id: string) {
    return this.shipping.cancel(id);
  }

  @Get('shipments/:id/label')
  @RequirePermissions('orders.read')
  label(@Param('id') id: string) {
    return this.shipping.label(id);
  }
}
