import { Queue, Worker } from 'bullmq';
import { QUEUES, redisConnectionFromUrl } from './config.js';

const connection = redisConnectionFromUrl(process.env.REDIS_URL);

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

worker.on('failed', (job, err) => console.error(`[worker] job ${job?.name} failed:`, err.message));
console.log(`Sugami worker connected to redis://${connection.host}:${connection.port}`);

const shutdown = async (): Promise<void> => {
  await worker.close();
  await systemQueue.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
