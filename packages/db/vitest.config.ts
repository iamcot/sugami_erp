import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Load the repo .env (DATABASE_URL) for integration tests when present.
if (existsSync('../../.env') && !process.env.CI) process.loadEnvFile('../../.env');

export default defineConfig({
  test: { include: ['src/**/*.test.ts'], testTimeout: 30_000 },
});
