import { describe, expect, it } from 'vitest';
import { marketplaceKey } from './chat-customers.js';

describe('marketplaceKey', () => {
  it('matches the key the order sync writes: channel + lowercase nickname', () => {
    expect(marketplaceKey('shopee', 'Candy532')).toBe('shopee:candy532');
    expect(marketplaceKey('tiktok', ' Shop_A ')).toBe('tiktok:shop_a');
  });
  it('has no key for other channels or an empty nickname', () => {
    expect(marketplaceKey('facebook', 'abc')).toBeNull();
    expect(marketplaceKey('shopee', '  ')).toBeNull();
  });
});
