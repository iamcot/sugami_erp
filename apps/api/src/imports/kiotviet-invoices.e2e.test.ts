import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { writeSheet } from '@sugami/channels-kiotviet';
import { hashPassword, type PrismaClient } from '@sugami/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { createTestApp } from '../test/app.js';

const PH = ['Mã hàng', 'Tên hàng', 'Giá bán', 'Giá vốn', 'Tồn kho'];
const IH = [
  'Mã hóa đơn',
  'Mã đặt hàng',
  'Thời gian',
  'Mã khách hàng',
  'Tên khách hàng',
  'Điện thoại',
  'Kênh bán',
  'Đối tác giao hàng',
  'Mã vận đơn',
  'Phí trả ĐTGH',
  'Tổng tiền hàng',
  'Giảm giá hóa đơn',
  'Khách cần trả',
  'Khách đã trả',
  'Còn cần thu (COD)',
  'Trạng thái',
  'Trạng thái giao hàng',
  'Ghi chú',
  'Mã hàng',
  'Tên hàng',
  'Số lượng',
  'Đơn giá',
  'Giảm giá',
  'Giá bán',
  'Thành tiền',
];

describe.skipIf(!process.env.DATABASE_URL)('KiotViet invoice import (MySQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let cookie: string;
  const run = randomUUID().slice(0, 6).toUpperCase();
  const wh = `KI-${run}`;
  const email = `ki-${run.toLowerCase()}@test.local`;
  const A = `${run}-A`;
  const B = `${run}-B`;
  const code = (s: string) => `HDSPE_${run}${s}`;
  const http = () => request(app.getHttpServer());

  // Product snapshot exported 20/11/2026 12:00 (VN): A=10, B=4.
  const productFile = () =>
    writeSheet('S', PH, [
      [A, 'Xe A', 100000, 40000, 10],
      [B, 'Xe B', 50000, 20000, 4],
    ]);
  type Line = [sku: string, qty: number, price: number];
  const inv = (c: string, time: string, status: string, delivery: string, lines: Line[]) => {
    const total = lines.reduce((a, [, q, p]) => a + q * p, 0);
    return lines.map(([sku, qty, price]) => [
      c,
      c.replace('HD', 'DH'),
      time,
      'KHSPE1',
      'N******n',
      '******99',
      'Shop',
      'SHOPEE',
      'VN1',
      30000,
      total,
      0,
      total,
      0,
      total,
      status,
      delivery,
      'người mua secret_user',
      sku,
      `Tên ${sku}`,
      qty,
      price,
      0,
      price,
      qty * price,
    ]);
  };
  const invoiceFile = (cancelAfter = false) =>
    writeSheet('S', IH, [
      ...inv(code('1'), '2026-11-19 09:00:00', 'Hoàn thành', 'Giao thành công', [[A, 2, 100000]]), // before snapshot
      ...inv(code('2'), '2026-11-21 10:00:00', cancelAfter ? 'Đã hủy' : 'Đang xử lý', 'Đang giao hàng', [
        [A, 1, 100000],
        [B, 3, 50000],
      ]),
      ...inv(code('3'), '2026-11-21 11:00:00', 'Đã hủy', '', [[B, 1, 50000]]),
      ...inv(`HD${run}`, '2026-11-21 12:00:00', 'Hoàn thành', '', [[`${run}-UNKNOWN`, 1, 10000]]),
    ]);
  const post = (path: string, buf: Buffer, name: string, dryRun = false) =>
    http()
      .post(`/api/imports/kiotviet/${path}?dryRun=${dryRun}&warehouse=${wh}`)
      .set('Cookie', cookie)
      .attach('file', buf, name);
  const onHand = async (sku: string) =>
    Number(
      (await db.stockLevel.findFirst({ where: { warehouse: { code: wh }, variant: { sku } } }))?.onHand ?? 0,
    );

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService).client;
    await db.warehouse.create({ data: { code: wh, name: 'Kho hóa đơn test' } });
    const role = await db.role.upsert({
      where: { code: 'owner' },
      create: { code: 'owner', name: 'owner', permissions: ['*'] },
      update: {},
    });
    await db.user.create({
      data: {
        email,
        name: 'o',
        passwordHash: await hashPassword('ki-pass-123'),
        roles: { create: [{ roleId: role.id }] },
      },
    });
    cookie = (
      (await http().post('/api/auth/login').send({ email, password: 'ki-pass-123' }).expect(200)).headers[
        'set-cookie'
      ] as unknown as string[]
    )
      .map((c) => c.split(';')[0])
      .join('; ');
    await post('products', await productFile(), 'DanhSachSanPham_KV20112026-120000-000.xlsx').expect(200);
  });

  afterAll(async () => {
    if (db) {
      const w = await db.warehouse.findUnique({ where: { code: wh } });
      if (w) {
        await db.order.deleteMany({ where: { warehouseId: w.id } });
        await db.stockMovement.deleteMany({ where: { warehouseId: w.id } });
        await db.stockLevel.deleteMany({ where: { warehouseId: w.id } });
      }
      await db.product.deleteMany({ where: { code: { in: [A, B] } } });
      await db.customer.deleteMany({ where: { kiotvietCode: 'KHSPE1', orders: { none: {} } } });
      await db.warehouse.deleteMany({ where: { code: wh } });
      await db.user.deleteMany({ where: { email } });
    }
    await app?.close();
  });

  it('dates the opening stock at the export time in the file name', async () => {
    const m = await db.stockMovement.findFirstOrThrow({
      where: { warehouse: { code: wh }, variant: { sku: A } },
    });
    expect(m.occurredAt.toISOString()).toBe('2026-11-20T05:00:00.000Z');
  });

  it('imports orders, deducts stock only for sales after the snapshot, skips cancelled', async () => {
    const preview = await post('invoices', await invoiceFile(), 'DanhSachChiTietHoaDon_KV.xlsx', true).expect(
      200,
    );
    expect(preview.body).toMatchObject({
      orders: { created: 4 },
      revenue: 200000 + 250000 + 10000,
      byChannel: { shopee: { orders: 2, revenue: 450000 }, store: { orders: 1, revenue: 10000 } },
      stock: { applied: 2, beforeSnapshot: 1 },
      unknownSkus: [`${run}-UNKNOWN`],
    });
    expect(await db.order.count({ where: { warehouse: { code: wh } } })).toBe(0);

    await post('invoices', await invoiceFile(), 'DanhSachChiTietHoaDon_KV.xlsx').expect(200);
    expect(await onHand(A)).toBe(9); // 10 - 1 (order 1 was before the snapshot)
    expect(await onHand(B)).toBe(1); // 4 - 3 (order 3 cancelled)

    const o = await db.order.findUniqueOrThrow({
      where: { code: code('2') },
      include: { lines: true, channel: true, customer: true },
    });
    expect(o).toMatchObject({
      status: 'shipped',
      externalCode: `${run}2`,
      channel: { code: 'shopee' },
      customer: { kiotvietCode: 'KHSPE1', name: null, phone: null },
    });
    expect(o.stockAppliedAt).not.toBeNull();
    expect(o.lines.map((l) => [l.sku, Number(l.qty), Number(l.costSnapshot)])).toEqual([
      [A, 1, 40000],
      [B, 3, 20000],
    ]);
    expect(JSON.stringify(o, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))).not.toContain(
      'secret_user',
    );
    expect((await db.order.findUniqueOrThrow({ where: { code: code('1') } })).stockAppliedAt).toBeNull();
    expect(
      (await db.order.findUniqueOrThrow({ where: { code: `HD${run}` }, include: { channel: true } })).channel
        .code,
    ).toBe('store');
  });

  it('is idempotent and returns stock when an imported invoice is cancelled later', async () => {
    const again = await post('invoices', await invoiceFile(), 'x.xlsx').expect(200);
    expect(again.body.orders).toEqual({ created: 0, updated: 0, unchanged: 4 });
    expect(await onHand(A)).toBe(9);

    const cancelled = await post('invoices', await invoiceFile(true), 'x.xlsx').expect(200);
    expect(cancelled.body).toMatchObject({ orders: { updated: 1 }, stock: { reversed: 2 } });
    expect(await onHand(A)).toBe(10);
    expect(await onHand(B)).toBe(4);
    const o = await db.order.findUniqueOrThrow({ where: { code: code('2') } });
    expect(o).toMatchObject({ status: 'cancelled', stockAppliedAt: null });
  });

  it('rejects the summary invoice file', async () => {
    const summaryFile = await writeSheet(
      'S',
      ['Mã hóa đơn', 'Thời gian', 'Khách hàng', 'Tổng tiền hàng'],
      [['HD1', '2026-11-21 10:00:00', 'x', 1]],
    );
    const res = await post('invoices', summaryFile, 'DanhSachHoaDon_KV.xlsx', true).expect(422);
    expect(res.body.message).toMatch(/tổng quan/);
  });
});
