import { describe, expect, it, vi } from 'vitest';
import { KiotVietClient, KiotVietError, RateLimiter } from './client.js';
import { keyPaths, redact } from './redact.js';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function makeClient(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
    handler(String(input), init ?? {}),
  );
  const client = new KiotVietClient({
    clientId: 'id',
    clientSecret: 'secret',
    retailer: 'sugami',
    fetch: fetchMock as unknown as typeof fetch,
    sleep: async () => {},
    retryDelaysMs: [1, 1],
  });
  return { client, fetchMock };
}

const tokenOk = () => jsonResponse({ access_token: 'tok', expires_in: 86400, token_type: 'Bearer' });

describe('KiotVietClient', () => {
  it('requests a token with client_credentials and sends Retailer header', async () => {
    const { client, fetchMock } = makeClient((url, init) => {
      if (url.includes('connect/token')) {
        const body = String(init.body);
        expect(body).toContain('grant_type=client_credentials');
        expect(body).toContain('scopes=PublicApi.Access');
        return tokenOk();
      }
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer tok');
      expect(headers.Retailer).toBe('sugami');
      expect(url).toBe('https://public.kiotapi.com/branches?pageSize=5');
      return jsonResponse({ total: 1, data: [{ id: 1 }] });
    });
    const res = await client.get<{ total: number }>('/branches', { pageSize: 5, skip: undefined });
    expect(res.total).toBe(1);
    expect(client.lastTokenExpiresIn).toBe(86400);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches the token and shares one request between concurrent callers', async () => {
    let tokenCalls = 0;
    const { client } = makeClient((url) => {
      if (url.includes('connect/token')) {
        tokenCalls++;
        return tokenOk();
      }
      return jsonResponse({ data: [] });
    });
    await Promise.all([client.get('/a'), client.get('/b'), client.get('/c')]);
    await client.get('/d');
    expect(tokenCalls).toBe(1);
  });

  it('re-authenticates once on 401', async () => {
    let apiCalls = 0;
    let tokenCalls = 0;
    const { client } = makeClient((url) => {
      if (url.includes('connect/token')) {
        tokenCalls++;
        return tokenOk();
      }
      apiCalls++;
      return apiCalls === 1 ? jsonResponse({}, 401) : jsonResponse({ data: [1] });
    });
    await expect(client.get('/x')).resolves.toEqual({ data: [1] });
    expect(tokenCalls).toBe(2);
  });

  it('retries 429/5xx then throws KiotVietError', async () => {
    let apiCalls = 0;
    const { client } = makeClient((url) => {
      if (url.includes('connect/token')) return tokenOk();
      apiCalls++;
      return jsonResponse({ message: 'busy' }, apiCalls < 3 ? 503 : 400);
    });
    await expect(client.get('/x')).rejects.toBeInstanceOf(KiotVietError);
    expect(apiCalls).toBe(3);
  });

  it('paginates with currentItem until total is reached', async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ id: i }));
    const { client } = makeClient((url) => {
      if (url.includes('connect/token')) return tokenOk();
      const u = new URL(url);
      const start = Number(u.searchParams.get('currentItem'));
      const size = Number(u.searchParams.get('pageSize'));
      return jsonResponse({ total: items.length, data: items.slice(start, start + size) });
    });
    const seen: number[] = [];
    for await (const it of client.paginate<{ id: number }>('/products', {}, 2)) seen.push(it.id);
    expect(seen).toEqual([0, 1, 2, 3, 4]);
  });

  it('requires credentials', () => {
    expect(() => new KiotVietClient({ clientId: '', clientSecret: 'x', retailer: 'y' })).toThrow();
  });
});

describe('RateLimiter', () => {
  it('waits when the bucket is empty', async () => {
    let now = 0;
    const sleeps: number[] = [];
    const limiter = new RateLimiter(
      3600,
      2,
      () => now,
      async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    );
    await limiter.take();
    await limiter.take();
    await limiter.take();
    expect(sleeps.length).toBe(1);
    expect(sleeps[0]).toBe(1000);
  });
});

describe('redact', () => {
  it('masks customer data but keeps product data', () => {
    const order = {
      code: 'DH001',
      customerName: 'Nguyễn Văn A',
      orderDelivery: { receiver: 'A', contactNumber: '0901234567', address: '1 Lê Lợi', name: 'x' },
      orderDetails: [{ productCode: 'XE4WD-DO', productName: 'Xe điều khiển', quantity: 1 }],
    };
    const r = redact(order) as typeof order;
    expect(r.code).toBe('DH001');
    expect(r.customerName).toBe('***(12)');
    expect(r.orderDelivery.contactNumber).toBe('***(10)');
    expect(r.orderDelivery.name).toBe('***(1)');
    expect(r.orderDetails[0]!.productName).toBe('Xe điều khiển');
  });

  it('masks name/code inside personal contexts', () => {
    const r = redact({ name: 'Trần B', code: 'KH01', id: 7 }, ['customer']) as Record<string, unknown>;
    expect(r).toEqual({ name: '***(6)', code: '***(4)', id: 7 });
  });

  it('lists key paths', () => {
    expect([...keyPaths([{ a: 1, b: { c: 2 } }])].sort()).toEqual(['[].a', '[].b', '[].b.c']);
  });
});
