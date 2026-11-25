import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { createPrismaClient } from '@sugami/db';
import { QUEUES, redisConnectionFromUrl } from './config.js';
import { pancakeOrderPass, pancakeOrderSyncEnabled } from './pancake-orders.js';
import { pancakeStockPass } from './pancake-stock.js';
import { chatPass, chatSyncEnabled } from './chat.js';

const redisOptions = redisConnectionFromUrl(process.env.REDIS_URL);
// BullMQ in native ESM needs a constructed client; workers require maxRetriesPerRequest: null.
const connection = new Redis({ ...redisOptions, maxRetriesPerRequest: null });

// System queue: a heartbeat job proves the worker and Redis are alive.
const systemQueue = new Queue(QUEUES.system, { connection });
await systemQueue.upsertJobScheduler('heartbeat', { every: 60_000 }, { name: 'heartbeat' });

const worker = new Worker(
  QUEUES.system,
  async (job) => {
    if (job.name === 'heartbeat') return { at: new Date().toISOString() };
    throw new Error(`Unknown job: ${job.name}`);
  },
  { connection },
);

// Pancake: orders (catch up on start, then every 5 minutes), stock push, and the chat inbox (every 2 minutes,
// so the owner hears about new buyer messages even when the app is closed).
const pancakeQueue = new Queue(QUEUES.pancake, { connection });
let pancakeWorker: Worker | undefined;
const db = createPrismaClient();
const ordersOn = pancakeOrderSyncEnabled();
const chatOn = chatSyncEnabled();
if (ordersOn) {
  await pancakeQueue.upsertJobScheduler('orders', { every: 5 * 60_000 }, { name: 'orders' });
  // Stock push: checks every 2 minutes; does nothing until switched on in settings.
  await pancakeQueue.upsertJobScheduler('stock', { every: 2 * 60_000 }, { name: 'stock' });
  await pancakeQueue.add('orders', {}, { jobId: `orders-startup-${Date.now()}`, removeOnComplete: true });
  console.log('[worker] Pancake order sync on (every 5 minutes)');
} else {
  await pancakeQueue.removeJobScheduler('orders');
  await pancakeQueue.removeJobScheduler('stock');
  console.log('[worker] Pancake order sync off (set PANCAKE_API_KEY and PANCAKE_SHOP_ID)');
}
if (chatOn) {
  await pancakeQueue.upsertJobScheduler('chat', { every: 2 * 60_000 }, { name: 'chat' });
  console.log('[worker] Pancake chat watch on (every 2 minutes)');
} else {
  await pancakeQueue.removeJobScheduler('chat');
  console.log(
    '[worker] Pancake chat watch off (set PANCAKE_CHAT_PAGES or PANCAKE_CHAT_PAGE_ID + PANCAKE_CHAT_TOKEN)',
  );
}
if (ordersOn || chatOn) {
  pancakeWorker = new Worker(
    QUEUES.pancake,
    async (job) => {
      if (job.name === 'orders' && ordersOn) return pancakeOrderPass(db);
      if (job.name === 'stock' && ordersOn) {
        await pancakeStockPass(db);
        return;
      }
      if (job.name === 'chat' && chatOn) return chatPass(db);
      throw new Error(`Unknown job: ${job.name}`);
    },
    { connection, concurrency: 1 },
  );
  pancakeWorker.on('failed', (job, err) =>
    console.error(`[worker] pancake ${job?.name} failed:`, err.message),
  );
}

worker.on('failed', (job, err) => console.error(`[worker] job ${job?.name} failed:`, err.message));
console.log(`Sugami worker connected to redis://${redisOptions.host}:${redisOptions.port}`);

const shutdown = async (): Promise<void> => {
  await worker.close();
  await pancakeWorker?.close();
  await pancakeQueue.close();
  await db.$disconnect();
  await systemQueue.close();
  await connection.quit();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
