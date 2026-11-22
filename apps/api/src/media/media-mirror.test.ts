import { describe, expect, it } from 'vitest';
import { isSafeImageUrl } from './media-mirror.js';

describe('isSafeImageUrl', () => {
  it('accepts public https hosts only', () => {
    expect(isSafeImageUrl('https://cf.shopee.vn/file/abc.jpg')).toBe(true);
    expect(isSafeImageUrl('http://cf.shopee.vn/file/abc.jpg')).toBe(false);
    expect(isSafeImageUrl('https://localhost/a.jpg')).toBe(false);
    expect(isSafeImageUrl('https://127.0.0.1/a.jpg')).toBe(false);
    expect(isSafeImageUrl('https://[::1]/a.jpg')).toBe(false);
    expect(isSafeImageUrl('https://intranet/a.jpg')).toBe(false);
    expect(isSafeImageUrl('not a url')).toBe(false);
  });
});
