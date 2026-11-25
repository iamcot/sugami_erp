import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrismaClient } from './generated/prisma/client.js';

/** The first shop, Sugami. Its id is the default of every shop_id column (see the multi_shop migration). */
export const DEFAULT_SHOP_ID = '00000000-0000-7000-8000-000000000001';

const shopStore = new AsyncLocalStorage<{ shopId: string }>();

/**
 * Run `fn` with every Prisma query scoped to `shopId` (the API does this per request for the logged-in
 * user's shop). Outside any run, queries use DEFAULT_SHOP_ID, so background jobs (Pancake sync) and
 * scripts keep working on Sugami's data. A returned thenable is started inside the context.
 */
export function runAsShop<T>(shopId: string, fn: () => T): T {
  return shopStore.run({ shopId }, () => {
    const result = fn();
    const isThenable = typeof (result as { then?: unknown } | null)?.then === 'function';
    return (isThenable ? Promise.resolve(result) : result) as T;
  });
}

/** Shop that queries run for right now. Use it in raw SQL (`WHERE p.shop_id = ${currentShopId()}`). */
export function currentShopId(): string {
  return shopStore.getStore()?.shopId ?? DEFAULT_SHOP_ID;
}

/** Models with their own shop_id column: reads are filtered by it and creates fill it in. */
export const SHOP_MODELS = new Set([
  'Category',
  'Brand',
  'Product',
  'Variant',
  'PriceList',
  'Warehouse',
  'StockDocument',
  'MediaAsset',
  'ChannelListing',
  'Channel',
  'Customer',
  'Order',
  'PosDraft',
  'ReceiptTemplate',
  'Supplier',
  'PurchaseOrder',
  'Notification',
  'ChatConversation',
]);

/** Child models without their own column: reads are filtered through the parent that has it. */
export const SHOP_VIA: Record<string, (shopId: string) => Record<string, unknown>> = {
  StockLevel: (shopId) => ({ variant: { shopId } }),
  StockMovement: (shopId) => ({ variant: { shopId } }),
  StockDocumentLine: (shopId) => ({ document: { shopId } }),
  OrderLine: (shopId) => ({ order: { shopId } }),
  OrderLineComponent: (shopId) => ({ orderLine: { order: { shopId } } }),
  PurchaseOrderLine: (shopId) => ({ order: { shopId } }),
  PurchaseOrderCost: (shopId) => ({ order: { shopId } }),
  ChannelListingVariant: (shopId) => ({ listing: { shopId } }),
  ProductMedia: (shopId) => ({ product: { shopId } }),
  ProductContent: (shopId) => ({ product: { shopId } }),
  ProductOption: (shopId) => ({ product: { shopId } }),
  UnitConversion: (shopId) => ({ variant: { shopId } }),
  ComboItem: (shopId) => ({ combo: { shopId } }),
  PriceListItem: (shopId) => ({ priceList: { shopId } }),
  MediaVariant: (shopId) => ({ asset: { shopId } }),
};

/**
 * Relation fields that point at a shop model, per model: nested creates through them get shop_id too
 * (e.g. `product.create({ data: { variants: { create: [...] } } })`). Checked against the schema in a test.
 */
export const NESTED_SHOP_RELATIONS: Record<string, Record<string, string>> = {
  Category: { parent: 'Category', children: 'Category', products: 'Product' },
  Brand: { products: 'Product' },
  Product: { category: 'Category', brand: 'Brand', variants: 'Variant' },
  ProductOption: { product: 'Product' },
  Variant: { product: 'Product' },
  ComboItem: { combo: 'Variant', component: 'Variant' },
  UnitConversion: { variant: 'Variant' },
  PriceList: {},
  PriceListItem: { priceList: 'PriceList', variant: 'Variant' },
  Warehouse: {
    documents: 'StockDocument',
    purchaseOrders: 'PurchaseOrder',
    orders: 'Order',
    incomingTransfers: 'StockDocument',
  },
  StockLevel: { warehouse: 'Warehouse', variant: 'Variant' },
  StockMovement: { warehouse: 'Warehouse', variant: 'Variant', document: 'StockDocument' },
  StockDocument: { warehouse: 'Warehouse', toWarehouse: 'Warehouse' },
  StockDocumentLine: { document: 'StockDocument', variant: 'Variant' },
  User: { mediaUploads: 'MediaAsset' },
  MediaAsset: {},
  MediaVariant: { asset: 'MediaAsset' },
  ProductMedia: { product: 'Product', variant: 'Variant', asset: 'MediaAsset' },
  ChannelListing: {},
  ChannelListingVariant: { listing: 'ChannelListing', variant: 'Variant' },
  Channel: { orders: 'Order' },
  Customer: { orders: 'Order' },
  Order: { channel: 'Channel', customer: 'Customer', warehouse: 'Warehouse' },
  OrderLine: { order: 'Order', variant: 'Variant' },
  OrderLineComponent: { variant: 'Variant' },
  ProductContent: { product: 'Product' },
  Supplier: { orders: 'PurchaseOrder' },
  PurchaseOrder: { supplier: 'Supplier', warehouse: 'Warehouse' },
  PurchaseOrderLine: { order: 'PurchaseOrder', variant: 'Variant' },
  PurchaseOrderCost: { order: 'PurchaseOrder' },
};

type Data = Record<string, unknown>;
const isObj = (v: unknown): v is Data => typeof v === 'object' && v !== null && !Array.isArray(v);
const each = (v: unknown, fn: (d: Data) => void) => {
  if (Array.isArray(v)) v.forEach((d) => isObj(d) && fn(d));
  else if (isObj(v)) fn(v);
};

/** Set shopId on a create payload of `model` and on nested creates of shop models inside it. */
export function stampShop(model: string, data: unknown, shopId: string): void {
  each(data, (d) => {
    if (SHOP_MODELS.has(model) && d.shopId === undefined && !('shop' in d)) d.shopId = shopId;
    const rel = NESTED_SHOP_RELATIONS[model] ?? {};
    for (const [field, target] of Object.entries(rel)) {
      const nested = d[field];
      if (!isObj(nested)) continue;
      stampShop(target, nested.create, shopId);
      each(nested.createMany, (cm) => stampShop(target, cm.data, shopId));
      each(nested.connectOrCreate, (c) => stampShop(target, c.create, shopId));
      each(nested.upsert, (u) => stampShop(target, u.create, shopId));
    }
  });
}

/**
 * `where` plus the shop filter. Own-column models get `shopId` at the top level (keeps unique lookups
 * valid); child models get the parent filter appended to AND, so a caller's own filter on that same
 * relation (e.g. `order: { source: 'pos' }`) is kept.
 */
export function scopeWhere(model: string, where: unknown, shopId: string): Data | undefined {
  const w = isObj(where) ? where : undefined;
  if (SHOP_MODELS.has(model)) return { ...w, shopId };
  const f = SHOP_VIA[model]?.(shopId);
  if (!f) return w;
  const and = w?.AND === undefined ? [] : Array.isArray(w.AND) ? w.AND : [w.AND];
  return { ...w, AND: [...and, f] };
}

const READS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'updateManyAndReturn',
  'deleteMany',
  'update',
  'delete',
]);

/**
 * Prisma extension that keeps every query inside the current shop (see runAsShop): reads, updates and
 * deletes get the shop filter added to `where`, creates get shop_id filled in (nested creates too).
 * Raw SQL is not touched: add `shop_id = ${currentShopId()}` by hand.
 */
export function withShopScope(base: PrismaClient): PrismaClient {
  const extended = base.$extends({
    name: 'shop-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation: op, args, query }) {
          const operation: string = op;
          const shopId = currentShopId();
          const a = (args ?? {}) as Data;
          if (operation === 'create' || operation === 'createMany' || operation === 'createManyAndReturn') {
            stampShop(model, a.data, shopId);
          } else if (operation === 'upsert') {
            stampShop(model, a.create, shopId);
            stampShop(model, a.update, shopId);
            a.where = scopeWhere(model, a.where, shopId);
          } else if (READS.has(operation)) {
            // nested creates inside an update (e.g. new variants on a product) belong to the shop too
            if (operation.startsWith('update')) stampShop(model, a.data, shopId);
            a.where = scopeWhere(model, a.where, shopId);
          }
          return query(a as typeof args);
        },
      },
    },
  });
  return extended as unknown as PrismaClient;
}
