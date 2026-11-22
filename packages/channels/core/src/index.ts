/**
 * Channel adapter contract. Core modules only talk to channels (KiotViet, TikTok Shop,
 * Shopee, ...) through this interface; channel specifics live in packages/channels/<name>.
 */

export type ChannelCode = 'kiotviet' | 'pancake' | 'tiktok' | 'shopee' | 'lazada' | 'manual';

export interface ChannelCapabilities {
  pullProducts: boolean;
  pushProducts: boolean;
  pullStock: boolean;
  pushStock: boolean;
  pullOrders: boolean;
  updateOrderStatus: boolean;
  pushListingContent: boolean;
  webhooks: boolean;
}

export interface ExternalVariant {
  externalId: string;
  sku: string;
  barcode?: string;
  name: string;
  /** Option values in display order, e.g. ["Đỏ", "Lớn"]. */
  optionValues: string[];
  /** Selling price in VND (đồng). */
  price?: number;
  /** On-hand quantity per external location id. */
  stock?: Record<string, number>;
  imageUrls?: string[];
}

export interface ExternalProduct {
  externalId: string;
  code: string;
  name: string;
  categoryExternalId?: string;
  description?: string;
  isActive: boolean;
  variants: ExternalVariant[];
  modifiedAt?: Date;
}

export interface ExternalOrderLine {
  /** Id of the variation on the source system, to resolve the SKU when the order carries none. */
  externalVariantId?: string;
  sku: string;
  name: string;
  quantity: number;
  /** Unit price in VND after line discount. */
  unitPrice: number;
}

export interface ExternalOrder {
  externalId: string;
  code: string;
  /** Marketplace order code when the order came from Shopee/TikTok through another system. */
  marketplaceCode?: string;
  saleChannel?: string;
  status: string;
  /** ISO currency of the amounts; undefined when the source does not say. */
  currency?: string;
  orderedAt: Date;
  total: number;
  /** Buyer as the source system shows it (Shopee shows the buyer's nickname). */
  customer?: { name: string; phone?: string };
  /** Shipping carrier name (e.g. SPX) and its tracking number. */
  carrier?: string;
  trackingNo?: string;
  shippingFee?: number;
  platformFee?: number;
  /** Ship-by / handover deadline set by the marketplace. */
  shipByAt?: Date;
  shipAddress?: string;
  /** Recipient phone as the source shows it; may be masked. */
  shipPhone?: string;
  shipProvince?: string;
  /** Platform fee breakdown by name, VND. */
  feeDetail?: Record<string, number>;
  lines: ExternalOrderLine[];
}

export interface StockPush {
  sku: string;
  locationExternalId?: string;
  available: number;
}

export interface PushResult {
  ok: boolean;
  externalId?: string;
  error?: string;
}

export interface RawRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
}

export interface ChannelEvent {
  type: string;
  deliveryId?: string;
  payload: unknown;
}

export interface ChannelAdapter {
  readonly code: ChannelCode;
  readonly capabilities: ChannelCapabilities;
  pullProducts(since?: Date): AsyncIterable<ExternalProduct>;
  pullOrders(since?: Date, until?: Date): AsyncIterable<ExternalOrder>;
  pushStock?(items: StockPush[]): Promise<PushResult[]>;
  verifyWebhook?(req: RawRequest): boolean;
  parseWebhook?(req: RawRequest): ChannelEvent[];
}

/** Token bucket shared by channel clients: capacity = burst, refills to requestsPerHour over an hour. */
export class RateLimiter {
  private tokens: number;
  private last: number;
  private readonly perMs: number;

  constructor(
    requestsPerHour: number,
    private readonly burst: number,
    private readonly now: () => number,
    private readonly sleep: (ms: number) => Promise<void>,
  ) {
    this.tokens = burst;
    this.perMs = requestsPerHour / 3_600_000;
    this.last = now();
  }

  async take(): Promise<void> {
    for (;;) {
      const t = this.now();
      this.tokens = Math.min(this.burst, this.tokens + (t - this.last) * this.perMs);
      this.last = t;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      await this.sleep(Math.ceil((1 - this.tokens) / this.perMs));
    }
  }
}
