import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { hashPassword, type PrismaClient } from '@sugami/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { createTestApp } from '../test/app.js';

describe.skipIf(!process.env.DATABASE_URL)('purchase orders (MySQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let cookie: string;
  const run = randomUUID().slice(0, 6).toUpperCase();
  const email = `po-${run.toLowerCase()}@test.local`;
  const http = () => request(app.getHttpServer());

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
        passwordHash: await hashPassword('po-pass-123'),
        roles: { create: [{ roleId: role.id }] },
      },
    });
    cookie = (
      (await http().post('/api/auth/login').send({ email, password: 'po-pass-123' }).expect(200)).headers[
        'set-cookie'
      ] as unknown as string[]
    )
      .map((c) => c.split(';')[0])
      .join('; ');
  });

  afterAll(async () => {
    await app.close();
  });

  it('receives a CNY order at landed cost and updates stock and average cost', async () => {
    const wh = await db.warehouse.create({ data: { code: `PO-${run}`, name: 'Kho PO' } });
    const product = await db.product.create({
      data: {
        code: `PO${run}`,
        name: `Hàng nhập ${run}`,
        searchKey: `hang nhap ${run.toLowerCase()}`,
        status: 'active',
        variants: { create: [{ sku: `PO${run}-A`, optionValues: [], price: 100000n }] },
      },
      include: { variants: true },
    });
    const supplier = await http()
      .post('/api/suppliers')
      .set('Cookie', cookie)
      .send({ name: `NCC ${run}`, platform: '1688' })
      .expect(201);

    const po = await http()
      .post('/api/purchase-orders')
      .set('Cookie', cookie)
      .send({
        supplierId: supplier.body.id,
        currency: 'CNY',
        fxRate: 3600,
        warehouseCode: wh.code,
        lines: [{ sku: `PO${run}-A`, qty: 10, unitPrice: 1000 }],
        costs: [{ label: 'Ship', amount: 40000 }],
      })
      .expect(201);
    // 10 × ¥10 at 3600 = 360,000 + 40,000 ship = 400,000 / 10 = 40,000 each
    expect(po.body.lines[0].unitCost).toBe(40000);

    const code = po.body.code as string;
    const done = await http().post(`/api/purchase-orders/${code}/receive`).set('Cookie', cookie).expect(200);
    expect(done.body.status).toBe('received');
    expect(done.body.stockDocument).toMatch(/^NH/);

    const v = await db.variant.findUniqueOrThrow({ where: { id: product.variants[0]!.id } });
    expect(Number(v.costAvg)).toBe(40000);
    const level = await db.stockLevel.findUniqueOrThrow({
      where: { warehouseId_variantId: { warehouseId: wh.id, variantId: v.id } },
    });
    expect(Number(level.onHand)).toBe(10);

    await http().post(`/api/purchase-orders/${code}/receive`).set('Cookie', cookie).expect(409);
  });
});
