import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { writeSheet } from '@sugami/channels-kiotviet';
import { applyMovements, hashPassword, type PrismaClient, runAsShop, withLedgerTx } from '@sugami/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { createTestApp } from '../test/app.js';

/**
 * Multi-shop: a platform admin creates an assembly shop (flower shop) with its owner; the owner sees only
 * the new shop's data, defines a bouquet from materials and sells it at the counter, which takes the
 * materials from stock and records their cost so the profit is known.
 */
describe.skipIf(!process.env.DATABASE_URL)('shops + assembly sales (MySQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let admin: string;
  let florist: string;
  let shopId = '';
  const run = randomUUID().slice(0, 6).toLowerCase();
  const adminEmail = `sa-${run}@test.local`;
  const floristEmail = `fl-${run}@test.local`;
  const R = run.toUpperCase();
  const shared = `SAME${R}`;
  const http = () => request(app.getHttpServer());
  const login = async (email: string, password: string) =>
    (
      (await http().post('/api/auth/login').send({ email, password }).expect(200)).headers[
        'set-cookie'
      ] as unknown as string[]
    )
      .map((c) => c.split(';')[0])
      .join('; ');

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
        email: adminEmail,
        name: 'admin',
        isPlatformAdmin: true,
        passwordHash: await hashPassword('sa-pass-123'),
        roles: { create: [{ roleId: role.id }] },
      },
    });
    admin = await login(adminEmail, 'sa-pass-123');
    // a Sugami product whose code the flower shop will reuse
    await db.product.create({
      data: {
        code: shared,
        name: `Sugami only ${run}`,
        searchKey: `sugami only ${run}`,
        variants: { create: [{ sku: shared, optionValues: [] }] },
      },
    });
  });

  afterAll(async () => {
    if (db && shopId) {
      await runAsShop(shopId, async () => {
        await db.order.deleteMany({});
        await db.customer.deleteMany({});
        await db.posDraft.deleteMany({});
        await db.stockMovement.deleteMany({});
        await db.stockLevel.deleteMany({});
        await db.comboItem.deleteMany({});
        await db.product.deleteMany({});
        await db.warehouse.deleteMany({});
        await db.channel.deleteMany({});
      });
      await db.user.deleteMany({ where: { shopId } });
      await db.shop.delete({ where: { id: shopId } });
    }
    if (db) {
      await db.product.deleteMany({ where: { code: shared } });
      await db.user.deleteMany({ where: { email: adminEmail } });
    }
    await app?.close();
  });

  it('only a platform admin creates shops', async () => {
    const body = {
      name: `Tiệm hoa ${run}`,
      code: `hoa-${run}`,
      type: 'assembly',
      owner: { name: 'Chủ tiệm hoa', email: floristEmail, password: 'fl-pass-123' },
    };
    const created = await http().post('/api/shops').set('Cookie', admin).send(body).expect(201);
    shopId = created.body.id;
    expect(created.body).toMatchObject({ code: `hoa-${run}`, type: 'assembly' });
    await http().post('/api/shops').set('Cookie', admin).send(body).expect(409);

    florist = await login(floristEmail, 'fl-pass-123');
    const me = await http().get('/api/auth/me').set('Cookie', florist).expect(200);
    expect(me.body.user).toMatchObject({ shopId, isPlatformAdmin: false, shop: { type: 'assembly' } });
    await http().get('/api/shops').set('Cookie', florist).expect(403);
    // Pancake belongs to Sugami
    await http().get('/api/pancake/sync-status').set('Cookie', florist).expect(403);
  });

  it('edits the shop and its owner account', async () => {
    const list = await http().get('/api/shops').set('Cookie', admin).expect(200);
    const row = list.body.data.find((x: { id: string }) => x.id === shopId);
    expect(row.owners).toEqual([expect.objectContaining({ email: floristEmail })]);
    const ownerId = row.owners[0].id;

    await http()
      .patch(`/api/shops/${shopId}`)
      .set('Cookie', admin)
      .send({ name: `Tiệm hoa mới ${run}` })
      .expect(200);
    await http()
      .patch(`/api/shops/${shopId}/users/${ownerId}`)
      .set('Cookie', admin)
      .send({ name: 'Chủ mới', password: 'fl-pass-456' })
      .expect(200);
    // the old session is closed, the old password no longer works, the new one does
    await http().get('/api/auth/me').set('Cookie', florist).expect(401);
    await http().post('/api/auth/login').send({ email: floristEmail, password: 'fl-pass-123' }).expect(401);
    florist = await login(floristEmail, 'fl-pass-456');
    const me = await http().get('/api/auth/me').set('Cookie', florist).expect(200);
    expect(me.body.user).toMatchObject({ name: 'Chủ mới', shop: { name: `Tiệm hoa mới ${run}` } });
    // a shop admin cannot be reached through another shop's id
    await http()
      .patch(`/api/shops/00000000-0000-7000-8000-000000000001/users/${ownerId}`)
      .set('Cookie', admin)
      .send({ name: 'x' })
      .expect(404);
    await http().patch(`/api/shops/${shopId}`).set('Cookie', florist).send({ name: 'x' }).expect(403);
  });

  it("keeps each shop's data apart, codes may repeat across shops", async () => {
    const mk = (body: object) => http().post('/api/products').set('Cookie', florist).send(body);
    await mk({ code: shared, name: 'Hoa hồng đỏ', kind: 'material', unit: 'cành' }).expect(201);
    await mk({ code: `LA${R}`, name: 'Lá bạc', kind: 'material', unit: 'cành' }).expect(201);
    await mk({ code: `GIAY${R}`, name: 'Giấy gói', kind: 'material', unit: 'tờ' }).expect(201);

    const mine = await http().get('/api/products?pageSize=200').set('Cookie', florist).expect(200);
    expect(mine.body.data.map((p: { code: string }) => p.code).sort()).toEqual(
      [shared, `GIAY${R}`, `LA${R}`].sort(),
    );
    expect(mine.body.data.every((p: { kind: string }) => p.kind === 'material')).toBe(true);
    const sugami = await http().get(`/api/products?q=${shared}`).set('Cookie', admin).expect(200);
    expect(sugami.body.data.map((p: { name: string }) => p.name)).toEqual([`Sugami only ${run}`]);
    const detail = await http().get(`/api/products/${shared}`).set('Cookie', florist).expect(200);
    expect(detail.body.product).toMatchObject({ name: 'Hoa hồng đỏ', kind: 'material', unit: 'cành' });
  });

  it('sells a bouquet made from materials: stock and cost come from the materials', async () => {
    // stock in the florist's main warehouse at known costs
    const { warehouseId, rose, leaf, paper } = await runAsShop(shopId, async () => {
      const wh = await db.warehouse.findFirstOrThrow({ where: { code: 'KHO-CHINH' } });
      const v = async (sku: string) => (await db.variant.findFirstOrThrow({ where: { sku } })).id;
      const ids = {
        warehouseId: wh.id,
        rose: await v(shared),
        leaf: await v(`LA${R}`),
        paper: await v(`GIAY${R}`),
      };
      await withLedgerTx(db, (tx) =>
        applyMovements(tx, [
          { warehouseId: wh.id, variantId: ids.rose, qtyDelta: 50, unitCost: 8000, type: 'purchase_in' },
          { warehouseId: wh.id, variantId: ids.leaf, qtyDelta: 50, unitCost: 2000, type: 'purchase_in' },
          { warehouseId: wh.id, variantId: ids.paper, qtyDelta: 10, unitCost: 5000, type: 'purchase_in' },
        ]),
      );
      return ids;
    });

    // a bouquet: 10 roses + 5 leaves + 1 paper = 80,000 + 10,000 + 5,000 = 95,000 per bouquet
    await http()
      .post('/api/products')
      .set('Cookie', florist)
      .send({
        code: `BO${R}`,
        name: 'Bó hồng 10 bông',
        kind: 'finished',
        price: 250000,
        components: [
          { variantId: rose, qty: 10 },
          { variantId: leaf, qty: 5 },
          { variantId: paper, qty: 1 },
        ],
      })
      .expect(201);
    const bo = await http().get(`/api/products/BO${R}`).set('Cookie', florist).expect(200);
    const bouquet = bo.body.product.variants[0];
    expect(bouquet.materialCost).toBe(95000);
    expect(bouquet.components).toHaveLength(3);
    // a finished product cannot be a material
    await http()
      .put(`/api/variants/BO${R}/components`)
      .set('Cookie', florist)
      .send({ components: [{ variantId: bouquet.id, qty: 1 }] })
      .expect(400);

    const found = await http().get(`/api/pos/search?q=BO${R}`).set('Cookie', florist).expect(200);
    expect(found.body.data[0]).toMatchObject({ kind: 'finished', components: expect.any(Array) });

    const draft = await http()
      .post('/api/pos/drafts')
      .set('Cookie', florist)
      .send({ mode: 'retail', payload: { lines: [] } })
      .expect(201);
    const checkout = (lines: object[]) =>
      http()
        .post(`/api/pos/drafts/${draft.body.id}/checkout`)
        .set('Cookie', florist)
        .send({ mode: 'retail', payload: { lines, paid: 0 } });
    // 2 bouquets from the recipe, sold at 250k; 1 custom bouquet with 3 roses + 1 paper sold at 60k
    const res = await checkout([
      { variantId: bouquet.id, qty: 2, price: 250000 },
      {
        name: 'Bó hoa theo yêu cầu',
        qty: 1,
        price: 60000,
        components: [
          { variantId: rose, qty: 3 },
          { variantId: paper, qty: 1 },
        ],
      },
    ]).expect(200);

    const order = await http().get(`/api/orders/${res.body.code}`).set('Cookie', florist).expect(200);
    const [l1, l2] = order.body.order.lines;
    expect(l1).toMatchObject({ qty: 2, price: 250000, costSnapshot: 95000 });
    expect(l1.components).toHaveLength(3);
    expect(l2).toMatchObject({ name: 'Bó hoa theo yêu cầu', variantId: null, costSnapshot: 29000 });

    const onHand = await runAsShop(shopId, async () => {
      const levels = await db.stockLevel.findMany({ where: { warehouseId } });
      return Object.fromEntries(levels.map((l) => [l.variantId, Number(l.onHand)]));
    });
    expect(onHand[rose]).toBe(50 - 20 - 3);
    expect(onHand[leaf]).toBe(50 - 10);
    expect(onHand[paper]).toBe(10 - 2 - 1);
    expect(onHand[bouquet.id]).toBeUndefined();

    // profit = revenue - material cost: 560,000 - (2 × 95,000 + 29,000)
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    const report = await http()
      .get(`/api/reports/profit?from=${today}&to=${today}&by=channel`)
      .set('Cookie', florist)
      .expect(200);
    expect(report.body.total).toMatchObject({ revenue: 560000, cost: 219000, profit: 341000 });

    // not enough paper for 10 more bouquets
    const short = await checkout([{ variantId: bouquet.id, qty: 10, price: 250000 }]).expect(409);
    expect(short.body.message).toContain(`GIAY${R}`);
  });

  it('still sells a material or plain goods directly, with its own cost and profit', async () => {
    const rose = await runAsShop(
      shopId,
      async () => (await db.variant.findFirstOrThrow({ where: { sku: shared } })).id,
    );
    const draft = await http()
      .post('/api/pos/drafts')
      .set('Cookie', florist)
      .send({ mode: 'retail', payload: { lines: [] } })
      .expect(201);
    const res = await http()
      .post(`/api/pos/drafts/${draft.body.id}/checkout`)
      .set('Cookie', florist)
      .send({ mode: 'retail', payload: { lines: [{ variantId: rose, qty: 2, price: 15000 }], paid: 0 } })
      .expect(200);
    const order = await http().get(`/api/orders/${res.body.code}`).set('Cookie', florist).expect(200);
    expect(order.body.order.lines[0]).toMatchObject({ qty: 2, price: 15000, costSnapshot: 8000 });
    expect(order.body.order.lines[0].components ?? []).toHaveLength(0);
  });

  it('imports customers from a KiotViet file into its own shop only', async () => {
    const code = `KH${R}`;
    const header = ['Mã khách hàng', 'Tên khách hàng', 'Điện thoại', 'Trạng thái'];
    const buf = await writeSheet('S', header, [[code, 'Khách tiệm hoa', '0907654321', 1]]);
    await http()
      .post('/api/imports/kiotviet/customers?dryRun=false')
      .set('Cookie', florist)
      .attach('file', buf, 'DanhSachKhachHang_KV.xlsx')
      .expect(200);
    const mine = await runAsShop(shopId, () => db.customer.findMany({ where: { kiotvietCode: code } }));
    expect(mine).toEqual([expect.objectContaining({ name: 'Khách tiệm hoa', phone: '0907654321' })]);
    // Sugami does not see it
    expect(await db.customer.count({ where: { kiotvietCode: code } })).toBe(0);
  });
});
