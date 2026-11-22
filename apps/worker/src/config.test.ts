import { describe, expect, it } from 'vitest';
import { redisConnectionFromUrl } from './config.js';

describe('redisConnectionFromUrl', () => {
  it('defaults to localhost', () => {
    expect(redisConnectionFromUrl(undefined)).toEqual({ host: 'localhost', port: 6379 });
  });
  it('parses password and port', () => {
    expect(redisConnectionFromUrl('redis://:p%40ss@redis:6380')).toEqual({
      host: 'redis',
      port: 6380,
      password: 'p@ss',
    });
  });
  it('rejects other protocols', () => {
    expect(() => redisConnectionFromUrl('http://x')).toThrow();
  });
});
