import { PancakeAdapter, PancakeClient } from '@sugami/channels-pancake';
import type { PrismaClient } from '@sugami/db';
import { PushSender, vapidFromEnv } from '@sugami/notify';
import { type NewOrder, runPancakeOrderSync } from '@sugami/sync';

const CHANNEL_NAME: Record<string, string> = { shopee: 'Shopee', tiktok: 'TikTok' };
const vnd = (n: number) => `${n.toLocaleString('vi-VN')} đ`;

/** Pancake order sync is on when the API key and shop id are set and PANCAKE_ORDER_SYNC is not "off". */
export function pancakeOrderSyncEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.PANCAKE_API_KEY && env.PANCAKE_SHOP_ID) && env.PANCAKE_ORDER_SYNC !== 'off';
}

/** Orders older than this are catch-up after downtime, not news: they do not trigger a notification. */
const FRESH_MS = 6 * 3600 * 1000;

export function orderNotifications(orders: NewOrder[], now = Date.now()) {
  const fresh = orders.filter((o) => now - o.orderedAt.getTime() < FRESH_MS);
  if (fresh.length === 0) return [];
  if (fresh.length <= 3)
    return fresh.map((o) => ({
      title: `Đơn mới ${CHANNEL_NAME[o.channel] ?? o.channel}`,
      body: `${o.code} · ${vnd(o.total)}`,
      url: '/orders',
      tag: `order-${o.code}`,
    }));
  return [
    { title: `${fresh.length} đơn mới`, body: 'Xem danh sách đơn hàng', url: '/orders', tag: 'orders-new' },
  ];
}

/** One pass: pull changed Pancake orders, apply them, notify the owner about new ones. */
export async function pancakeOrderPass(db: PrismaClient, log: (msg: string) => void = console.log) {
  const client = new PancakeClient({
    apiKey: process.env.PANCAKE_API_KEY!,
    shopId: process.env.PANCAKE_SHOP_ID!,
  });
  const result = await runPancakeOrderSync(db, new PancakeAdapter(client), {
    warehouseCode: process.env.PANCAKE_SYNC_WAREHOUSE || 'KHO-CHINH',
  });
  if (result.fetched || result.errors.length)
    log(
      `[pancake] ${result.fetched} đơn: ${result.created} mới, ${result.updated} cập nhật, ${result.unchanged} giữ nguyên, ` +
        `${result.keptFromKiotViet} từ KiotViet, bỏ qua ${result.skipped.currency + result.skipped.channel}` +
        (result.errors.length
          ? `, ${result.errors.length} LỖI: ${result.errors.map((e) => `${e.code} ${e.message}`).join('; ')}`
          : ''),
    );
  const vapid = vapidFromEnv();
  if (vapid && result.newOrders.length) {
    const sender = new PushSender(db, vapid);
    for (const payload of orderNotifications(result.newOrders))
      await sender
        .notify({ permissions: ['orders.read'] }, payload)
        .catch((e: Error) => log(`[pancake] push lỗi: ${e.message}`));
  }
  if (result.errors.length) throw new Error(`${result.errors.length} đơn Pancake bị lỗi, chưa dời con trỏ`);
  return result;
}
