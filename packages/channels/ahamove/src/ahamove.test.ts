import { describe, expect, it } from 'vitest';
import { AhamoveClient, AhamoveError, ahamoveStage, ahamoveStatusText } from './index.js';

type Call = { url: string; method: string; auth: string | null; body: unknown };

function fakeFetch(replies: { status?: number; json: unknown }[]) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const h = init.headers as Record<string, string>;
    calls.push({
      url,
      method: init.method ?? 'GET',
      auth: h.Authorization ?? null,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const r = replies.shift()!;
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

/** A clock that moves on each call, so the rate limiter refills while the fake sleep does nothing. */
const clock = () => {
  let t = 0;
  return () => (t += 1000);
};
const mk = (f: typeof fetch) =>
  new AhamoveClient({ apiKey: 'KEY', mobile: '0900', env: 'stg', fetch: f, sleep: async () => {}, now: clock() });
const stop = { address: 'a', name: 'n', mobile: '1' };

describe('AhamoveClient', () => {
  it('gets a token once and reuses it', async () => {
    const { f, calls } = fakeFetch([
      { json: { token: 'T1' } },
      { json: [{ _id: 'SGN-BIKE', name_vi_vn: 'Siêu tốc' }] },
      { json: [] },
    ]);
    const c = mk(f);
    expect(await c.services('SGN')).toEqual([{ id: 'SGN-BIKE', name: 'Siêu tốc' }]);
    await c.services('SGN');
    expect(calls[0]).toMatchObject({
      url: 'https://partner-apistg.ahamove.com/v3/accounts/token',
      body: { mobile: '0900', api_key: 'KEY' },
    });
    expect(calls[1]!.auth).toBe('Bearer T1');
    expect(calls).toHaveLength(3);
  });

  it('refreshes the token after a 401 and retries once', async () => {
    const { f, calls } = fakeFetch([
      { json: { token: 'OLD' } },
      { status: 401, json: { code: 'NOT_AUTHORIZED' } },
      { json: { token: 'NEW' } },
      { json: { order_id: 'AB12', status: 'ASSIGNING', shared_link: 'https://x', order: { total_price: 15000 } } },
    ]);
    const r = await mk(f).createOrder({ serviceId: 'SGN-BIKE', pickup: stop, dropoff: stop, payment: 'CASH' });
    expect(r).toEqual({ orderId: 'AB12', status: 'ASSIGNING', sharedLink: 'https://x', fee: 15000 });
    expect(calls.at(-1)!.auth).toBe('Bearer NEW');
  });

  it('maps quotes and marks refused services', async () => {
    const { f } = fakeFetch([
      { json: { token: 'T' } },
      {
        json: [
          { service_id: 'SGN-BIKE', data: { total_price: 14000.4, distance: 3.2 } },
          { service_id: 'SGN-TRUCK', error: {} },
        ],
      },
    ]);
    const q = await mk(f).quote(stop, stop, ['SGN-BIKE', 'SGN-TRUCK']);
    expect(q[0]).toEqual({ serviceId: 'SGN-BIKE', fee: 14000, distanceKm: 3.2 });
    expect(q[1]!.error).toBeTruthy();
  });

  it('does not retry a failed create (could book two drivers) and hides the key', async () => {
    const { f, calls } = fakeFetch([{ json: { token: 'T' } }, { status: 500, json: { description: 'boom' } }]);
    const err = await mk(f)
      .createOrder({ serviceId: 'X', pickup: stop, dropoff: stop, payment: 'CASH' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AhamoveError);
    expect((err as Error).message).not.toContain('KEY');
    expect(calls).toHaveLength(2);
  });

  it('cancels with the reason in the body', async () => {
    const { f, calls } = fakeFetch([{ json: { token: 'T' } }, { json: {} }]);
    await mk(f).cancelOrder('AB12', 'Khách hủy');
    expect(calls[1]).toMatchObject({ method: 'DELETE', body: { comment: 'Khách hủy' } });
    expect(calls[1]!.url).toMatch(/\/orders\/AB12$/);
  });
});

describe('status', () => {
  it('maps stages', () => {
    expect(ahamoveStage('ASSIGNING')).toBe('searching');
    expect(ahamoveStage('IN PROCESS')).toBe('delivering');
    expect(ahamoveStage('COMPLETED')).toBe('delivered');
    expect(ahamoveStage('CANCELLED')).toBe('cancelled');
    expect(ahamoveStatusText('ACCEPTED', 'ARRIVED')).toMatch(/đã đến/);
  });
});
