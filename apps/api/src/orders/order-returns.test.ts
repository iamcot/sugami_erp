import { describe, expect, it } from 'vitest';
import { stillHeld } from './order-returns.js';

describe('stillHeld', () => {
  it('gives back what the order still holds per variant', () => {
    const held = stillHeld([
      { variantId: 'a', qtyDelta: -2 },
      { variantId: 'b', qtyDelta: -1 },
      { variantId: 'b', qtyDelta: 1 }, // already given back
      { variantId: 'a', qtyDelta: -1 },
    ]);
    expect([...held]).toEqual([['a', 3]]);
  });

  it('ignores variants with no net outflow', () => {
    expect(stillHeld([{ variantId: 'a', qtyDelta: 2 }]).size).toBe(0);
  });
});
