/**
 * Channel adapter contract. Core modules only talk to channels (KiotViet, TikTok Shop,
 * Shopee, ...) through this interface; channel specifics live in packages/channels/<name>.
 */

export type ChannelCode = 'kiotviet' | 'tiktok' | 'shopee' | 'lazada' | 'manual';

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
  orderedAt: Date;
  total: number;
  shippingFee?: number;
  platformFee?: number;
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
  pullOrders(since?: Date): AsyncIterable<ExternalOrder>;
  pushStock?(items: StockPush[]): Promise<PushResult[]>;
  verifyWebhook?(req: RawRequest): boolean;
  parseWebhook?(req: RawRequest): ChannelEvent[];
}
