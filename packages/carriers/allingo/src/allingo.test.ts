import { describe, expect, it } from 'vitest';
import { AllingoClient, AllingoError } from './client.js';
import { effectiveStatus, isFinalPhase, phaseOf } from './status.js';
import { signAllingoPayload, verifyAllingoSignature } from './webhook.js';

type Call = { url: string; method: string; headers: Record<string, string>; body?: unknown };

function fake(responses: { status?: number; json?: unknown; headers?: Record<string, string> }[]) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const r = responses.shift() ?? { json: {} };
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: r.headers });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const token = { json: { access_token: 'jwt1', expires_in: 3600 } };
const mk = (responses: Parameters<typeof fake>[0], extra = {}) => {
  const { f, calls } = fake(responses);
  const sleeps: number[] = [];
  const client = new AllingoClient({
    appId: 'app_test_x',
    appSecret: 'sk_test_x',
    fetch: f,
    sleep: async (ms) => void sleeps.push(ms),
    now: () => 1_000_000,
    ...extra,
  });
  return { client, calls, sleeps };
};

describe('AllingoClient', () => {
  it('gets a token once and sends it as a bearer', async () => {
    const { client, calls } = mk([token, { json: { quotes: [] } }, { json: { quotes: [] } }]);
    const req = {
      pickup: { contact_name: 'a', contact_phone: '1', address_line: 'x' },
      dropoff: { contact_name: 'b', contact_phone: '2', address_line: 'y' },
      package: { weight: 1, length: 1, width: 1, height: 1 },
    };
    await client.quote(req);
    await client.quote(req);
    expect(calls.map((c) => c.url.split('/api/v1')[1])).toEqual(['/oauth/token', '/inquiries', '/inquiries']);
    expect(calls[0]!.body).toEqual({
      grant_type: 'client_credentials',
      app_id: 'app_test_x',
      app_secret: 'sk_test_x',
    });
    expect(calls[1]!.headers.Authorization).toBe('Bearer jwt1');
  });

  it('sends the idempotency key on create and retries 5xx with the same key', async () => {
    const { client, calls, sleeps } = mk([
      token,
      { status: 503, json: { error: { code: 'partner_unavailable' } } },
      { json: { id: 'ord_1', track_id: 'ALG-1', status: 'queued' } },
    ]);
    const o = await client.createOrder(
      {
        service_id: 's',
        pickup: { contact_name: 'a', contact_phone: '1', address_line: 'x' },
        dropoff: { contact_name: 'b', contact_phone: '2', address_line: 'y' },
        package: { weight: 1, length: 1, width: 1, height: 1 },
      },
      'ship-BH000001-1',
    );
    expect(o.id).toBe('ord_1');
    expect(sleeps).toEqual([1000]);
    const orderCalls = calls.filter((c) => c.url.endsWith('/orders'));
    expect(orderCalls).toHaveLength(2);
    expect(orderCalls.every((c) => c.headers['Idempotency-Key'] === 'ship-BH000001-1')).toBe(true);
  });

  it('does not retry other 4xx and exposes the error code', async () => {
    const { client, calls } = mk([
      token,
      {
        status: 402,
        json: { error: { code: 'wallet_insufficient', message: 'Hết tiền' }, request_id: 'req_9' },
      },
    ]);
    const err = await client.waybill('ord_1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AllingoError);
    expect((err as AllingoError).code).toBe('wallet_insufficient');
    expect((err as AllingoError).requestId).toBe('req_9');
    expect(calls).toHaveLength(2);
  });

  it('refreshes the token once after token_expired', async () => {
    const { client, calls } = mk([
      token,
      { status: 401, json: { error: { code: 'token_expired' } } },
      { json: { access_token: 'jwt2', expires_in: 3600 } },
      { json: { id: 'ord_1', track_id: 't', status: 'queued' } },
    ]);
    const o = await client.getOrder('ord_1');
    expect(o.id).toBe('ord_1');
    expect(calls.at(-1)!.headers.Authorization).toBe('Bearer jwt2');
  });

  it('never leaks secrets into network error messages', async () => {
    const failing = (async () => {
      throw new Error('connect ECONNREFUSED sk_test_x');
    }) as unknown as typeof fetch;
    const client = new AllingoClient({
      appId: 'app_test_x',
      appSecret: 'sk_test_x',
      fetch: failing,
      sleep: async () => {},
      retryDelaysMs: [],
    });
    const err = (await client.partners().catch((e: unknown) => e)) as Error;
    expect(err.message).not.toContain('sk_test_x');
  });
});

describe('webhook signature', () => {
  const body = '{"id":"evt_1"}';
  const secret = 'whsec_1';
  const now = 1_700_000_000_000;
  it('accepts a valid signature', () => {
    expect(verifyAllingoSignature(body, signAllingoPayload(body, secret, now / 1000), secret, now)).toBe(
      true,
    );
  });
  it('rejects a tampered body, wrong secret and stale timestamp', () => {
    const h = signAllingoPayload(body, secret, now / 1000);
    expect(verifyAllingoSignature(body + ' ', h, secret, now)).toBe(false);
    expect(verifyAllingoSignature(body, h, 'other', now)).toBe(false);
    expect(verifyAllingoSignature(body, h, secret, now + 301_000)).toBe(false);
    expect(verifyAllingoSignature(body, undefined, secret, now)).toBe(false);
    expect(verifyAllingoSignature(body, 't=abc,v1=zz', secret, now)).toBe(false);
  });
});

describe('status mapping', () => {
  it('maps carrier statuses to phases', () => {
    expect(phaseOf('queued')).toBe('waiting');
    expect(phaseOf('courier_assigned')).toBe('waiting');
    expect(phaseOf('picked_up')).toBe('picked_up');
    expect(phaseOf('in_transit')).toBe('picked_up');
    expect(phaseOf('deliver_failed')).toBe('failed_attempt');
    expect(phaseOf('completed')).toBe('delivered');
    expect(phaseOf('canceled')).toBe('canceled');
    expect(phaseOf('return_active')).toBe('returning');
    expect(phaseOf('return_finished')).toBe('returned');
    expect(phaseOf('something_new')).toBe('picked_up');
  });
  it('final phases stop the poller; retryable failures do not', () => {
    expect(isFinalPhase('delivered')).toBe(true);
    expect(isFinalPhase('returned')).toBe(true);
    expect(isFinalPhase('failed_attempt')).toBe(false);
    expect(isFinalPhase('returning')).toBe(false);
  });
  it('prefers the finer delivery status', () => {
    expect(effectiveStatus('on_going', 'courier_assigned')).toBe('courier_assigned');
    expect(effectiveStatus('completed', null)).toBe('completed');
  });
});
