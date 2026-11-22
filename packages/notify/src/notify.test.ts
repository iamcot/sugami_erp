import { createECDH, randomBytes } from 'node:crypto';
import webpush from 'web-push';
import { describe, expect, it } from 'vitest';
import { endpointHash, isValidEndpoint, vapidFromEnv } from './index.js';

describe('notify helpers', () => {
  it('accepts only https endpoints', () => {
    expect(isValidEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isValidEndpoint('http://169.254.169.254/latest')).toBe(false);
    expect(isValidEndpoint('not a url')).toBe(false);
  });

  it('reads VAPID config from env, with a default subject', () => {
    expect(vapidFromEnv({})).toBeNull();
    expect(vapidFromEnv({ VAPID_PUBLIC_KEY: 'a', VAPID_PRIVATE_KEY: 'b' })).toEqual({ publicKey: 'a', privateKey: 'b', subject: 'https://erp.sugami.vn' });
    expect(endpointHash('x')).toHaveLength(64);
  });

  it('builds an encrypted, VAPID-signed push (aes128gcm) with generated keys', () => {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    const keys = webpush.generateVAPIDKeys();
    const req = webpush.generateRequestDetails(
      { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: ecdh.getPublicKey('base64url'), auth: randomBytes(16).toString('base64url') } },
      JSON.stringify({ title: 'Đơn mới' }),
      { vapidDetails: { subject: 'https://erp.sugami.vn', ...keys }, TTL: 60 },
    );
    expect(req.method).toBe('POST');
    expect(req.headers['Content-Encoding']).toBe('aes128gcm');
    expect(String(req.headers.Authorization)).toMatch(/^vapid t=.+, k=/);
    expect((req.body as Buffer).length).toBeGreaterThan(0);
  });
});
