import { describe, expect, it } from 'vitest';
import { orderNotifications, pancakeOrderSyncEnabled } from './pancake-orders.js';

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

  it('notifies each fresh order, groups many, and stays quiet for catch-up after downtime', () => {
    expect(orderNotifications([order(1, 5)])).toMatchObject([
      { title: 'Đơn mới Shopee', body: 'PC1 · 150.000 đ' },
    ]);
    expect(orderNotifications([order(1, 5), order(2, 5), order(3, 5), order(4, 5)])).toMatchObject([
      { title: '4 đơn mới' },
    ]);
    expect(orderNotifications([order(1, 60 * 24), order(2, 60 * 30)])).toEqual([]);
  });
});
