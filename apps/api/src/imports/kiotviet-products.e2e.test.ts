import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { writeSheet } from '@sugami/channels-kiotviet';
import { hashPassword, type PrismaClient } from '@sugami/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { createTestApp } from '../test/app.js';

const H = [
  'Nhóm hàng(3 Cấp)',
  'Mã hàng',
  'Mã vạch',
  'Tên hàng',
  'Giá bán',
  'Giá vốn',
  'Tồn kho',
  'Thuộc tính',
  'Mã HH Liên quan',
];

describe.skipIf(!process.env.DATABASE_URL)('KiotViet product import (MySQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let cookie: string;
  let staffCookie: string;
  const run = randomUUID().slice(0, 6).toUpperCase();
  const wh = `KV-${run}`;
  const cat = `Bé chơi ${run}`;
  const sku = (s: string) => `${run}-${s}`;
  const emails = [`kv-${run}@test.local`, `kv-kho-${run}@test.local`];

  const http = () => request(app.getHttpServer());
  const xlsx = (stockB = 5, extraRows: (string | number | null)[][] = []) =>
    writeSheet('Sheet1', H, [
      [cat, sku('A'), null, 'Xe điều khiển', 250000, 120000.4, 10, 'MÀU:Đỏ', null],
      [cat, sku('B'), null, 'Xe điều khiển', 260000, 125000, stockB, 'MÀU:Xanh', sku('A')],
      [cat, sku('C'), `BC${run}`, 'Lego mini', 0, 30000, -2, null, null],
      ...extraRows,
    ]);
  const upload = (buf: Buffer, dryRun: boolean, c = cookie) =>
    http()
      .post(`/api/imports/kiotviet/products?dryRun=${dryRun}&warehouse=${wh}`)
      .set('Cookie', c)
      .attach('file', buf, 'DanhSachSanPham_KV.xlsx');

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService).client;
    await db.warehouse.create({ data: { code: wh, name: 'Kho import test' } });
    for (const [i, [code, perms]] of (
      [
        ['owner', ['*']],
        ['warehouse', ['inventory.write']],
      ] as const
    ).entries()) {
      const role = await db.role.upsert({
        where: { code },
        create: { code, name: code, permissions: [...perms] },
        update: {},
      });
      await db.user.create({
        data: {
          email: emails[i]!,
          name: code,
          passwordHash: await hashPassword('kv-pass-123'),
          roles: { create: [{ roleId: role.id }] },
        },
      });
    }
    const login = async (email: string) =>
      (
        (await http().post('/api/auth/login').send({ email, password: 'kv-pass-123' }).expect(200)).headers[
          'set-cookie'
        ] as unknown as string[]
      )
        .map((c) => c.split(';')[0])
        .join('; ');
    cookie = await login(emails[0]!);
    staffCookie = await login(emails[1]!);
  });

  afterAll(async () => {
    if (db) {
      const w = await db.warehouse.findFirst({ where: { code: wh } });
      if (w) {
        await db.stockMovement.deleteMany({ where: { warehouseId: w.id } });
        await db.stockLevel.deleteMany({ where: { warehouseId: w.id } });
      }
      await db.externalRef.deleteMany({
        where: { provider: 'kiotviet', externalId: { startsWith: `${run}-` } },
      });
      await db.product.deleteMany({ where: { code: { startsWith: `${run}-` } } });
      await db.category.deleteMany({ where: { name: cat } });
      await db.warehouse.deleteMany({ where: { code: wh } });
      await db.user.deleteMany({ where: { email: { in: emails } } });
    }
    await app?.close();
  });

  it('previews without writing', async () => {
    const res = await upload(await xlsx(), true).expect(200);
    expect(res.body).toMatchObject({
      dryRun: true,
      rows: 3,
      categories: { created: 1 },
      products: { created: 2 },
      variants: { created: 3 },
      openingStock: { skus: 3, units: 13 },
    });
    expect(res.body.issues.map((i: { message: string }) => i.message)).toEqual([
      'Giá bán bằng 0',
      'Tồn kho âm (-2)',
    ]);
    expect(await db.variant.count({ where: { sku: { startsWith: `${run}-` } } })).toBe(0);
  });

  it('imports products, variants, options and opening stock', async () => {
    const res = await upload(await xlsx(), false).expect(200);
    expect(res.body).toMatchObject({ dryRun: false, products: { created: 2 }, variants: { created: 3 } });

    const product = await db.product.findFirstOrThrow({
      where: { code: sku('A') },
      include: {
        variants: { orderBy: { sku: 'asc' } },
        options: { include: { values: true } },
        category: true,
      },
    });
    expect(product).toMatchObject({
      name: 'Xe điều khiển',
      searchKey: 'xe dieu khien',
      status: 'active',
      category: { name: cat },
    });
    expect(product.variants.map((v) => [v.sku, v.optionValues, Number(v.price), Number(v.costAvg)])).toEqual([
      [sku('A'), ['Đỏ'], 250000, 120000],
      [sku('B'), ['Xanh'], 260000, 125000],
    ]);
    expect(product.options.map((o) => [o.name, o.values.map((v) => v.value).sort()])).toEqual([
      ['MÀU', ['Xanh', 'Đỏ']],
    ]);

    const w = await db.warehouse.findFirstOrThrow({ where: { code: wh } });
    const levels = await db.stockLevel.findMany({
      where: { warehouseId: w.id },
      include: { variant: { select: { sku: true } } },
    });
    expect(Object.fromEntries(levels.map((l) => [l.variant.sku, Number(l.onHand)]))).toEqual({
      [sku('A')]: 10,
      [sku('B')]: 5,
      [sku('C')]: -2,
    });
    const moves = await db.stockMovement.findMany({ where: { warehouseId: w.id } });
    expect(moves.every((m) => m.type === 'kiotviet_import')).toBe(true);
    expect(Number((await db.variant.findFirstOrThrow({ where: { sku: sku('C') } })).costAvg)).toBe(30000);
    const refs = await db.externalRef.findMany({
      where: { provider: 'kiotviet', externalId: { in: [sku('A'), sku('B'), sku('C')] } },
    });
    expect(refs.map((r) => r.externalId).sort()).toEqual([sku('A'), sku('B'), sku('C')]);
  });

  it('is idempotent and reports, but does not overwrite, later stock differences', async () => {
    const w = await db.warehouse.findFirstOrThrow({ where: { code: wh } });
    const movesBefore = await db.stockMovement.count({ where: { warehouseId: w.id } });

    const same = await upload(await xlsx(), false).expect(200);
    expect(same.body).toMatchObject({
      products: { created: 0, updated: 0, unchanged: 2 },
      variants: { created: 0, updated: 0, unchanged: 3 },
      stockDiffs: [],
      openingStock: { skus: 0 },
    });

    const changed = await upload(
      await xlsx(7, [[cat, sku('D'), null, 'Bóng', 50000, 20000, 4, null, null]]),
      false,
    ).expect(200);
    expect(changed.body.stockDiffs).toEqual([{ sku: sku('B'), sugami: 5, kiotviet: 7 }]);
    expect(changed.body).toMatchObject({
      products: { created: 1 },
      variants: { created: 1 },
      openingStock: { skus: 1, units: 4 },
    });
    const b = await db.stockLevel.findFirstOrThrow({
      where: { warehouseId: w.id, variant: { sku: sku('B') } },
    });
    expect(Number(b.onHand)).toBe(5);
    expect(await db.stockMovement.count({ where: { warehouseId: w.id } })).toBe(movesBefore + 1);
  });

  it('blocks files with row errors, bad files and missing permissions', async () => {
    const bad = await xlsx(5, [[cat, sku('A'), null, 'Trùng', 1, 1, 1, null, null]]);
    const res = await upload(bad, false).expect(422);
    expect(res.body.issues[0].message).toMatch(/trùng/);
    await upload(await writeSheet('x', ['Mã hàng'], [['A']]), true).expect(422);
    await upload(await xlsx(), true, staffCookie).expect(403);
    await http().post('/api/imports/kiotviet/products').set('Cookie', cookie).expect(400);
  });
});
