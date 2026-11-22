// Smoke test for the configured storage (run on the iMac: `pnpm storage:check`).
// Writes one small file under <prefix>healthcheck/, reads it back, tests a presigned upload, deletes both.
import { randomUUID } from 'node:crypto';
import { createStorageFromEnv } from './config.js';

const storage = createStorageFromEnv();
const id = randomUUID();
const body = new TextEncoder().encode(`sugami storage check ${new Date().toISOString()}\n`);
const step = async (name: string, fn: () => Promise<unknown>) => {
  try {
    const out = await fn();
    console.log(`✓ ${name}${out ? `: ${String(out)}` : ''}`);
  } catch (err) {
    console.error(`✗ ${name}: ${(err as Error).name}: ${(err as Error).message}`);
    process.exitCode = 1;
    throw err;
  }
};

async function main() {
  console.log(`Driver: ${storage.driver}`);
  const key = storage.key(`healthcheck/${id}.txt`);
  const upKey = storage.key(`healthcheck/${id}-presigned.txt`);
  await step(`put ${key}`, () => storage.put(key, body, 'text/plain'));
  await step('head', async () => `${(await storage.head(key))?.size} bytes`);
  await step('read', async () =>
    (await storage.read(key)).equals(Buffer.from(body)) ? 'khớp' : 'KHÔNG khớp',
  );
  await step('url', () => storage.url(key, { expiresInSec: 60 }).then((u) => u.split('?')[0]));
  if (storage.driver === 's3') {
    await step('presigned PUT', async () => {
      const up = await storage.presignUpload(upKey, { contentType: 'text/plain', sizeBytes: body.length });
      const res = await fetch(up.url, { method: 'PUT', headers: up.headers, body });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
      return `HTTP ${res.status}`;
    });
    await step('delete presigned', () => storage.delete(upKey));
  }
  await step('delete', () => storage.delete(key));
  console.log('Lưu trữ hoạt động bình thường.');
}

main().catch(() => {
  process.exitCode = 1;
});
