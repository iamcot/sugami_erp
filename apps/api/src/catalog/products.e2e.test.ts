import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { applyMovements, hashPassword, type PrismaClient, withLedgerTx } from '@sugami/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { createTestApp } from '../test/app.js';

describe.skipIf(!process.env.DATABASE_URL)('product + order lists (MySQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let cookie: string;
  const run = randomUUID().slice(0, 6).toUpperCase();
  const email = `pl-${run.toLowerCase()}@test.local`;
  const http = () => request(app.getHttpServer());
  const get = (path: string) => http().get(path).set('Cookie', cookie).expect(200);

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService).client;
    const role = await db.role.upsert({
      where: { code: 'owner' },
      create: { code: 'owner', name: 'o', permissions: ['*'] },
      update: {},
    });
    await db.user.create({
      data: {
        email,
        name: 'o',
        passwordHash: await hashPassword('pl-pass-123'),
        roles: { create: [{ roleId: role.id }] },
      },
    });
    cookie = (
      (await http().post('/api/auth/login').send({ email, password: 'pl-pass-123' }).expect(200)).headers[
        'set-cookie'
      ] as unknown as string[]
    )
      .map((c) => c.split(';')[0])
      .join('; ');
    const wh = await db.warehouse.create({ data: { code: `PL-${run}`, name: 'Kho list' } });
    const mk = (code: string, name: string, skus: [string, number, number][]) =>
      db.product.create({
        data: {
          code: `${run}${code}`,
          name: `${name} ${run}`,
          searchKey: `${name} ${run}`
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .replace(/đ/gi, 'd')
            .toLowerCase(),
          status: 'active',
          variants: {
            create: skus.map(([s, price]) => ({ sku: `${run}${s}`, optionValues: [], price: BigInt(price) })),
          },
        },
        include: { variants: true },
      });
    const a = await mk('A', 'Xe điều khiển', [
      ['A1', 200000, 5],
      ['A2', 250000, -2],
    ]);
    await mk('B', 'Búp bê', [['B1', 90000, 0]]);
    await withLedgerTx(db, (tx) =>
      applyMovements(
        tx,
        a.variants.map((v, i) => ({
          warehouseId: wh.id,
          variantId: v.id,
          qtyDelta: i === 0 ? 5 : -2,
          type: 'adjust' as const,
        })),
      ),
    );
    const shopee = await db.channel.upsert({
      where: { code: 'shopee' },
      create: { code: 'shopee', type: 'shopee', name: 'Shopee' },
      update: {},
    });
    await db.order.create({
      data: {
        code: `HDSPE_${run}`,
        kiotvietInvoiceCode: `HDSPE_${run}`,
        externalCode: run,
        channelId: shopee.id,
        warehouseId: wh.id,
        status: 'delivered',
        total: 200000n,
        orderedAt: new Date(),
        source: 'test',
        lines: {
          create: [
            { sku: `${run}A1`, name: 'Xe', qty: 1, unitPrice: 200000n, price: 200000n, lineTotal: 200000n },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    if (db) {
      const wh = await db.warehouse.findUnique({ where: { code: `PL-${run}` } });
      if (wh) {
        await db.order.deleteMany({ where: { warehouseId: wh.id } });
        await db.stockMovement.deleteMany({ where: { warehouseId: wh.id } });
        await db.stockLevel.deleteMany({ where: { warehouseId: wh.id } });
        await db.warehouse.delete({ where: { id: wh.id } });
      }
      await db.product.deleteMany({ where: { code: { startsWith: run } } });
      await db.user.deleteMany({ where: { email } });
    }
    await app?.close();
  });

  it('finds products without diacritics, by SKU, and summarises stock', async () => {
    const res = await get(`/api/products?q=${encodeURIComponent(`xe dieu khien ${run}`)}`);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0]).toMatchObject({
      code: `${run}A`,
      variantCount: 2,
      priceMin: 200000,
      priceMax: 250000,
      onHand: 3,
      negativeSkus: 1,
    });
    expect((await get(`/api/products?q=${run}B1`)).body.data.map((p: { code: string }) => p.code)).toEqual([
      `${run}B`,
    ]);
  });

  it('filters by stock views and sorts', async () => {
    const neg = await get(`/api/products?view=negative&q=${run}&pageSize=200`);
    expect(neg.body.data.map((p: { code: string }) => p.code)).toEqual([`${run}A`]);
    const out = await get(`/api/products?view=out&q=${run}`);
    expect(out.body.data.map((p: { code: string }) => p.code)).toEqual([`${run}B`]);
    const sorted = await get(`/api/products?q=${run}&sort=price&dir=asc`);
    expect(sorted.body.data.map((p: { code: string }) => p.code)).toEqual([`${run}B`, `${run}A`]);
    expect(sorted.body.counts.all).toBeGreaterThanOrEqual(2);
    await http().get('/api/products?view=bad').set('Cookie', cookie).expect(400);
  });

  it('returns product detail by code with variants and stock', async () => {
    const res = await get(`/api/products/${run}A`);
    expect(res.body.product.variants.map((v: { sku: string; onHand: number }) => [v.sku, v.onHand])).toEqual([
      [`${run}A1`, 5],
      [`${run}A2`, -2],
    ]);
    await http().get('/api/products/nope-x').set('Cookie', cookie).expect(404);
  });

  it('lists and finds orders by marketplace code and SKU', async () => {
    const res = await get(`/api/orders?q=${run}&channel=shopee`);
    expect(res.body).toMatchObject({ total: 1, revenue: 200000 });
    expect(res.body.data[0]).toMatchObject({
      code: `HDSPE_${run}`,
      channel: { code: 'shopee' },
      items: [{ sku: `${run}A1`, qty: 1 }],
    });
    expect((await get(`/api/orders?q=${run}A1`)).body.total).toBe(1);
    expect((await get(`/api/orders/HDSPE_${run}`)).body.order).toMatchObject({
      total: 200000,
      lines: [{ qty: 1, price: 200000 }],
    });
  });

  it('lists inventory per SKU and warehouse with views and totals', async () => {
    const res = await get(`/api/inventory?q=${run}&sort=stock&dir=desc`);
    expect(res.body.data.map((r: { sku: string; onHand: number }) => [r.sku, r.onHand])).toEqual([
      [`${run}A1`, 5],
      [`${run}B1`, 0],
      [`${run}A2`, -2],
    ]);
    expect(res.body.data[0].byWarehouse).toEqual({ [`PL-${run}`]: 5 });
    expect(res.body.totals).toMatchObject({ units: 5, negative: 1, out: 2 });
    const neg = await get(`/api/inventory?q=${run}&view=negative`);
    expect(neg.body.data.map((r: { sku: string }) => r.sku)).toEqual([`${run}A2`]);
    expect(neg.body.total).toBe(1);
    expect(neg.body.totals).toMatchObject({ skus: 3, units: 5 });
    await http().get('/api/inventory?view=bad').set('Cookie', cookie).expect(400);
  });

  it('builds the dashboard from orders and stock', async () => {
    const res = await get('/api/dashboard');
    expect(res.body.today.orders).toBeGreaterThanOrEqual(1);
    expect(res.body.today.revenue).toBeGreaterThanOrEqual(200000);
    expect(res.body.series).toHaveLength(14);
    expect(res.body.series.at(-1).byChannel.shopee).toBeGreaterThanOrEqual(200000);
    expect(res.body.todo.negativeSkus).toBeGreaterThanOrEqual(1);
  });
});
