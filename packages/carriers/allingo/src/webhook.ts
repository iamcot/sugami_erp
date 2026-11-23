import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Check `X-AllinGo-Signature: t=<unix>,v1=<hex>`: v1 is HMAC-SHA256 of "<t>.<raw body>" with the endpoint's
 * secret. Reject when the timestamp is more than 300 s off (replay) or the digest differs.
 */
export function verifyAllingoSignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
  nowMs: number = Date.now(),
  toleranceSec = 300,
): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1 || !/^[0-9a-f]+$/i.test(v1)) return false;
  if (Math.abs(nowMs / 1000 - t) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest();
  const given = Buffer.from(v1, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Header value for tests and the local simulator. */
export function signAllingoPayload(rawBody: string, secret: string, tSec: number): string {
  return `t=${tSec},v1=${createHmac('sha256', secret).update(`${tSec}.${rawBody}`).digest('hex')}`;
}
