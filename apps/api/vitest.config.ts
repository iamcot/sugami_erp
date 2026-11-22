import { existsSync } from 'node:fs';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Load the repo .env (DATABASE_URL) for integration tests when present.
if (existsSync('../../.env') && !process.env.CI) process.loadEnvFile('../../.env');

// SWC emits decorator metadata, which NestJS dependency injection needs.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
