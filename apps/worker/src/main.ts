import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { createPrismaClient } from '@sugami/db';
import { QUEUES, redisConnectionFromUrl } from './config.js';
import { pancakeOrderPass, pancakeOrderSyncEnabled } from './pancake-orders.js';
import { pancakeStockPass } from './pancake-stock.js';

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

// Pancake orders: catch up on start (the machine may have been off) and then every 5 minutes.
const pancakeQueue = new Queue(QUEUES.pancake, { connection });
let pancakeWorker: Worker | undefined;
const db = createPrismaClient();
if (pancakeOrderSyncEnabled()) {
  await pancakeQueue.upsertJobScheduler('orders', { every: 5 * 60_000 }, { name: 'orders' });
  // Stock push: checks every 2 minutes; does nothing until switched on in settings.
  await pancakeQueue.upsertJobScheduler('stock', { every: 2 * 60_000 }, { name: 'stock' });
  await pancakeQueue.add('orders', {}, { jobId: `orders-startup-${Date.now()}`, removeOnComplete: true });
  pancakeWorker = new Worker(
    QUEUES.pancake,
    async (job) => {
      if (job.name === 'orders') return pancakeOrderPass(db);
      if (job.name === 'stock') {
        await pancakeStockPass(db);
        return;
      }
      throw new Error(`Unknown job: ${job.name}`);
    },
    { connection, concurrency: 1 },
  );
  pancakeWorker.on('failed', (job, err) =>
    console.error(`[worker] pancake ${job?.name} failed:`, err.message),
  );
  console.log('[worker] Pancake order sync on (every 5 minutes)');
} else {
  await pancakeQueue.removeJobScheduler('orders');
  await pancakeQueue.removeJobScheduler('stock');
  console.log('[worker] Pancake order sync off (set PANCAKE_API_KEY and PANCAKE_SHOP_ID)');
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
