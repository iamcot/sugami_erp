/**
 * Read-only check against the real Pancake shop, run on the iMac after filling .env:
 *   pnpm pancake:probe
 * Prints counts and code mappings only, never customer data.
 */
import { PancakeAdapter } from './adapter.js';
import { PancakeClient } from './client.js';

const apiKey = process.env.PANCAKE_API_KEY ?? '';
const shopId = process.env.PANCAKE_SHOP_ID ?? '';
if (!apiKey || !shopId) {
  console.error('Thiếu PANCAKE_API_KEY hoặc PANCAKE_SHOP_ID trong .env');
  process.exit(1);
}
const client = new PancakeClient({ apiKey, shopId });
const adapter = new PancakeAdapter(client);

const accounts = await client.get<{ data?: { marketplace_id?: string; name?: string }[] }>(
  '/marketplace/get_account_info',
);
console.log(
  'Sàn đã nối:',
  (accounts.data ?? []).map((a) => `${a.name} (marketplace_id ${a.marketplace_id})`).join(', ') || 'chưa có',
);

const warehouses = await client.get<{ data?: { id: string; name?: string }[] }>('/warehouses');
console.log('Kho:', (warehouses.data ?? []).map((w) => `${w.name} (${w.id})`).join(', '));

let products = 0;
let variants = 0;
let units = 0;
const noSku: string[] = [];
for await (const p of adapter.pullProducts()) {
  products++;
  for (const v of p.variants) {
    variants++;
    units += Object.values(v.stock ?? {}).reduce((a, b) => a + b, 0);
    if (v.sku === v.externalId) noSku.push(p.name);
  }
}
console.log(`Sản phẩm: ${products}, biến thể: ${variants}, tổng tồn: ${units}, không có mã: ${noSku.length}`);

const since = new Date(Date.now() - 7 * 86_400_000);
const byChannel: Record<string, number> = {};
const byStatus: Record<string, number> = {};
for await (const o of adapter.pullOrders(since)) {
  byChannel[o.saleChannel ?? '?'] = (byChannel[o.saleChannel ?? '?'] ?? 0) + 1;
  byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
}
console.log('Đơn 7 ngày theo kênh:', byChannel);
console.log('Đơn 7 ngày theo trạng thái:', byStatus);

// Listings synced from the marketplaces into Pancake, per marketplace shop (no product details printed).
const listings: Record<string, number> = {};
let linked = 0;
let listingShown = false;
try {
  for await (const l of client.paginate<{
    marketplace_id?: string | null;
    marketplace_shop_name?: string | null;
    linked_product_custom_id?: string | null;
  }>('/marketplace/products')) {
    if (!listingShown) {
      listingShown = true;
      console.log('Cấu trúc 1 listing sàn (chỉ tên trường và kiểu, không giá trị):');
      console.log(JSON.stringify(shape(l), null, 1));
    }
    const k = `${l.marketplace_shop_name ?? '?'} (marketplace_id ${l.marketplace_id ?? '?'})`;
    listings[k] = (listings[k] ?? 0) + 1;
    if (l.linked_product_custom_id) linked++;
  }
  console.log(
    'Listing trên sàn (đã kéo về Pancake):',
    listings,
    `đã liên kết với sản phẩm Pancake: ${linked}`,
  );
} catch (e) {
  console.log('Không đọc được listing sàn:', (e as Error).message);
}

// Orders in the last 30 days by marketplace and currency (MY/PH shops sell in other currencies).
const mix: Record<string, number> = {};
for await (const o of client.paginate<{ marketplace_id?: string | null; order_currency?: string | null }>(
  '/orders',
  {
    updateStatus: 'updated_at',
    startDateTime: Math.floor((Date.now() - 30 * 86_400_000) / 1000),
    endDateTime: Math.floor(Date.now() / 1000),
  },
)) {
  const k = `${o.marketplace_id ?? 'không-sàn'} ${o.order_currency ?? '?'}`;
  mix[k] = (mix[k] ?? 0) + 1;
}
console.log('Đơn 30 ngày theo sàn và tiền tệ:', mix);
console.log(`Số request: ${client.requestCount}`);

// Shape of a few orders: key names and value kinds only (no values, so no customer data is printed).
function shape(v: unknown, depth = 0): unknown {
  if (v === null) return 'null';
  if (Array.isArray(v)) return depth > 3 ? 'array' : v.length ? [shape(v[0], depth + 1)] : [];
  if (typeof v === 'object') {
    if (depth > 3) return 'object';
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = shape(val, depth + 1);
    return out;
  }
  return typeof v === 'string' && v === '' ? 'string(empty)' : typeof v;
}
let shown = 0;
for await (const o of client.paginate<Record<string, unknown>>('/orders', {
  updateStatus: 'updated_at',
  startDateTime: Math.floor((Date.now() - 30 * 86_400_000) / 1000),
  endDateTime: Math.floor(Date.now() / 1000),
})) {
  if (shown++ >= 3) break;
  const items = Array.isArray(o.items) ? (o.items as Record<string, unknown>[]) : [];
  const unlinked = items.filter((i) => !i.variation_id && !i.product_id).length;
  console.log(
    `Cấu trúc đơn mẫu ${shown} (${items.length} dòng hàng, ${unlinked} dòng không có variation_id/product_id):`,
  );
  console.log(JSON.stringify(shape(o), null, 1));
}
if (shown === 0) console.log('Chưa có đơn nào để xem cấu trúc.');
