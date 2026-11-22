import { describe, expect, it } from 'vitest';
import { landedCosts } from './purchasing.js';

describe('landedCosts', () => {
  it('spreads extra costs by value and converts CNY', () => {
    // 10 × ¥10.00 (1000 fen) at 3600 => 360,000 ₫ ; 5 × ¥20.00 at 3600 => 360,000 ₫
    const r = landedCosts(
      [
        { qty: 10, unitPrice: 1000 },
        { qty: 5, unitPrice: 2000 },
      ],
      { currency: 'CNY', fxRate: 3600, extraCostVnd: 72_000 },
    );
    expect(r.map((x) => x.valueVnd)).toEqual([360_000, 360_000]);
    expect(r.map((x) => x.extraVnd)).toEqual([36_000, 36_000]);
    expect(r.map((x) => x.unitCost)).toEqual([39_600, 79_200]);
  });

  it('keeps shares exact and works in VND', () => {
    const r = landedCosts(
      [
        { qty: 1, unitPrice: 10_000 },
        { qty: 1, unitPrice: 10_000 },
        { qty: 1, unitPrice: 10_000 },
      ],
      { currency: 'VND', extraCostVnd: 100 },
    );
    expect(r.reduce((a, x) => a + x.extraVnd, 0)).toBe(100);
  });

  it('needs a rate for CNY', () => {
    expect(() => landedCosts([{ qty: 1, unitPrice: 100 }], { currency: 'CNY', extraCostVnd: 0 })).toThrow();
  });
});
