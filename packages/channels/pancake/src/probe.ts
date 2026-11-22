/**
 * Read-only check against the real Pancake shop, run on the iMac after filling .env:
 *   pnpm --filter @sugami/channels-pancake build && pnpm --filter @sugami/channels-pancake probe
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

const accounts = await client.get<{ data?: { marketplace_id?: string; name?: string }[] }>('/marketplace/get_account_info');
console.log('Sàn đã nối:', (accounts.data ?? []).map((a) => `${a.name} (marketplace_id ${a.marketplace_id})`).join(', ') || 'chưa có');

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
console.log(`Số request: ${client.requestCount}`);
