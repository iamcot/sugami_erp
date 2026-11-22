import { timingSafeEqual } from 'node:crypto';
import type {
  ChannelAdapter,
  ChannelEvent,
  ExternalOrder,
  ExternalProduct,
  RawRequest,
} from '@sugami/channels-core';
import type { PancakeClient } from './client.js';
import { groupVariations, toExternalOrder } from './mapping.js';
import { Order, Variation } from './schemas.js';

export type PancakeWebhookType =
  'orders' | 'products' | 'variations_warehouses' | 'customers' | 'einvoices' | 'auto_call' | 'unknown';

export interface PancakeAdapterOptions {
  /** Value Pancake sends in `webhookHeader` (set in Pancake under webhook_headers). */
  webhookSecret?: string;
  webhookHeader?: string;
}

const unix = (d: Date) => Math.floor(d.getTime() / 1000);

/**
 * Read-only Pancake adapter (trial phase): products with stock per warehouse, orders, webhooks.
 * Stock push comes later, once Pancake is the single system pushing stock to the marketplaces.
 */
export class PancakeAdapter implements ChannelAdapter {
  readonly code = 'pancake' as const;
  readonly capabilities = {
    pullProducts: true,
    pushProducts: false,
    pullStock: true,
    pushStock: false,
    pullOrders: true,
    updateOrderStatus: false,
    pushListingContent: false,
    webhooks: true,
  };
  private readonly header: string;

  constructor(
    private readonly client: PancakeClient,
    private readonly opts: PancakeAdapterOptions = {},
  ) {
    this.header = (opts.webhookHeader ?? 'x-sugami-secret').toLowerCase();
  }

  /** All variations (changed since `since`, if given), grouped into products. */
  async *pullProducts(since?: Date): AsyncIterable<ExternalProduct> {
    const query = since ? { start_time_update: unix(since), end_time_update: unix(new Date()) } : {};
    const variations: Variation[] = [];
    for await (const raw of this.client.paginate<unknown>('/products/variations', query))
      variations.push(Variation.parse(raw));
    yield* groupVariations(variations);
  }

  /** Orders updated from `since` to `until` (now when omitted); all orders when `since` is omitted. */
  async *pullOrders(since?: Date, until?: Date): AsyncIterable<ExternalOrder> {
    const query = since
      ? { updateStatus: 'updated_at', startDateTime: unix(since), endDateTime: unix(until ?? new Date()) }
      : {};
    for await (const raw of this.client.paginate<unknown>('/orders', query))
      yield toExternalOrder(Order.parse(raw));
  }

  verifyWebhook(req: RawRequest): boolean {
    return verifyPancakeWebhook(req, this.opts.webhookSecret, this.header);
  }

  /**
   * The docs don't show every payload envelope, so the type is read from `type` when present and
   * otherwise inferred from the shape. Payloads are re-fetched through the API before use anyway.
   */
  parseWebhook(req: RawRequest): ChannelEvent[] {
    const body = JSON.parse(req.rawBody) as Record<string, unknown>;
    return [{ type: webhookType(body), payload: body }];
  }
}

/** Pancake does not sign webhooks; we check a shared secret header we configure on their side. */
export function verifyPancakeWebhook(
  req: Pick<RawRequest, 'headers'>,
  secret: string | undefined,
  header = 'x-sugami-secret',
): boolean {
  if (!secret) return false;
  const got = req.headers[header.toLowerCase()];
  const value = Array.isArray(got) ? got[0] : got;
  if (!value) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function webhookType(body: Record<string, unknown>): PancakeWebhookType {
  const known: PancakeWebhookType[] = [
    'orders',
    'products',
    'variations_warehouses',
    'customers',
    'einvoices',
    'auto_call',
  ];
  if (typeof body.type === 'string' && known.includes(body.type as PancakeWebhookType))
    return body.type as PancakeWebhookType;
  const obj = (body.data && typeof body.data === 'object' ? body.data : body) as Record<string, unknown>;
  if ('items' in obj && 'status' in obj) return 'orders';
  if ('variation_id' in obj && 'warehouse_id' in obj) return 'variations_warehouses';
  if ('variations' in obj || ('product_id' in obj && 'retail_price' in obj)) return 'products';
  if ('phone_numbers' in obj) return 'customers';
  return 'unknown';
}
