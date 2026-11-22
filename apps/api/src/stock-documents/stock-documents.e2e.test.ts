import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { parseProductList, readFirstSheet } from '@sugami/channels-kiotviet';
import { hashPassword, type PrismaClient } from '@sugami/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { createTestApp } from '../test/app.js';

describe.skipIf(!process.env.DATABASE_URL)('stock documents and KiotViet export files (MySQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let cookie: string;
  const run = randomUUID().slice(0, 6).toUpperCase();
  const email = `docs-${run}@test.local`;
  const wh = `SD-${run}`;
  const sku = (s: string) => `${run}${s}`;

  const http = () => request(app.getHttpServer());
  const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };
  const download = async (path: string) =>
    (await http().get(path).set('Cookie', cookie).buffer(true).parse(binary).expect(200)).body as Buffer;
  const post = (path: string, body: object) => http().post(path).set('Cookie', cookie).send(body);

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
        name: 'Docs',
        passwordHash: await hashPassword('docs-pass-123'),
        roles: { create: { roleId: role.id } },
      },
    });
    cookie = (
      (await http().post('/api/auth/login').send({ email, password: 'docs-pass-123' }).expect(200)).headers[
        'set-cookie'
      ] as unknown as string[]
    )
      .map((c) => c.split(';')[0])
      .join('; ');
    await db.warehouse.create({ data: { code: wh, name: 'Kho test phiếu' } });
    const product = await db.product.create({
      data: {
        code: sku('P'),
        name: 'Xe đua thử',
        searchKey: 'xe dua thu',
        status: 'active',
        options: { create: [{ name: 'MÀU', sort: 0 }] },
        variants: {
          create: [
            { sku: sku('1'), optionValues: ['Đỏ'], price: 150000n },
            { sku: sku('2'), optionValues: ['Xanh'], price: 150000n },
          ],
        },
      },
      include: { variants: { orderBy: { sku: 'asc' } } },
    });
    // Only the first SKU is known to KiotViet.
    await db.externalRef.create({
      data: {
        provider: 'kiotviet',
        entityType: 'variant',
        entityId: product.variants[0]!.id,
        externalId: sku('1'),
      },
    });
  });

  afterAll(async () => {
    if (db) {
      const w = await db.warehouse.findUnique({ where: { code: wh } });
      if (w) {
        await db.stockMovement.deleteMany({ where: { warehouseId: w.id } });
        await db.stockLevel.deleteMany({ where: { warehouseId: w.id } });
        await db.stockDocument.deleteMany({ where: { warehouseId: w.id } });
        await db.warehouse.delete({ where: { id: w.id } });
      }
      const vs = await db.variant.findMany({ where: { sku: { startsWith: run } }, select: { id: true } });
      await db.externalRef.deleteMany({ where: { entityId: { in: vs.map((v) => v.id) } } });
      await db.product.deleteMany({ where: { code: sku('P') } });
      await db.user.deleteMany({ where: { email } });
    }
    await app?.close();
  });

  let receiptCode = '';

  it('validates lines', async () => {
    await post('/api/stock-documents', {
      type: 'receipt',
      warehouseCode: wh,
      lines: [{ sku: 'NOPE-X', quantity: 1, unitCost: 1 }],
    }).expect(400);
    await post('/api/stock-documents', {
      type: 'receipt',
      warehouseCode: wh,
      lines: [{ sku: sku('1'), quantity: 1 }],
    }).expect(400);
    await post('/api/stock-documents', {
      type: 'count',
      warehouseCode: wh,
      lines: [{ sku: sku('1'), quantity: 1.5 }],
    }).expect(400);
    await post('/api/stock-documents', { type: 'receipt', warehouseCode: wh, lines: [] }).expect(400);
  });

  it('creates and confirms a receipt: stock and average cost go up, SKUs missing in KiotViet are flagged', async () => {
    const res = await post('/api/stock-documents', {
      type: 'receipt',
      warehouseCode: wh,
      reason: 'Hàng về đợt 1',
      lines: [
        { sku: sku('1'), quantity: 10, unitCost: 80000 },
        { sku: sku('2'), quantity: 4, unitCost: 82000 },
      ],
      confirm: true,
    }).expect(201);
    receiptCode = res.body.document.code;
    expect(receiptCode).toMatch(/^NH\d{6}-\d{3}$/);
    expect(res.body.document).toMatchObject({
      status: 'confirmed',
      lines: [
        { onHand: 10, inKiotviet: true },
        { onHand: 4, inKiotviet: false },
      ],
    });
    expect(res.body.kiotviet.missingSkus).toEqual([sku('2')]);
    const v = await db.variant.findUniqueOrThrow({ where: { sku: sku('1') } });
    expect(Number(v.costAvg)).toBe(80000);
  });

  it('exports the receipt in the KiotViet purchase template and marks it exported', async () => {
    const list = await http()
      .get('/api/stock-documents?notExported=1&type=receipt')
      .set('Cookie', cookie)
      .expect(200);
    expect(list.body.data.map((d: { code: string }) => d.code)).toContain(receiptCode);
    const file = await download(`/api/stock-documents/${receiptCode}/kiotviet.xlsx`);
    const { headers, rows } = await readFirstSheet(file);
    expect(headers).toEqual([
      'Mã hàng',
      'Tên hàng',
      'Đơn vị tính',
      'Đơn giá',
      'Giảm giá',
      'Giảm giá (%)',
      'Số lượng',
    ]);
    expect(rows.map((r) => [r.values['Mã hàng'], r.values['Đơn giá'], r.values['Số lượng']])).toEqual([
      [sku('1'), 80000, 10],
      [sku('2'), 82000, 4],
    ]);
    const after = await http().get(`/api/stock-documents/${receiptCode}`).set('Cookie', cookie).expect(200);
    expect(after.body.document.exportedToKiotvietAt).toBeTruthy();
    const pending = await http().get('/api/stock-documents?notExported=1').set('Cookie', cookie).expect(200);
    expect(pending.body.data.map((d: { code: string }) => d.code)).not.toContain(receiptCode);
  });

  it('counts stock: draft, edit, confirm books the difference; export has counted quantities', async () => {
    const draft = await post('/api/stock-documents', {
      type: 'count',
      warehouseCode: wh,
      lines: [{ sku: sku('1'), quantity: 9 }],
    }).expect(201);
    const code = draft.body.document.code as string;
    expect(code).toMatch(/^KK/);
    await http().get(`/api/stock-documents/${code}/kiotviet.xlsx`).set('Cookie', cookie).expect(409);
    await http()
      .put(`/api/stock-documents/${code}`)
      .set('Cookie', cookie)
      .send({
        lines: [
          { sku: sku('1'), quantity: 7 },
          { sku: sku('2'), quantity: 4 },
        ],
        confirm: true,
      })
      .expect(200);
    const levels = await http().get(`/api/inventory?q=${run}`).set('Cookie', cookie).expect(200);
    expect(levels.body.data.map((r: { sku: string; onHand: number }) => [r.sku, r.onHand])).toEqual([
      [sku('1'), 7],
      [sku('2'), 4],
    ]);
    const { headers, rows } = await readFirstSheet(
      await download(`/api/stock-documents/${code}/kiotviet.xlsx`),
    );
    expect(headers).toEqual(['Mã hàng', 'Số lượng']);
    expect(rows.map((r) => [r.values['Mã hàng'], r.values['Số lượng']])).toEqual([
      [sku('1'), 7],
      [sku('2'), 4],
    ]);
    await http()
      .put(`/api/stock-documents/${code}`)
      .set('Cookie', cookie)
      .send({ lines: [{ sku: sku('1'), quantity: 1 }] })
      .expect(409);
  });

  it('cancels a confirmed receipt with reversing movements', async () => {
    const r = await post('/api/stock-documents', {
      type: 'receipt',
      warehouseCode: wh,
      lines: [{ sku: sku('2'), quantity: 2, unitCost: 82000 }],
      confirm: true,
    }).expect(201);
    await post(`/api/stock-documents/${r.body.document.code}/cancel`, {}).expect(200);
    await post(`/api/stock-documents/${r.body.document.code}/cancel`, {}).expect(409);
    const levels = await http().get(`/api/inventory?q=${run}2`).set('Cookie', cookie).expect(200);
    expect(levels.body.data[0].onHand).toBe(4);
  });

  it('lists and exports SKUs KiotViet does not have yet, in the product template', async () => {
    const res = await http().get('/api/exports/kiotviet/new-products').set('Cookie', cookie).expect(200);
    const mine = res.body.data.filter((r: { sku: string }) => r.sku.startsWith(run));
    expect(mine).toEqual([
      { sku: sku('2'), name: 'Xe đua thử', price: 150000, cost: 82000, parentSku: null },
    ]);
    const parsed = await parseProductList(await download('/api/exports/kiotviet/new-products.xlsx'));
    const v = parsed.groups.flatMap((g) => g.variants).find((x) => x.sku === sku('2'));
    expect(v).toMatchObject({ price: 150000, onHand: 0, active: true, optionValues: ['Xanh'] });
  });
});
