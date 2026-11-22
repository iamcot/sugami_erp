import { describe, expect, it } from 'vitest';
import { linkCode } from './channel-listings.js';

describe('linkCode', () => {
  it('drops the variation number Pancake appends to a link', () => {
    expect(linkCode('SP000017 - 1')).toBe('SP000017');
    expect(linkCode(' SP000017 ')).toBe('SP000017');
    expect(linkCode('ABC-DEF')).toBe('ABC-DEF');
    expect(linkCode(null)).toBeUndefined();
  });
});
