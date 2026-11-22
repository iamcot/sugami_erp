import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createStorageFromEnv } from './config.js';
import { LocalStorage } from './local.js';
import { needsPathStyle, S3Storage } from './s3.js';
import { assertSafeKey, joinKey } from './types.js';

describe('keys', () => {
  it('joins the prefix', () => {
    expect(joinKey('sugami/', 'media/a.jpg')).toBe('sugami/media/a.jpg');
    expect(joinKey('erp', '/media/a.jpg')).toBe('erp/media/a.jpg');
    expect(joinKey('', 'a.jpg')).toBe('a.jpg');
  });

  it('rejects unsafe keys', () => {
    for (const k of ['', '/abs', 'a/../b', 'a//b', 'a\\b', './a']) expect(() => assertSafeKey(k)).toThrow();
    expect(() => assertSafeKey('sugami/media/2026/11/x.jpg')).not.toThrow();
  });
});

describe('S3Storage (offline signing)', () => {
  const s3 = (extra: Partial<ConstructorParameters<typeof S3Storage>[0]> = {}) =>
    new S3Storage({
      region: 'ap-southeast-1',
      bucket: 'sugami.vn',
      accessKeyId: 'AKIATEST',
      secretAccessKey: 'secret',
      prefix: 'erp/',
      ...extra,
    });

  it('uses path-style for dotted bucket names', () => {
    expect(needsPathStyle('sugami.vn')).toBe(true);
    expect(needsPathStyle('sugami-media')).toBe(false);
    expect(needsPathStyle('sugami-media', 'https://r2.example')).toBe(true);
  });

  it('presigns an upload that pins content type and length', async () => {
    const up = await s3().presignUpload('erp/media/a.jpg', { contentType: 'image/jpeg', sizeBytes: 1234 });
    const url = new URL(up.url);
    expect(url.host).toBe('s3.ap-southeast-1.amazonaws.com');
    expect(url.pathname).toBe('/sugami.vn/erp/media/a.jpg');
    const signed = url.searchParams.get('X-Amz-SignedHeaders') ?? '';
    expect(signed).toContain('content-type');
    expect(signed).toContain('content-length');
    expect(up.headers).toEqual({ 'Content-Type': 'image/jpeg' });
    expect(up.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('builds public or presigned view URLs', async () => {
    expect(await s3({ publicBaseUrl: 'https://cdn.sugami.vn/' }).url('erp/media/xe đỏ.jpg')).toBe(
      'https://cdn.sugami.vn/erp/media/xe%20%C4%91%E1%BB%8F.jpg',
    );
    expect(await s3().url('erp/media/a.jpg')).toMatch(/X-Amz-Signature=/);
  });
});

describe('LocalStorage', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sugami-storage-'));
  afterAll(() => rm(dir, { recursive: true, force: true }));
  const local = new LocalStorage({
    dir,
    prefix: 'sugami/',
    signingSecret: 'test-secret',
    uploadBaseUrl: '/api/media/local-upload',
    fileBaseUrl: '/api/media/local-files',
  });

  it('puts, heads, reads and deletes files', async () => {
    const key = local.key('media/a.txt');
    expect(await local.head(key)).toBeNull();
    await local.put(key, new TextEncoder().encode('hello'), 'text/plain');
    expect(await local.head(key)).toEqual({ size: 5 });
    expect((await local.read(key)).toString()).toBe('hello');
    expect(await local.url(key)).toBe('/api/media/local-files/sugami/media/a.txt');
    await local.delete(key);
    expect(await local.head(key)).toBeNull();
  });

  it('signs upload tokens that expire and cannot be forged', async () => {
    const up = await local.presignUpload('sugami/media/b.jpg', { contentType: 'image/jpeg', sizeBytes: 10 });
    const token = up.url.split('/').pop()!;
    expect(local.verifyUploadToken(token)).toMatchObject({ key: 'sugami/media/b.jpg', sizeBytes: 10 });
    expect(local.verifyUploadToken(token, Date.now() + 16 * 60_000)).toBeNull();
    const [payload] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ key: 'x', contentType: 'a', sizeBytes: 1e9, exp: 9e15 }),
    ).toString('base64url');
    expect(local.verifyUploadToken(`${forged}.${token.split('.')[1]}`)).toBeNull();
    expect(local.verifyUploadToken(`${payload}.bad`)).toBeNull();
    expect(local.verifyUploadToken('garbage')).toBeNull();
  });
});

describe('createStorageFromEnv', () => {
  it('picks the driver and validates S3 settings', () => {
    expect(createStorageFromEnv({ STORAGE_DRIVER: 'local', APP_ENCRYPTION_KEY: 'k' }).driver).toBe('local');
    expect(() => createStorageFromEnv({ STORAGE_DRIVER: 's3' })).toThrow(/S3_BUCKET/);
    expect(() => createStorageFromEnv({ STORAGE_DRIVER: 'ftp' })).toThrow(/STORAGE_DRIVER/);
    const s = createStorageFromEnv({
      S3_REGION: 'ap-southeast-1',
      S3_BUCKET: 'sugami.vn',
      S3_PREFIX: 'erp/',
    });
    expect(s.driver).toBe('s3');
    expect(s.key('media/a.jpg')).toBe('erp/media/a.jpg');
  });
});
