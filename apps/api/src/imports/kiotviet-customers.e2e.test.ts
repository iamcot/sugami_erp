import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { writeSheet } from '@sugami/channels-kiotviet';
import { hashPassword, type PrismaClient } from '@sugami/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { createTestApp } from '../test/app.js';

const H = [
  'Mã khách hàng',
  'Tên khách hàng',
  'Điện thoại',
  'Địa chỉ',
  'Khu vực giao hàng',
  'Nhóm khách hàng',
  'Ghi chú',
  'Ngày tạo',
  'Ngày giao dịch cuối',
  'Nợ cần thu hiện tại',
  'Tổng bán',
  'Trạng thái',
];

describe.skipIf(!process.env.DATABASE_URL)('KiotViet customer import (MySQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let cookie: string;
  const run = randomUUID().slice(0, 6).toUpperCase();
  const email = `kc-${run.toLowerCase()}@test.local`;
  const C1 = `KC${run}1`;
  const C2 = `KC${run}2`;
  const http = () => request(app.getHttpServer());
  const file = (phone1 = '0901234567') =>
    writeSheet('S', H, [
      [
        C1,
        'Trần Thị Bé',
        phone1,
        '12 Lê Lợi',
        'Hồ Chí Minh',
        'Khách mới|Fan cứng',
        'secret_user',
        '2025-03-01 10:00:00',
        '2025-04-01 09:30:00',
        0,
        500000,
        1,
      ],
      [C2, 'N******n', null, '******Rẫy', null, null, 'secret_user', '2025-03-02 10:00:00', null, 0, 0, 1],
    ]);
  const post = (buf: Buffer, dryRun = false) =>
    http()
      .post(`/api/imports/kiotviet/customers?dryRun=${dryRun}`)
      .set('Cookie', cookie)
      .attach('file', buf, 'DanhSachKhachHang_KV.xlsx');
  const get = (path: string) => http().get(`/api/customers${path}`).set('Cookie', cookie);

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService).client;
    const role = await db.role.upsert({
      where: { code: 'owner' },
      create: { code: 'owner', name: 'owner', permissions: ['*'] },
      update: {},
    });
    await db.user.create({
      data: {
        email,
        name: 'o',
        passwordHash: await hashPassword('kc-pass-123'),
        roles: { create: [{ roleId: role.id }] },
      },
    });
    cookie = (
      (await http().post('/api/auth/login').send({ email, password: 'kc-pass-123' }).expect(200)).headers[
        'set-cookie'
      ] as unknown as string[]
    )
      .map((c) => c.split(';')[0])
      .join('; ');
    // An order created earlier by the invoice import: only a stub customer with the code.
    const channel = await db.channel.upsert({
      where: { code: 'shopee' },
      create: { code: 'shopee', name: 'Shopee', type: 'shopee' },
      update: {},
    });
    const wh = await db.warehouse.create({ data: { code: `KC-${run}`, name: 'Kho khách test' } });
    const stub = await db.customer.create({ data: { kiotvietCode: C1 } });
    await db.order.create({
      data: {
        code: `HDKC${run}`,
        channelId: channel.id,
        customerId: stub.id,
        warehouseId: wh.id,
        status: 'completed',
        orderedAt: new Date('2026-11-01T03:00:00Z'),
        total: 120000,
        source: 'test',
      },
    });
  });

  afterAll(async () => {
    if (db) {
      await db.order.deleteMany({ where: { code: `HDKC${run}` } });
      await db.customer.deleteMany({ where: { kiotvietCode: { in: [C1, C2] } } });
      await db.warehouse.deleteMany({ where: { code: `KC-${run}` } });
      await db.user.deleteMany({ where: { email } });
    }
    await app?.close();
  });

  it('previews, then fills the stub customer so its order stays linked', async () => {
    const preview = await post(await file(), true).expect(200);
    expect(preview.body).toMatchObject({
      rows: 2,
      customers: { created: 1, updated: 1, unchanged: 0 },
      withPhone: 1,
      maskedNames: 1,
      linkedToOrders: 1,
    });
    expect(await db.customer.count({ where: { kiotvietCode: C2 } })).toBe(0);

    await post(await file()).expect(200);
    const c = await db.customer.findUniqueOrThrow({ where: { kiotvietCode: C1 }, include: { orders: true } });
    expect(c).toMatchObject({
      name: 'Trần Thị Bé',
      phone: '0901234567',
      region: 'Hồ Chí Minh',
      tags: ['Khách mới', 'Fan cứng'],
    });
    expect(c.orders).toHaveLength(1);
    expect(Number(c.kvTotalSales)).toBe(500000);
    expect(JSON.stringify(c, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))).not.toContain(
      'secret_user',
    );
  });

  it('is idempotent', async () => {
    const again = await post(await file()).expect(200);
    expect(again.body.customers).toEqual({ created: 0, updated: 0, unchanged: 2 });
    const changed = await post(await file('0999999999')).expect(200);
    expect(changed.body.customers).toEqual({ created: 0, updated: 1, unchanged: 1 });
  });

  it('lists, searches without accents and shows order stats', async () => {
    const list = await get(`?q=${encodeURIComponent('tran thi')}`).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({
      code: C1,
      orders: 1,
      spent: 120000,
      tags: ['Khách mới', 'Fan cứng'],
    });
    expect((await get(`?q=0999999999`).expect(200)).body.total).toBe(1);
    expect((await get(`?q=HDKC${run}`).expect(200)).body.data[0].code).toBe(C1);
    expect((await get(`?group=${encodeURIComponent('Fan cứng')}&q=${run}`).expect(200)).body.total).toBe(1);
    expect((await get('/groups').expect(200)).body.data.map((g: { name: string }) => g.name)).toContain(
      'Fan cứng',
    );
  });

  it('shows a customer with their orders and lets the owner fix contact details', async () => {
    const d = await get(`/${C1}`).expect(200);
    expect(d.body.stats).toMatchObject({ orders: 1, spent: 120000 });
    expect(d.body.orders[0].code).toBe(`HDKC${run}`);
    const upd = await http()
      .patch(`/api/customers/${C1}`)
      .set('Cookie', cookie)
      .send({ name: 'Bé Tí', phone: '0911000111' })
      .expect(200);
    expect(upd.body.customer).toMatchObject({ name: 'Bé Tí', phone: '0911000111' });
    expect((await get('?q=be ti').expect(200)).body.total).toBeGreaterThanOrEqual(1);
    await get('/KHONGCO').expect(404);
  });

  it('rejects a file that is not a customer list', async () => {
    const bad = await writeSheet('S', ['Mã hàng'], [['A']]);
    await post(bad, true).expect(422);
  });
});
