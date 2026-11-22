import { z } from 'zod';

export const MODES = ['retail', 'delivery'] as const;

const int = z.number().int().min(0).max(9_999_999_999);

/** One sale as rung up on the counter screen; saved as a draft and turned into an order at checkout. */
export const PosPayload = z.object({
  lines: z
    .array(
      z.object({
        variantId: z.string().trim().min(1).max(36),
        qty: z.number().positive().max(100000),
        /** Selling price per unit, VND (editable on the screen). */
        price: int,
      }),
    )
    .max(200)
    .default([]),
  customer: z
    .object({
      id: z.string().trim().max(36).nullable().optional(),
      name: z.string().trim().max(191).nullable().optional(),
      phone: z.string().trim().max(32).nullable().optional(),
      email: z.string().trim().max(191).nullable().optional(),
      addressLine: z.string().trim().max(500).nullable().optional(),
      region: z.string().trim().max(191).nullable().optional(),
      ward: z.string().trim().max(191).nullable().optional(),
    })
    .nullable()
    .default(null),
  /** Discount on the whole order, VND. */
  discount: int.default(0),
  /** Other charges added to the order ("Thu khác"), VND. */
  otherIncome: int.default(0),
  /** What the buyer pays now. */
  paid: int.default(0),
  /** Delivery: collect the rest from the buyer on delivery (COD). */
  cod: z.boolean().default(false),
  receiver: z
    .object({
      name: z.string().trim().max(191).default(''),
      phone: z.string().trim().max(32).default(''),
      address: z.string().trim().max(500).default(''),
      area: z.string().trim().max(128).default(''),
      ward: z.string().trim().max(128).default(''),
    })
    .default({ name: '', phone: '', address: '', area: '', ward: '' }),
  carrier: z.string().trim().max(255).default(''),
  /** Fee the shop pays the carrier, VND. */
  shippingFee: int.default(0),
  trackingNo: z.string().trim().max(255).default(''),
  note: z.string().trim().max(1000).default(''),
  /** When the sale happened (defaults to now); can be set back for a sale rung up late. */
  orderedAt: z.iso.datetime().nullable().default(null),
  paymentMethod: z.enum(['cash', 'transfer', 'card', 'wallet']).default('cash'),
});
export type PosPayload = z.infer<typeof PosPayload>;

export const DraftBody = z.object({
  label: z.string().trim().min(1).max(64).optional(),
  mode: z.enum(MODES),
  payload: PosPayload,
});
