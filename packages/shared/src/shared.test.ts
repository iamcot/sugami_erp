import { describe, expect, it } from 'vitest';
import {
  allocateByWeight,
  buildSku,
  cnyFenToVnd,
  formatCnyFen,
  formatVnd,
  slugify,
  toSearchKey,
  variantMatrix,
} from './index.js';

describe('money', () => {
  it('formats VND', () => {
    expect(formatVnd(1250000)).toBe('1.250.000 ₫');
  });
  it('formats CNY fen', () => {
    expect(formatCnyFen(1999)).toBe('¥19.99');
    expect(formatCnyFen(-5)).toBe('-¥0.05');
  });
  it('converts CNY to VND', () => {
    expect(cnyFenToVnd(1999, 3650)).toBe(72964);
  });
  it('allocates exactly', () => {
    const parts = allocateByWeight(100, [1, 1, 1]);
    expect(parts).toEqual([34, 33, 33]);
    expect(allocateByWeight(250000, [2.5, 1.2, 0.3]).reduce((a, b) => a + b, 0)).toBe(250000);
    expect(allocateByWeight(10, [0, 0])).toEqual([5, 5]);
  });
});

describe('text', () => {
  it('builds search keys without diacritics', () => {
    expect(toSearchKey('  Xe   Điều Khiển  ')).toBe('xe dieu khien');
  });
  it('slugifies', () => {
    expect(slugify('Xe điều khiển 4WD!')).toBe('xe-dieu-khien-4wd');
  });
});

describe('sku', () => {
  it('builds SKU from options', () => {
    expect(buildSku('xe4wd', ['Đỏ', 'Lớn'])).toBe('XE4WD-DO-LON');
  });
  it('generates the variant matrix', () => {
    expect(
      variantMatrix([
        ['Đỏ', 'Xanh'],
        ['S', 'M'],
      ]),
    ).toEqual([
      ['Đỏ', 'S'],
      ['Đỏ', 'M'],
      ['Xanh', 'S'],
      ['Xanh', 'M'],
    ]);
  });
});
