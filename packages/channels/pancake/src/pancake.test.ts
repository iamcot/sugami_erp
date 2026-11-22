import { describe, expect, it, vi } from 'vitest';
import { PancakeAdapter, webhookType } from './adapter.js';
import { PancakeClient, PancakeError } from './client.js';
import { imagesBySku, Listing } from './listings.js';
import { groupVariations, parseDeadline, parsePancakeTime, toExternalOrder } from './mapping.js';
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

  it('maps an order: channel, marketplace code, status, discounts, buyer name and phone only', () => {
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
      { externalVariantId: 'v-1', sku: 'SP000001', name: 'Xe đua mini - Đỏ', quantity: 2, unitPrice: 140000 },
      { externalVariantId: 'v-2', sku: 'SP000002', name: 'Búp bê', quantity: 1, unitPrice: 90000 },
    ]);
    expect(o.customer).toEqual({ name: 'Không được đọc', phone: '0900000000' });
    expect(JSON.stringify(o)).not.toContain('Hà Nội');
    expect(
      toExternalOrder(Order.parse(order({ bill_full_name: 'T******u', bill_phone_number: '0****53' })))
        .customer,
    ).toBeUndefined();
  });

  it('reads the buyer nickname, ship-by deadline, address and fee breakdown', () => {
    const o = toExternalOrder(
      Order.parse(
        order({
          bill_full_name: 'T******u',
          bill_phone_number: '0****53',
          customer: { username: 'candy532', name: 'C****2' },
          additional_info: { ship_by_date: 1795000000 },
          shipping_address: { full_address: '12 Lê Lợi, Quận 1', province_name: 'TP. Hồ Chí Minh' },
          advanced_platform_fee: { commission_fee: 12000, service_fee: 3000, other: 0, note: 'x' },
        }),
      ),
    );
    expect(o.customer).toEqual({ name: 'candy532' });
    expect(o.shipByAt).toEqual(new Date(1795000000 * 1000));
    expect(o.shipAddress).toBe('12 Lê Lợi, Quận 1');
    expect(o.shipProvince).toBe('TP. Hồ Chí Minh');
    const masked = toExternalOrder(
      Order.parse(
        order({
          shipping_address: {
            address: '******ường',
            commune_name: 'Phường Gia Định',
            province_name: 'TP. HCM',
          },
          bill_phone_number: '0****53',
        }),
      ),
    );
    expect(masked.shipAddress).toBe('******ường, Phường Gia Định, TP. HCM');
    expect(masked.shipPhone).toBe('0****53');
    expect(o.feeDetail).toEqual({ commission_fee: 12000, service_fee: 3000 });
    expect(parseDeadline(1795000000000)).toEqual(new Date(1795000000000));
    expect(parseDeadline('garbage')).toBeUndefined();
  });

  it('uses the display id as the marketplace order number when the invoice list has none', () => {
    const base = { invoice_info_list: [] };
    expect(
      toExternalOrder(Order.parse(order({ ...base, display_id: '2611220ND1CP8V' }))).marketplaceCode,
    ).toBe('2611220ND1CP8V');
    expect(
      toExternalOrder(Order.parse(order({ ...base, display_id: null, id: '261121UJNGHVQJ' })))
        .marketplaceCode,
    ).toBe('261121UJNGHVQJ');
    expect(
      toExternalOrder(Order.parse(order({ ...base, display_id: 1418 }))).marketplaceCode,
    ).toBeUndefined();
    expect(
      toExternalOrder(Order.parse(order({ ...base, marketplace_id: null, display_id: 'AB12CD34EF' })))
        .marketplaceCode,
    ).toBeUndefined();
  });

  it('reads the shipping carrier and tracking number from the partner', () => {
    const o = toExternalOrder(
      Order.parse(order({ partner: { partner_name: ' SPX ', extend_code: 'SPXVN0123456789' } })),
    );
    expect(o).toMatchObject({ carrier: 'SPX', trackingNo: 'SPXVN0123456789' });
    expect(toExternalOrder(Order.parse(order())).carrier).toBeUndefined();
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

describe('push to Pancake', () => {
  const input = {
    code: 'XE1',
    name: 'Xe đua mini',
    description: null,
    options: ['Màu'],
    variants: [
      { sku: 'XE1-DO', barcode: '893', optionValues: ['Đỏ'], price: 150000, cost: 90000, onHand: 4 },
      { sku: 'XE1-XANH', barcode: null, optionValues: ['Xanh'], price: 150000, cost: 90000, onHand: -2 },
    ],
  };

  it('builds the create body with seller codes, prices and stock in the chosen warehouse', async () => {
    const { buildCreateProductBody } = await import('./push.js');
    const body = buildCreateProductBody(input, 'wh-1');
    expect(body.product).toMatchObject({
      name: 'Xe đua mini',
      custom_id: 'XE1',
      product_attributes: [{ name: 'Màu', values: ['Đỏ', 'Xanh'] }],
    });
    expect(body.product.variations[0]).toMatchObject({
      custom_id: 'XE1-DO',
      barcode: '893',
      fields: [{ name: 'Màu', value: 'Đỏ' }],
      retail_price: 150000,
      last_imported_price: 90000,
      variations_warehouses: [{ warehouse_id: 'wh-1', remain_quantity: 4 }],
    });
    expect(body.product.variations[1]).not.toHaveProperty('barcode');
    expect(body.product.variations[1]!.variations_warehouses[0]!.remain_quantity).toBe(0);
  });

  it('finds existing variations by custom_id or display_id', async () => {
    const { findVariationsBySku } = await import('./push.js');
    const { client } = makeClient(() =>
      json({
        data: [
          variation({ id: 'a', custom_id: 'XE1-DO', display_id: '1' }),
          variation({ id: 'b', custom_id: null, display_id: 'XE1-XANH' }),
          variation({ id: 'c', custom_id: 'OTHER', display_id: '3' }),
        ],
        total_pages: 1,
      }),
    );
    const found = await findVariationsBySku(client, ['XE1-DO', 'XE1-XANH', 'NONE']);
    expect([...found].map(([sku, v]) => [sku, v.id])).toEqual([
      ['XE1-DO', 'a'],
      ['XE1-XANH', 'b'],
    ]);
  });

  it('sends stock as actual inventory and never leaks the api key on errors', async () => {
    const { setStock } = await import('./push.js');
    let sent: { url: URL; body: unknown } | undefined;
    const fetchSpy = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      sent = { url: new URL(String(input)), body: JSON.parse(String(init?.body)) };
      return json({ success: true });
    });
    const c = new PancakeClient({
      apiKey: 'secret-key',
      shopId: '123',
      fetch: fetchSpy as unknown as typeof fetch,
      sleep: async () => {},
    });
    await setStock(c, 'v-1', 'wh-1', 7);
    expect(sent!.url.pathname).toBe('/api/v1/shops/123/variations/update_quantity');
    expect(sent!.body).toEqual({
      is_actual_remain_quantity: true,
      variations_warehouses: [{ variation_id: 'v-1', warehouse_id: 'wh-1', remain_quantity: 7 }],
    });
    const bad = makeClient(() => json({ success: false, message: 'Invalid warehouse' }, 400)).client;
    await expect(setStock(bad, 'v-1', 'x', 1)).rejects.toThrow(/Invalid warehouse/);
    await expect(setStock(bad, 'v-1', 'x', 1)).rejects.not.toThrow(/secret-key/);
  });
});

describe('marketplace listing images', () => {
  it('maps seller SKUs to images, Vietnam shop first, single-variation listings fall back to the listing SKU', () => {
    const l = (shop: string, over: Record<string, unknown>) =>
      Listing.parse({ id: shop, marketplace_shop_name: shop, ...over });
    const map = imagesBySku([
      l('SuGaMi - PH', { variations: [{ id: 'a', sku: 'SP1', images: ['https://ph/1.jpg'] }] }),
      l('SuGaMi', { variations: [{ id: 'b', sku: 'SP1', images: ['https://vn/1.jpg', 'bad'] }] }),
      l('SuGaMi', { sku: 'SP2', variations: [{ id: 'c', sku: '', images: ['https://vn/2.jpg'] }] }),
      l('SuGaMi', { variations: [{ id: 'd', sku: 'SP3', images: [] }] }),
    ]);
    expect(map.get('SP1')?.images).toEqual(['https://vn/1.jpg']);
    expect(map.get('SP2')?.images).toEqual(['https://vn/2.jpg']);
    expect(map.has('SP3')).toBe(false);
  });
});

describe('lineName', () => {
  it('appends the option text that Pancake keeps apart from the title', async () => {
    const { lineName } = await import('./mapping.js');
    expect(
      lineName({
        variation_info: { name: '176 - Bình nước Eco Bottle', fields: [{ value: 'Xanh đen đậm' }] },
      }),
    ).toBe('176 - Bình nước Eco Bottle - Xanh đen đậm');
  });
  it('leaves the name alone when it already has the option or there is none', async () => {
    const { lineName } = await import('./mapping.js');
    expect(lineName({ variation_info: { name: 'Bình - Xanh', fields: [{ value: 'xanh' }] } })).toBe(
      'Bình - Xanh',
    );
    expect(lineName({ variation_info: { name: 'Bình' } })).toBe('Bình');
    expect(lineName({})).toBe('');
  });
});
