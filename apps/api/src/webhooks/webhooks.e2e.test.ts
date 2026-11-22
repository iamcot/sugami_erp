import { type INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@sugami/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { createTestApp } from '../test/app.js';

describe.skipIf(!process.env.DATABASE_URL)('Pancake webhook inbox (MySQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  const marker = `t-${Date.now()}`;
  const body = { id: marker, status: 0, items: [] };

  beforeAll(async () => {
    process.env.PANCAKE_WEBHOOK_SECRET = 'hook-secret';
    app = await createTestApp();
    db = app.get(PrismaService).client;
  });
  afterAll(async () => {
    await db?.webhookEvent.deleteMany({
      where: { provider: 'pancake', body: { path: '$.id', equals: marker } },
    });
    await app?.close();
  });

  const post = () => request(app.getHttpServer()).post('/api/webhooks/pancake').send(body);

  it('rejects calls without the shared secret', async () => {
    await post().expect(403);
    await post().set('x-sugami-secret', 'wrong').expect(403);
  });

  it('stores an event once, even when Pancake retries', async () => {
    await post().set('x-sugami-secret', 'hook-secret').expect(200, { ok: true });
    await post().set('x-sugami-secret', 'hook-secret').expect(200, { ok: true, duplicate: true });
    const rows = await db.webhookEvent.findMany({
      where: { provider: 'pancake', body: { path: '$.id', equals: marker } },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ eventType: 'orders', processedAt: null });
  });
});
