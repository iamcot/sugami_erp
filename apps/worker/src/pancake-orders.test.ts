import { describe, expect, it } from 'vitest';
import { activityFromSync } from './activity.js';
import { pancakeOrderSyncEnabled } from './pancake-orders.js';

const order = (n: number, ageMin: number) => ({
  code: `PC${n}`,
  channel: 'shopee',
  total: 150000,
  orderedAt: new Date(Date.now() - ageMin * 60_000),
});

describe('pancake order sync', () => {
  it('is on only with credentials and not switched off', () => {
    expect(pancakeOrderSyncEnabled({})).toBe(false);
    expect(pancakeOrderSyncEnabled({ PANCAKE_API_KEY: 'k', PANCAKE_SHOP_ID: '1' })).toBe(true);
    expect(
      pancakeOrderSyncEnabled({ PANCAKE_API_KEY: 'k', PANCAKE_SHOP_ID: '1', PANCAKE_ORDER_SYNC: 'off' }),
    ).toBe(false);
  });

  it('logs each new order, pushes fresh ones, groups a burst, and stays quiet for catch-up', () => {
    const one = activityFromSync({ newOrders: [order(1, 5)], events: [] });
    expect(one).toMatchObject([{ title: 'Đơn mới Shopee', body: 'PC1 · 150.000 đ', push: true }]);
    const burst = activityFromSync({
      newOrders: [order(1, 5), order(2, 5), order(3, 5), order(4, 5)],
      events: [],
    });
    expect(burst.filter((a) => a.push)).toMatchObject([{ title: '4 đơn mới' }]);
    expect(burst.filter((a) => !a.push)).toHaveLength(4);
    const old = activityFromSync({ newOrders: [order(1, 60 * 24)], events: [] });
    expect(old).toMatchObject([{ push: false }]);
  });

  it('tells about cancelled, returned and changed orders by push, other status moves only in the log', () => {
    const ev = (to: string, kind: 'status' | 'items' = 'status') => ({
      code: 'PC9',
      channel: 'tiktok',
      kind,
      from: 'confirmed',
      to,
      total: 99000,
    });
    const r = activityFromSync({
      newOrders: [],
      events: [ev('cancelled'), ev('shipped'), ev('confirmed', 'items')],
    });
    expect(r.map((a) => [a.title, a.push])).toEqual([
      ['Đơn TikTok bị hủy', true],
      ['Đơn TikTok: Đã giao cho vận chuyển', false],
      ['Đơn TikTok đổi sản phẩm', true],
    ]);
  });
});
