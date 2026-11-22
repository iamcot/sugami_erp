// Prisma always emits utf8mb4_unicode_ci for MySQL tables. We want utf8mb4_0900_ai_ci
// (accent-insensitive, and treats "đ" as "d"), so Vietnamese search works without diacritics.
// Runs between `migrate dev --create-only` and applying; applied migrations are already
// fixed, so their checksums never change.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../prisma/migrations/', import.meta.url).pathname;
if (!existsSync(dir)) process.exit(0);
for (const name of readdirSync(dir)) {
  const file = join(dir, name, 'migration.sql');
  if (!existsSync(file)) continue;
  const sql = readFileSync(file, 'utf8');
  const fixed = sql.replaceAll('utf8mb4_unicode_ci', 'utf8mb4_0900_ai_ci');
  if (fixed !== sql) {
    writeFileSync(file, fixed);
    console.log(`fixed collation in ${name}`);
  }
}
