import type { PrismaClient } from '@sugami/db';
import { z } from 'zod';

/** Shipping settings kept in app_settings under this key. */
export const SHIPPING_KEY = 'shipping';

const Box = z.object({
  key: z.string().trim().min(1).max(20),
  label: z.string().trim().min(1).max(40),
  /** Heaviest order this box takes, in grams; null = no upper limit (the last box). */
  maxGrams: z.number().int().positive().nullable(),
  lengthCm: z.number().int().min(1).max(200),
  widthCm: z.number().int().min(1).max(200),
  heightCm: z.number().int().min(1).max(200),
});

export const ShippingSettings = z.object({
  pickup: z.object({
    name: z.string().trim().max(100).default(''),
    phone: z.string().trim().max(32).default(''),
    address: z.string().trim().max(255).default(''),
    ward: z.string().trim().max(128).default(''),
    province: z.string().trim().max(128).default(''),
  }),
  boxes: z.array(Box).min(1).max(6),
  /** Weight assumed for a product that has no weight yet, in grams. */
  defaultItemGrams: z.number().int().min(1).max(50_000).default(200),
  /** Who pays the carrier by default: the buyer (receiver) or the shop (sender). */
  defaultPayee: z.enum(['receiver', 'sender']).default('receiver'),
  /** Carrier preselected in each tab of the price table (partner id as Allingo reports it). */
  preferredStandard: z.string().trim().max(32).default('spx'),
  /** Ahamove service ids offered in the price table; empty = all (or AHAMOVE_SERVICES from .env). */
  ahamoveServices: z.array(z.string().trim().max(40)).max(20).default([]),
});
export type ShippingSettings = z.infer<typeof ShippingSettings>;

export const DEFAULT_SHIPPING: ShippingSettings = {
  pickup: { name: 'Sugami', phone: '', address: '', ward: '', province: '' },
  boxes: [
    { key: 'small', label: 'Nhỏ (≤ 500 g)', maxGrams: 500, lengthCm: 20, widthCm: 15, heightCm: 10 },
    { key: 'medium', label: 'Vừa (≤ 3 kg)', maxGrams: 3000, lengthCm: 30, widthCm: 25, heightCm: 20 },
    { key: 'large', label: 'Lớn (> 3 kg)', maxGrams: null, lengthCm: 50, widthCm: 40, heightCm: 30 },
  ],
  defaultItemGrams: 200,
  defaultPayee: 'receiver',
  preferredStandard: 'spx',
  ahamoveServices: [],
};

export async function loadShippingSettings(db: PrismaClient): Promise<ShippingSettings> {
  const row = await db.appSetting.findUnique({ where: { key: SHIPPING_KEY } });
  const parsed = ShippingSettings.safeParse(row?.value);
  return parsed.success ? parsed.data : DEFAULT_SHIPPING;
}

export async function saveShippingSettings(db: PrismaClient, value: ShippingSettings): Promise<void> {
  await db.appSetting.upsert({
    where: { key: SHIPPING_KEY },
    create: { key: SHIPPING_KEY, value },
    update: { value },
  });
}
