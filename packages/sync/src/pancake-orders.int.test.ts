// Integration tests against a real MySQL (DATABASE_URL). Skipped when no database is configured.
import { randomUUID } from 'node:crypto';
import type { ExternalOrder } from '@sugami/channels-core';
import { applyMovements, createPrismaClient, type PrismaClient, withLedgerTx } from '@sugami/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runPancakeOrderSync, syncPancakeOrders } from './pancake-orders.js';

describe.skipIf(!process.env.DATABASE_URL)('Pancake order sync (MySQL)', () => {
  let db: PrismaClient;
  const run = randomUUID().slice(0, 6).toUpperCase();
  const wh = `PS-${run}`;
  const sku = `PS-${run}-A`;
  let warehouseId: string;
  let variantId: string;
  const mk = (n: number, over: Partial<ExternalOrder> = {}): ExternalOrder => ({
    externalId: `${run}${n}`,
    code: `PCT${run}${n}`,
    marketplaceCode: `SN${run}${n}`,
    saleChannel: 'shopee',
    status: 'confirmed',
    currency: 'VND',
    orderedAt: new Date(Date.now() - 60_000),
    total: 300000,
    shippingFee: 10000,
    lines: [{ externalVariantId: 'pv-1', sku: 'WRONG', name: 'Xe A', quantity: 2, unitPrice: 150000 }],
    ...over,
  });
  const onHand = async () =>
    Number(
      (await db.stockLevel.findUnique({ where: { warehouseId_variantId: { warehouseId, variantId } } }))
        ?.onHand ?? 0,
    );
  const opts = (dryRun = false) => ({ warehouseId, dryRun, skuByVariationId: new Map([['pv-1', sku]]) });

  beforeAll(async () => {
    db = createPrismaClient();
    warehouseId = (await db.warehouse.create({ data: { code: wh, name: 'Kho Pancake test' } })).id;
    const p = await db.product.create({
      data: {
        code: `PS-${run}`,
        name: 'Xe A',
        searchKey: 'xe a',
        variants: { create: [{ sku, optionValues: [] }] },
      },
      include: { variants: true },
    });
    variantId = p.variants[0]!.id;
    // Opening stock 10, dated an hour ago: orders after that deduct stock.
    await withLedgerTx(db, (tx) =>
      applyMovements(tx, [
        {
          warehouseId,
          variantId,
          qtyDelta: 10,
          type: 'kiotviet_import',
          occurredAt: new Date(Date.now() - 3_600_000),
        },
      ]),
    );
  });

  afterAll(async () => {
    if (db) {
      await db.order.deleteMany({ where: { code: { startsWith: `PCT${run}` } } });
      await db.order.deleteMany({ where: { externalCode: { startsWith: `SN${run}` } } });
      await db.stockMovement.deleteMany({ where: { warehouseId } });
      await db.stockLevel.deleteMany({ where: { warehouseId } });
      await db.product.deleteMany({ where: { code: `PS-${run}` } });
      await db.warehouse.deleteMany({ where: { code: wh } });
      await db.syncCursor.deleteMany({ where: { key: 'pancake:orders' } });
      await db.$disconnect();
    }
  });

  it('previews without writing, then creates the order and deducts stock', async () => {
    const preview = await syncPancakeOrders(db, [mk(1)], opts(true));
    expect(preview).toMatchObject({ created: 1, stock: { applied: 1 } });
    expect(await db.order.count({ where: { code: `PCT${run}1` } })).toBe(0);
    expect(await onHand()).toBe(10);

    const real = await syncPancakeOrders(db, [mk(1)], opts());
    expect(real).toMatchObject({ created: 1, errors: [], unknownSkus: [] });
    expect(await onHand()).toBe(8);
    const o = await db.order.findUniqueOrThrow({
      where: { code: `PCT${run}1` },
      include: { lines: true, channel: true },
    });
    expect(o).toMatchObject({ source: 'pancake', externalCode: `SN${run}1`, channel: { code: 'shopee' } });
    expect(o.lines[0]).toMatchObject({ sku, variantId });
    expect(Number(o.total)).toBe(300000);
  });

  it('is idempotent and gives stock back when the order is cancelled', async () => {
    const again = await syncPancakeOrders(db, [mk(1)], opts());
    expect(again).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
    expect(await onHand()).toBe(8);

    const cancelled = await syncPancakeOrders(db, [mk(1, { status: 'cancelled' })], opts());
    expect(cancelled).toMatchObject({ updated: 1, stock: { reversed: 1 } });
    expect(await onHand()).toBe(10);
    expect((await db.order.findUniqueOrThrow({ where: { code: `PCT${run}1` } })).status).toBe('cancelled');
    // A second cancellation changes nothing.
    await syncPancakeOrders(db, [mk(1, { status: 'cancelled' })], opts());
    expect(await onHand()).toBe(10);
  });

  it('skips other currencies and other channels', async () => {
    const r = await syncPancakeOrders(
      db,
      [mk(2, { currency: 'MYR' }), mk(3, { saleChannel: 'facebook' })],
      opts(),
    );
    expect(r).toMatchObject({ fetched: 2, created: 0, skipped: { currency: 1, channel: 1 } });
    expect(await onHand()).toBe(10);
  });

  it('does not duplicate or re-deduct an order KiotViet already imported', async () => {
    const channel = await db.channel.findUniqueOrThrow({ where: { code: 'shopee' } });
    await db.order.create({
      data: {
        code: `HDSPE_SN${run}4`,
        kiotvietInvoiceCode: `HDSPE_SN${run}4`,
        externalCode: `SN${run}4`,
        channelId: channel.id,
        warehouseId,
        status: 'delivered',
        orderedAt: new Date(Date.now() - 60_000),
        total: 300000,
        source: 'kiotviet_excel',
      },
    });
    const r = await syncPancakeOrders(db, [mk(4)], opts());
    expect(r).toMatchObject({ created: 0, keptFromKiotViet: 1 });
    expect(await db.order.count({ where: { externalCode: `SN${run}4` } })).toBe(1);
    expect(await onHand()).toBe(10);
  });

  it('moves the cursor only after a real run', async () => {
    const source = {
      pullOrders: async function* () {
        yield mk(5);
      },
      pullProducts: async function* () {
        yield {
          externalId: 'p',
          code: 'p',
          name: 'p',
          isActive: true,
          variants: [{ externalId: 'pv-1', sku, name: 'Xe A', optionValues: [], stock: {} }],
        };
      },
    };
    const preview = await runPancakeOrderSync(db, source, { warehouseCode: wh, dryRun: true });
    expect(preview.created).toBe(1);
    expect(await db.syncCursor.findUnique({ where: { key: 'pancake:orders' } })).toBeNull();
    const real = await runPancakeOrderSync(db, source, { warehouseCode: wh });
    expect(real).toMatchObject({ created: 1, errors: [] });
    expect(await db.syncCursor.findUnique({ where: { key: 'pancake:orders' } })).not.toBeNull();
    expect(await onHand()).toBe(8);
  });
});
