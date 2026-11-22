import { describe, expect, it } from 'vitest';
import { selectChanged } from './pancake-stock.js';

describe('selectChanged', () => {
  const refs = [
    { variantId: 'a', variationId: 'pa', hash: '5' },
    { variantId: 'b', variationId: 'pb', hash: null },
    { variantId: 'c', variationId: 'pc', hash: '0' },
  ];
  it('returns only variants whose number changed since the last push', () => {
    const changed = selectChanged(
      refs,
      new Map([
        ['a', 5],
        ['b', 3],
        ['c', 2],
      ]),
    );
    expect(changed.map((c) => [c.variantId, c.qty])).toEqual([
      ['b', 3],
      ['c', 2],
    ]);
  });
  it('treats a variant with no stock row as 0', () => {
    expect(selectChanged([{ variantId: 'c', variationId: 'pc', hash: '0' }], new Map())).toEqual([]);
  });
});
