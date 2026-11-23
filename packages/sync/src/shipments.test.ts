import { describe, expect, it } from 'vitest';
import { decideOrderMove } from './shipments.js';

const o = (status: string, took = false) => ({ status, stockAppliedAt: took ? new Date() : null });

describe('decideOrderMove', () => {
  it('pickup ships the order and takes stock once', () => {
    expect(decideOrderMove('picked_up', o('packing'))).toEqual({ toStatus: 'shipped', takeStock: true });
    expect(decideOrderMove('picked_up', o('confirmed'))).toEqual({ toStatus: 'shipped', takeStock: true });
    expect(decideOrderMove('picked_up', o('packing', true))).toEqual({
      toStatus: 'shipped',
      takeStock: false,
    });
  });
  it('does nothing when the order already moved on', () => {
    expect(decideOrderMove('picked_up', o('shipped', true))).toBeNull();
    expect(decideOrderMove('picked_up', o('cancelled'))).toBeNull();
  });
  it('delivery completes a shipped order, and an open one that was never marked shipped', () => {
    expect(decideOrderMove('delivered', o('shipped', true))).toEqual({
      toStatus: 'delivered',
      takeStock: false,
    });
    expect(decideOrderMove('delivered', o('packing'))).toEqual({ toStatus: 'delivered', takeStock: true });
    expect(decideOrderMove('delivered', o('completed', true))).toBeNull();
  });
  it('a returned parcel needs goods that left; stock stays out until the shop decides', () => {
    expect(decideOrderMove('returned', o('shipped', true))).toEqual({
      toStatus: 'returned',
      takeStock: false,
    });
    expect(decideOrderMove('returned', o('packing'))).toBeNull();
  });
  it('waiting, failed attempts and cancellations leave the order alone', () => {
    for (const p of ['waiting', 'failed_attempt', 'returning', 'canceled'] as const)
      expect(decideOrderMove(p, o('packing'))).toBeNull();
  });
});
