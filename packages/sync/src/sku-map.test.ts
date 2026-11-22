import { describe, expect, it } from 'vitest';
import { lineKey, pairLines } from './sku-map.js';

describe('lineKey', () => {
  it('reads the leading marketplace code of a line name', () => {
    expect(lineKey('207086204498 - Bác sĩ gấu bông')).toBe('207086204498');
    expect(lineKey('Bình nước 500ml')).toBeUndefined();
    expect(lineKey('')).toBeUndefined();
  });
});

describe('pairLines', () => {
  it('pairs a single line on both sides', () => {
    expect(pairLines([{ key: 'A1234', quantity: 2 }], [{ variantId: 'v1', quantity: 2 }])).toEqual({
      pairs: [{ key: 'A1234', variantId: 'v1' }],
      ambiguous: 0,
    });
  });
  it('pairs several lines only when the quantity is unique, else counts ambiguous', () => {
    const r = pairLines(
      [
        { key: 'A1234', quantity: 1 },
        { key: 'B1234', quantity: 2 },
        { key: 'C1234', quantity: 2 },
      ],
      [
        { variantId: 'v1', quantity: 1 },
        { variantId: 'v2', quantity: 2 },
        { variantId: 'v3', quantity: 2 },
      ],
    );
    expect(r.pairs).toEqual([{ key: 'A1234', variantId: 'v1' }]);
    expect(r.ambiguous).toBe(2);
  });
});
