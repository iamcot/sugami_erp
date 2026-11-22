import { describe, expect, it } from 'vitest';
import { parseDatabaseUrl } from './client.js';
import { hashPassword, verifyPassword } from './password.js';

describe('parseDatabaseUrl', () => {
  it('parses a mysql url', () => {
    expect(parseDatabaseUrl('mysql://sugami:p%40ss@host.docker.internal:3307/sugami')).toEqual({
      host: 'host.docker.internal',
      port: 3307,
      user: 'sugami',
      password: 'p@ss',
      database: 'sugami',
    });
  });
  it('rejects other protocols and missing db', () => {
    expect(() => parseDatabaseUrl('postgres://a:b@h/db')).toThrow();
    expect(() => parseDatabaseUrl('mysql://a:b@h:3306/')).toThrow();
  });
});

describe('password', () => {
  it('hashes and verifies', async () => {
    const hash = await hashPassword('dochoi-123');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('dochoi-123', hash)).toBe(true);
    expect(await verifyPassword('wrong-pass', hash)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });
  it('rejects short passwords', async () => {
    await expect(hashPassword('short')).rejects.toThrow();
  });
});

describe('migrations', () => {
  it('use utf8mb4_0900_ai_ci collation', async () => {
    const { readdirSync, readFileSync, existsSync } = await import('node:fs');
    const dir = new URL('../prisma/migrations/', import.meta.url).pathname;
    for (const name of readdirSync(dir)) {
      const file = `${dir}${name}/migration.sql`;
      if (!existsSync(file)) continue;
      expect(readFileSync(file, 'utf8'), name).not.toContain('utf8mb4_unicode_ci');
    }
  });
});
