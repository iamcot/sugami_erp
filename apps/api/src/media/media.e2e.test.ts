import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type INestApplication } from '@nestjs/common';
import { hashPassword, type PrismaClient } from '@sugami/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { createTestApp } from '../test/app.js';

describe.skipIf(!process.env.DATABASE_URL)('media upload, local driver (MySQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let dir: string;
  let cookie: string;
  let staffCookie: string;
  const run = randomUUID().slice(0, 8);
  const emails = [`media-${run}@test.local`, `media-kho-${run}@test.local`];
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

  const http = () => request(app.getHttpServer());
  const login = async (email: string) => {
    const res = await http().post('/api/auth/login').send({ email, password: 'media-pass-123' }).expect(200);
    return (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
  };
  const pathOf = (url: string) => new URL(url, 'http://x').pathname;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sugami-media-'));
    Object.assign(process.env, {
      STORAGE_DRIVER: 'local',
      STORAGE_DIR: dir,
      S3_PREFIX: 'sugami/',
      APP_ENCRYPTION_KEY: 'test-key',
    });
    app = await createTestApp();
    db = app.get(PrismaService).client;
    const roles = [
      ['owner', ['*']],
      ['warehouse', ['catalog.read']],
    ] as const;
    for (const [i, [code, permissions]] of roles.entries()) {
      const role = await db.role.upsert({
        where: { code },
        create: { code, name: code, permissions: [...permissions] },
        update: {},
      });
      await db.user.create({
        data: {
          email: emails[i]!,
          name: code,
          passwordHash: await hashPassword('media-pass-123'),
          roles: { create: [{ roleId: role.id }] },
        },
      });
    }
    cookie = await login(emails[0]!);
    staffCookie = await login(emails[1]!);
  });

  afterAll(async () => {
    if (db) {
      const users = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
      await db.mediaAsset.deleteMany({ where: { uploadedBy: { in: users.map((u) => u.id) } } });
      await db.user.deleteMany({ where: { email: { in: emails } } });
    }
    await app?.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  const start = (body: object, c = cookie) => http().post('/api/media/uploads').set('Cookie', c).send(body);

  it('uploads an image: presign → PUT → complete → view', async () => {
    const res = await start({
      filename: 'xe đỏ.png',
      contentType: 'image/png',
      sizeBytes: png.length,
    }).expect(201);
    const { asset, upload } = res.body;
    expect(asset).toMatchObject({ kind: 'image', status: 'pending', url: null, originalName: 'xe đỏ.png' });
    expect(upload).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'image/png' } });

    // Not uploaded yet.
    await http().post(`/api/media/${asset.id}/complete`).set('Cookie', cookie).expect(409);

    await http().put(pathOf(upload.url)).set('Content-Type', 'image/png').send(png).expect(200);
    const done = await http().post(`/api/media/${asset.id}/complete`).set('Cookie', cookie).expect(200);
    expect(done.body.asset).toMatchObject({ status: 'ready', sizeBytes: png.length });
    expect(done.body.asset.url).toMatch(/^\/api\/media\/local-files\/sugami\/media\/\d{4}\/\d{2}\/.+\.png$/);

    const file = await http().get(done.body.asset.url).set('Cookie', staffCookie).expect(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(Buffer.from(file.body as Buffer).equals(png)).toBe(true);
    await http().get(done.body.asset.url).expect(401);

    const list = await http().get('/api/media').set('Cookie', staffCookie).expect(200);
    expect(list.body.data.map((a: { id: string }) => a.id)).toContain(asset.id);
  });

  it('rejects bad uploads', async () => {
    await start({ filename: 'a.exe', contentType: 'application/x-msdownload', sizeBytes: 10 }).expect(415);
    await start({ filename: 'big.jpg', contentType: 'image/jpeg', sizeBytes: 21 * 1024 * 1024 }).expect(413);
    await start({ filename: '', contentType: 'image/jpeg', sizeBytes: 10 }).expect(400);
    await start({ filename: 'a.png', contentType: 'image/png', sizeBytes: 4 }, staffCookie).expect(403);

    const { upload } = (
      await start({ filename: 'a.png', contentType: 'image/png', sizeBytes: 4 }).expect(201)
    ).body;
    const url = pathOf(upload.url);
    await http().put(url).set('Content-Type', 'image/jpeg').send(Buffer.alloc(4)).expect(403);
    await http().put(url).set('Content-Type', 'image/png').send(Buffer.alloc(9)).expect(413);
    await http().put(url).set('Content-Type', 'image/png').send(Buffer.alloc(2)).expect(409);
    await http().put(`${url}x`).set('Content-Type', 'image/png').send(Buffer.alloc(4)).expect(403);
  });
});
