import { describe, expect, it } from 'vitest';
import { lineKey } from './sku-map.js';

describe('unlinked line name', () => {
  it('takes the marketplace code before " - "', () => {
    expect(lineKey('176398564750 - Bình Nước Eco Bottle Gen II 500ml')).toBe('176398564750');
    expect(lineKey('Bình Nước Eco Bottle')).toBeUndefined();
  });
});
