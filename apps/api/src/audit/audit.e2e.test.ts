import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { applyMovements, hashPassword, runAsActor, withLedgerTx, type PrismaClient } from '@sugami/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { createTestApp } from '../test/app.js';

describe.skipIf(!process.env.DATABASE_URL)('audit log + product history (MySQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let cookie: string;
  let userId: string;
  let productId: string;
  let variantId: string;
  let warehouseId: string;
  const run = randomUUID().slice(0, 8).toUpperCase();
  const email = `audit-${run.toLowerCase()}@test.local`;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService).client;
    const owner = await db.role.upsert({
      where: { code: 'owner' },
      create: { code: 'owner', name: 'Chủ shop', permissions: ['*'] },
      update: {},
    });
    userId = (
      await db.user.create({
        data: {
          email,
          name: 'Người sửa giá',
          passwordHash: await hashPassword('audit-pass-123'),
          roles: { create: [{ roleId: owner.id }] },
        },
      })
    ).id;
    const login = await http()
      .post('/api/auth/login')
      .send({ email, password: 'audit-pass-123' })
      .expect(200);
    cookie = (login.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');

    warehouseId = (await db.warehouse.create({ data: { code: `AW-${run}`, name: 'Kho audit' } })).id;
    productId = (
      await db.product.create({ data: { code: `AP-${run}`, name: 'Lego test', searchKey: 'lego test' } })
    ).id;
    variantId = (
      await db.variant.create({ data: { productId, sku: `AP-${run}-1`, optionValues: [], price: 100_000n } })
    ).id;
  });

  afterAll(async () => {
    if (db) {
      await db.stockMovement.deleteMany({ where: { warehouseId } });
      await db.stockLevel.deleteMany({ where: { warehouseId } });
      await db.product.deleteMany({ where: { id: productId } });
      await db.warehouse.deleteMany({ where: { id: warehouseId } });
      await db.auditLog.deleteMany({ where: { userId } });
      await db.user.deleteMany({ where: { email } });
    }
    await app?.close();
  });

  it('logs a price change with the actor and the field diff', async () => {
    await runAsActor({ userId }, () =>
      db.variant.update({ where: { id: variantId }, data: { price: 129_000n } }),
    );
    // No-op update writes nothing.
    await runAsActor({ userId }, () =>
      db.variant.update({ where: { id: variantId }, data: { price: 129_000n } }),
    );

    const logs = await db.auditLog.findMany({ where: { entityType: 'variant', entityId: variantId } });
    expect(logs.map((l) => l.action)).toEqual(['create', 'update']);
    expect(logs[1]).toMatchObject({ userId, diff: { price: { from: '100000', to: '129000' } } });
  });

  it('shows field changes and stock movements in the product history', async () => {
    await withLedgerTx(db, (tx) =>
      applyMovements(tx, [{ warehouseId, variantId, qtyDelta: 5, type: 'purchase_in', unitCost: 60_000 }]),
    );
    await runAsActor({ userId }, () =>
      db.product.update({ where: { id: productId }, data: { name: 'Lego mới' } }),
    );

    const res = await http().get(`/api/products/${productId}/history`).set('Cookie', cookie).expect(200);
    const entries = res.body.data as Array<Record<string, unknown>>;
    expect(entries.find((e) => e.kind === 'stock')).toMatchObject({
      type: 'purchase_in',
      sku: `AP-${run}-1`,
      qtyDelta: '5',
      balanceAfter: '5',
    });
    expect(
      entries.find((e) => e.kind === 'change' && e.entityType === 'variant' && e.action === 'update'),
    ).toMatchObject({ sku: `AP-${run}-1`, user: { id: userId, name: 'Người sửa giá' } });
    expect(entries.find((e) => e.entityType === 'product' && e.action === 'update')).toMatchObject({
      diff: { name: { from: 'Lego test', to: 'Lego mới' } },
    });
    // costAvg moved via the ledger, but it is ignored by the audit log.
    expect(JSON.stringify(entries)).not.toContain('costAvg');
  });

  it('logs deletes and 404s a missing product', async () => {
    const extra = await db.variant.create({ data: { productId, sku: `AP-${run}-2`, optionValues: [] } });
    await db.variant.delete({ where: { id: extra.id } });
    const del = await db.auditLog.findFirst({ where: { entityId: extra.id, action: 'delete' } });
    expect(del?.diff).toMatchObject({ sku: { from: `AP-${run}-2`, to: null } });
    await http().get('/api/products/nope/history').set('Cookie', cookie).expect(404);
    await http().get(`/api/products/${productId}/history?limit=0`).set('Cookie', cookie).expect(400);
  });
});
