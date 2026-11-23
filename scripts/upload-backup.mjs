// Đẩy một file sao lưu lên S3 bằng lớp lưu trữ của Sugami (cùng .env, không cần aws cli).
// Dùng: node scripts/upload-backup.mjs <file.sql.gz>. Cần đã build: pnpm --filter @sugami/storage build
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('Thiếu đường dẫn file');
  process.exit(2);
}
const { createStorageFromEnv } = await import('../packages/storage/dist/index.js');
const storage = createStorageFromEnv();
if (storage.driver !== 's3') {
  console.log('STORAGE_DRIVER không phải s3, bỏ qua đẩy lên S3');
  process.exit(0);
}
const key = storage.key(`backups/${basename(file)}`);
await storage.put(key, await readFile(file), 'application/gzip');
console.log(`Đã đẩy lên S3: ${key}`);
