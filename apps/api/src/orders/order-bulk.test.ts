import { describe, expect, it } from 'vitest';
import { cannotComplete } from './order-bulk.js';

describe('cannotComplete', () => {
  it('lets counter and KiotViet orders be closed', () => {
    expect(cannotComplete({ source: 'pos', status: 'confirmed' })).toBeNull();
    expect(cannotComplete({ source: 'kiotviet_excel', status: 'shipped' })).toBeNull();
  });
  it('leaves marketplace, finished, cancelled and returned orders alone', () => {
    expect(cannotComplete({ source: 'pancake', status: 'confirmed' })).toMatch(/sàn/);
    expect(cannotComplete({ source: 'pos', status: 'completed' })).not.toBeNull();
    expect(cannotComplete({ source: 'pos', status: 'cancelled' })).not.toBeNull();
    expect(cannotComplete({ source: 'pos', status: 'returned' })).not.toBeNull();
  });
});
