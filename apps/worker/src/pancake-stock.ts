import { listWarehouses, PancakeClient, setStock } from '@sugami/channels-pancake';
import type { PrismaClient } from '@sugami/db';
import { runStockPush } from '@sugami/sync';
import { reportError } from './activity.js';

/** One pass of the automatic stock push (does nothing while it is paused in settings or orders are behind). */
export async function pancakeStockPass(db: PrismaClient, log: (msg: string) => void = console.log) {
  const code = process.env.PANCAKE_SYNC_WAREHOUSE || 'KHO-CHINH';
  const sugami = await db.warehouse.findFirst({ where: { code }, select: { id: true } });
  if (!sugami) return;
  const client = new PancakeClient({
    apiKey: process.env.PANCAKE_API_KEY!,
    shopId: process.env.PANCAKE_SHOP_ID!,
  });
  let pancakeWarehouse: string | undefined;
  const warehouseId = async () => {
    if (pancakeWarehouse) return pancakeWarehouse;
    const all = await listWarehouses(client);
    const wanted = process.env.PANCAKE_WAREHOUSE_ID;
    const w = wanted ? all.find((x) => x.id === wanted) : all.length === 1 ? all[0] : undefined;
    if (!w) throw new Error('Không xác định được kho Pancake (đặt PANCAKE_WAREHOUSE_ID)');
    return (pancakeWarehouse = w.id);
  };
  const r = await runStockPush(
    db,
    { setStock: async (variationId, qty) => setStock(client, variationId, await warehouseId(), qty) },
    { warehouseId: sugami.id, dryRun: false, auto: true },
  );
  if (r.changed || r.failed.length)
    log(
      `[pancake] đẩy tồn: ${r.pushed}/${r.changed} biến thể` +
        (r.failed.length
          ? `, ${r.failed.length} LỖI: ${r.failed
              .slice(0, 3)
              .map((f) => `${f.sku} ${f.message}`)
              .join('; ')}`
          : ''),
    );
  if (r.failed.length)
    await reportError(
      db,
      'Đẩy tồn lên Pancake bị lỗi',
      `${r.failed.length} biến thể lỗi: ${r.failed
        .slice(0, 3)
        .map((f) => `${f.sku} ${f.message}`)
        .join('; ')}`,
      log,
    );
  return r;
}
