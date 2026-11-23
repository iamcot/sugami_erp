import { PancakeAdapter, PancakeClient } from '@sugami/channels-pancake';
import type { PrismaClient } from '@sugami/db';
import { activityFromSync, recordActivity, reportError } from './activity.js';
import { runPancakeOrderSync } from '@sugami/sync';

/** Pancake order sync is on when the API key and shop id are set and PANCAKE_ORDER_SYNC is not "off". */
export function pancakeOrderSyncEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.PANCAKE_API_KEY && env.PANCAKE_SHOP_ID) && env.PANCAKE_ORDER_SYNC !== 'off';
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
  await recordActivity(db, activityFromSync(result), log);
  if (result.errors.length)
    await reportError(
      db,
      'Đồng bộ đơn Pancake bị lỗi',
      result.errors
        .slice(0, 3)
        .map((e) => `${e.code}: ${e.message}`)
        .join('; '),
      log,
    );
  if (result.errors.length) throw new Error(`${result.errors.length} đơn Pancake bị lỗi, chưa dời con trỏ`);
  return result;
}
