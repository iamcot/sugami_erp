import { describe, expect, it, vi } from 'vitest';
import { PancakeAdapter, webhookType } from './adapter.js';
import { PancakeClient, PancakeError } from './client.js';
import { groupVariations, parsePancakeTime, toExternalOrder } from './mapping.js';
import { Order, Variation } from './schemas.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function makeClient(handler: (url: URL) => Response) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => handler(new URL(String(input))));
  const client = new PancakeClient({
    apiKey: 'secret-key',
    shopId: '123',
    fetch: fetchMock as unknown as typeof fetch,
    sleep: async () => {},
    retryDelaysMs: [1, 1],
  });
  return { client, fetchMock };
}

// Synthetic samples in the documented shape; no real shop or customer data.
const variation = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'v-1',
  display_id: 'SP000001',
  product_id: 'p-1',
  barcode: '893000000001',
  retail_price: 150000,
  is_hidden: false,
  updated_at: '2026-11-20T03:00:00.123456',
  fields: [{ name: 'Màu', value: 'Đỏ' }],
  variations_warehouses: [{ warehouse_id: 'w-1', remain_quantity: 4, actual_remain_quantity: 5 }],
  product: { name: 'Xe đua mini', display_id: 'SP000001' },
  ...over,
});

const order = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 1418,
  display_id: 1418,
  status: 3,
  inserted_at: '2026-11-21T01:30:00',
  marketplace_id: '-3',
  is_from_ecommerce: true,
  total_price: 290000,
  shipping_fee: 20000,
  fee_marketplace: 25000,
  bill_full_name: 'Không được đọc',
  bill_phone_number: '0900000000',
  invoice_info_list: [{ order_sn: '251121ABCDEF' }],
  items: [
    {
      variation_id: 'v-1',
      quantity: 2,
      discount_each_product: 10000,
      is_discount_percent: false,
      variation_info: { name: 'Xe đua mini - Đỏ', display_id: 'SP000001', retail_price: 150000 },
    },
    {
      variation_id: 'v-2',
      quantity: 1,
      discount_each_product: 10,
      is_discount_percent: true,
      variation_info: { name: 'Búp bê', display_id: 'SP000002', retail_price: 100000 },
    },
  ],
  ...over,
});

describe('PancakeClient', () => {
  it('puts api_key and array params in the query and paginates by total_pages', async () => {
    const seen: URL[] = [];
    const { client } = makeClient((url) => {
      seen.push(url);
      const page = Number(url.searchParams.get('page_number'));
      return json({ success: true, data: [{ n: page }], total_pages: 2 });
    });
    const items = [];
    for await (const x of client.paginate('/orders', { filter_status: ['1', '2'] }, 1)) items.push(x);
    expect(items).toEqual([{ n: 1 }, { n: 2 }]);
    expect(seen[0]!.pathname).toBe('/api/v1/shops/123/orders');
    expect(seen[0]!.searchParams.get('api_key')).toBe('secret-key');
    expect(seen[0]!.searchParams.getAll('filter_status[]')).toEqual(['1', '2']);
  });

  it('retries 429 and 5xx, then succeeds', async () => {
    let calls = 0;
    const { client } = makeClient(() =>
      ++calls < 3 ? json({ success: false, error_code: 106 }, 429) : json({ success: true, data: [] }),
    );
    await client.get('/orders');
    expect(calls).toBe(3);
  });

  it('throws PancakeError with error_code and never leaks the key', async () => {
    const { client } = makeClient(() =>
      json({ success: false, message: 'Invalid api_key', error_code: 105 }, 403),
    );
    const err = (await client.get('/orders').catch((e: unknown) => e)) as PancakeError;
    expect(err).toBeInstanceOf(PancakeError);
    expect(err.errorCode).toBe(105);
    expect(err.message).not.toContain('secret-key');
  });

  it('treats success:false with HTTP 200 as an error', async () => {
    const { client } = makeClient(() => json({ success: false, message: 'nope' }));
    await expect(client.get('/x')).rejects.toThrow('nope');
  });

  it('hides the URL on network errors', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed https://pos.pages.fm/api/v1/shops/1?api_key=secret-key');
    });
    const client = new PancakeClient({
      apiKey: 'secret-key',
      shopId: '1',
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async () => {},
      retryDelaysMs: [],
    });
    const err = (await client.get('/x').catch((e: unknown) => e)) as Error;
    expect(err.message).not.toContain('secret-key');
  });
});

describe('mapping', () => {
  it('parses UTC times without zone and with microseconds', () => {
    expect(parsePancakeTime('2020-05-12T04:51:42').toISOString()).toBe('2020-05-12T04:51:42.000Z');
    expect(parsePancakeTime('2026-03-09T01:45:58.013616').toISOString()).toBe('2026-03-09T01:45:58.013Z');
    expect(parsePancakeTime('2024-01-01T00:00:00Z').toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });

  it('groups variations into products with on-hand stock per warehouse', () => {
    const products = groupVariations([
      Variation.parse(variation()),
      Variation.parse(
        variation({
          id: 'v-2',
          display_id: 'SP000002',
          fields: [{ name: 'Màu', value: 'Xanh' }],
          is_hidden: true,
        }),
      ),
      Variation.parse(variation({ id: 'v-3', product_id: 'p-2', is_removed: true })),
    ]);
    expect(products).toHaveLength(1);
    const [p] = products;
    expect(p).toMatchObject({ externalId: 'p-1', code: 'SP000001', name: 'Xe đua mini', isActive: true });
    expect(p!.variants.map((v) => [v.sku, v.optionValues, v.stock])).toEqual([
      ['SP000001', ['Đỏ'], { 'w-1': 5 }],
      ['SP000002', ['Xanh'], { 'w-1': 5 }],
    ]);
    expect(p!.modifiedAt?.toISOString()).toBe('2026-11-20T03:00:00.123Z');
  });

  it('maps an order: channel, marketplace code, status, discounts; no customer data', () => {
    const o = toExternalOrder(Order.parse(order()));
    expect(o).toMatchObject({
      externalId: '1418',
      code: 'PC1418',
      marketplaceCode: '251121ABCDEF',
      saleChannel: 'shopee',
      status: 'delivered',
      total: 290000,
      shippingFee: 20000,
      platformFee: 25000,
    });
    expect(o.lines).toEqual([
      { sku: 'SP000001', name: 'Xe đua mini - Đỏ', quantity: 2, unitPrice: 140000 },
      { sku: 'SP000002', name: 'Búp bê', quantity: 1, unitPrice: 90000 },
    ]);
    expect(JSON.stringify(o)).not.toContain('0900000000');
  });

  it('labels unknown marketplaces and rejects unknown statuses', () => {
    expect(toExternalOrder(Order.parse(order({ marketplace_id: '-99' }))).saleChannel).toBe('pancake:-99');
    expect(toExternalOrder(Order.parse(order({ marketplace_id: '-9' }))).saleChannel).toBe('tiktok');
    expect(toExternalOrder(Order.parse(order({ marketplace_id: null }))).saleChannel).toBe('store');
    expect(() => toExternalOrder(Order.parse(order({ status: 99 })))).toThrow(
      'Unknown Pancake order status 99',
    );
  });
});

describe('PancakeAdapter', () => {
  it('pulls orders since a date with updated_at filter in unix seconds', async () => {
    const { client, fetchMock } = makeClient(() => json({ success: true, data: [order()], total_pages: 1 }));
    const adapter = new PancakeAdapter(client);
    const out = [];
    for await (const o of adapter.pullOrders(new Date('2026-11-20T00:00:00Z'))) out.push(o);
    expect(out).toHaveLength(1);
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.searchParams.get('updateStatus')).toBe('updated_at');
    expect(url.searchParams.get('startDateTime')).toBe(String(Date.parse('2026-11-20T00:00:00Z') / 1000));
  });

  it('pulls products across pages and groups them', async () => {
    const { client } = makeClient((url) =>
      url.searchParams.get('page_number') === '1'
        ? json({ success: true, data: [variation()], total_pages: 2 })
        : json({ success: true, data: [variation({ id: 'v-2', display_id: 'SP000002' })], total_pages: 2 }),
    );
    const products = [];
    for await (const p of new PancakeAdapter(client).pullProducts()) products.push(p);
    expect(products).toHaveLength(1);
    expect(products[0]!.variants).toHaveLength(2);
  });

  it('verifies the shared secret header', () => {
    const { client } = makeClient(() => json({}));
    const adapter = new PancakeAdapter(client, { webhookSecret: 's3cret' });
    const req = (h: Record<string, string>) => ({ headers: h, rawBody: '{}' });
    expect(adapter.verifyWebhook(req({ 'x-sugami-secret': 's3cret' }))).toBe(true);
    expect(adapter.verifyWebhook(req({ 'x-sugami-secret': 'wrong!' }))).toBe(false);
    expect(adapter.verifyWebhook(req({}))).toBe(false);
    expect(new PancakeAdapter(client).verifyWebhook(req({ 'x-sugami-secret': '' }))).toBe(false);
  });

  it('infers webhook types', () => {
    expect(webhookType(order())).toBe('orders');
    expect(webhookType({ data: { variation_id: 'v', warehouse_id: 'w', remain_quantity: 1 } })).toBe(
      'variations_warehouses',
    );
    expect(webhookType({ type: 'auto_call', order_id: 1 })).toBe('auto_call');
    expect(webhookType({ data: { product_id: 'p', retail_price: 1 } })).toBe('products');
    expect(webhookType({ foo: 1 })).toBe('unknown');
  });
});
