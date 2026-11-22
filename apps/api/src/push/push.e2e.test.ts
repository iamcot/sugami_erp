import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { hashPassword, type PrismaClient } from '@sugami/db';
import { PushSender } from '@sugami/notify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { createTestApp } from '../test/app.js';
import { PushService } from './push.service.js';

describe.skipIf(!process.env.DATABASE_URL)('web push (MySQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let cookie: string;
  const run = randomUUID().slice(0, 8);
  const email = `push-${run}@test.local`;
  const endpoint = (n: number) => `https://push.example.test/${run}/${n}`;
  const sent: { endpoint: string; body: string }[] = [];
  const gone = new Set<string>();

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    Object.assign(process.env, { VAPID_PUBLIC_KEY: 'pub-key', VAPID_PRIVATE_KEY: 'priv-key' });
    app = await createTestApp();
    db = app.get(PrismaService).client;
    const role = await db.role.upsert({ where: { code: 'owner' }, create: { code: 'owner', name: 'o', permissions: ['*'] }, update: {} });
    await db.user.create({
      data: { email, name: 'Push', passwordHash: await hashPassword('push-pass-123'), roles: { create: { roleId: role.id } } },
    });
    const res = await http().post('/api/auth/login').send({ email, password: 'push-pass-123' }).expect(200);
    cookie = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
    app.get(PushService).set(
      new PushSender(db, { publicKey: 'pub-key', privateKey: 'priv-key', subject: 'https://erp.sugami.vn' }, async (sub, body) => {
        if (gone.has(sub.endpoint)) throw Object.assign(new Error('gone'), { statusCode: 410 });
        sent.push({ endpoint: sub.endpoint, body });
        return { statusCode: 201 };
      }),
    );
  });

  afterAll(async () => {
    await db?.user.deleteMany({ where: { email } });
    await app?.close();
  });

  const subscribe = (n: number) =>
    http().post('/api/push/subscriptions').set('Cookie', cookie).send({ endpoint: endpoint(n), keys: { p256dh: 'p', auth: 'a' } });

  it('serves the public key and requires login', async () => {
    expect((await http().get('/api/push/config').set('Cookie', cookie).expect(200)).body).toEqual({ publicKey: 'pub-key' });
    await http().get('/api/push/config').expect(401);
  });

  it('saves subscriptions once per endpoint and rejects non-https endpoints', async () => {
    await subscribe(1).expect(204);
    await subscribe(1).expect(204);
    await subscribe(2).expect(204);
    await http().post('/api/push/subscriptions').set('Cookie', cookie).send({ endpoint: 'http://169.254.169.254/x', keys: { p256dh: 'p', auth: 'a' } }).expect(400);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(await db.pushSubscription.count({ where: { userId: user.id } })).toBe(2);
  });

  it('sends a test push and drops subscriptions the push service says are gone', async () => {
    gone.add(endpoint(2));
    const res = await http().post('/api/push/test').set('Cookie', cookie).expect(201);
    expect(res.body).toEqual({ sent: 1, removed: 1, failed: 0 });
    expect(JSON.parse(sent.at(-1)!.body)).toMatchObject({ title: 'Sugami', url: '/' });
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect((await db.pushSubscription.findMany({ where: { userId: user.id } })).map((s) => s.endpoint)).toEqual([endpoint(1)]);
  });

  it('notifies users by permission (owner "*")', async () => {
    const before = sent.length;
    await app.get(PushService).get().notify({ permissions: ['orders.read'] }, { title: 'Đơn mới' });
    expect(sent.slice(before).map((s) => s.endpoint)).toContain(endpoint(1));
  });

  it('unsubscribes', async () => {
    await http().delete('/api/push/subscriptions').set('Cookie', cookie).send({ endpoint: endpoint(1) }).expect(204);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(await db.pushSubscription.count({ where: { userId: user.id } })).toBe(0);
  });
});
