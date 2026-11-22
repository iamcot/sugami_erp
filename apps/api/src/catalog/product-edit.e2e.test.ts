import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { hashPassword, type PrismaClient } from '@sugami/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { createTestApp } from '../test/app.js';

describe.skipIf(!process.env.DATABASE_URL)('create and edit products (MySQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let cookie: string;
  const run = randomUUID().slice(0, 6).toUpperCase();
  const email = `pe-${run.toLowerCase()}@test.local`;
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
        passwordHash: await hashPassword('pe-pass-123'),
        roles: { create: [{ roleId: role.id }] },
      },
    });
    cookie = (
      (await http().post('/api/auth/login').send({ email, password: 'pe-pass-123' }).expect(200)).headers[
        'set-cookie'
      ] as unknown as string[]
    )
      .map((c) => c.split(';')[0])
      .join('; ');
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a product with a variant matrix, rejects a duplicate code, edits product and variant', async () => {
    const code = `PE${run}`;
    const res = await http()
      .post('/api/products')
      .set('Cookie', cookie)
      .send({
        code,
        name: `Xe thử ${run}`,
        options: [
          { name: 'Màu', values: ['Đỏ', 'Xanh'] },
          { name: 'Size', values: ['S'] },
        ],
        price: 150000,
      })
      .expect(201);
    expect(res.body).toEqual({ code, variants: 2 });
    const skus = (await db.variant.findMany({ where: { product: { code } }, orderBy: { sku: 'asc' } })).map(
      (v) => v.sku,
    );
    expect(skus).toEqual([`${code}-DO-S`, `${code}-XANH-S`]);

    await http().post('/api/products').set('Cookie', cookie).send({ code, name: 'Trùng' }).expect(409);

    await http()
      .patch(`/api/products/${code}`)
      .set('Cookie', cookie)
      .send({ name: 'Tên mới', brand: `Hãng ${run}` })
      .expect(200);
    const p = await db.product.findUniqueOrThrow({ where: { code }, include: { brand: true } });
    expect(p.name).toBe('Tên mới');
    expect(p.brand?.name).toBe(`Hãng ${run}`);

    await http()
      .patch(`/api/variants/${code}-DO-S`)
      .set('Cookie', cookie)
      .send({ price: 199000, barcode: `BC${run}` })
      .expect(200);
    const v = await db.variant.findUniqueOrThrow({ where: { sku: `${code}-DO-S` } });
    expect(Number(v.price)).toBe(199000);
    await http()
      .patch(`/api/variants/${code}-XANH-S`)
      .set('Cookie', cookie)
      .send({ barcode: `BC${run}` })
      .expect(409);

    await http()
      .post(`/api/products/${code}/variants`)
      .set('Cookie', cookie)
      .send({ optionValues: ['Vàng', 'S'], price: 1000 })
      .expect(201);
    expect(await db.variant.count({ where: { product: { code } } })).toBe(3);
  });
});
