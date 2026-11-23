/**
 * Allingo Developer API client. One base URL serves test and live; the key prefix decides the mode.
 * Auth: POST /oauth/token (client_credentials) returns a 1 h JWT that is cached until shortly before it expires.
 * Writes carry an `Idempotency-Key`, so a retry after a network error returns the first answer instead of a
 * second shipment. Never put the app secret or the token into an error message or a log line.
 */
import { RateLimiter } from '@sugami/channels-core';
import type {
  AllingoOrder,
  AllingoPartner,
  AllingoTimelineEvent,
  InquiryRequest,
  InquiryResponse,
  OrderRequest,
} from './types.js';

export const ALLINGO_API_BASE = 'https://pro.allingo.vn/api/v1';

export interface AllingoClientOptions {
  appId: string;
  appSecret: string;
  apiBase?: string;
  fetch?: typeof fetch;
  /** Delays between retries for 408/429/5xx/network errors, in ms (docs: backoff 1 s up to 60 s). */
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export class AllingoError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Allingo error code, e.g. wallet_insufficient, cannot_cancel, validation_failed. */
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'AllingoError';
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class AllingoClient {
  private readonly fetchImpl: typeof fetch;
  private readonly apiBase: string;
  private readonly retryDelaysMs: number[];
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly limiter: RateLimiter;
  private token: { value: string; expiresAt: number } | null = null;
  requestCount = 0;

  constructor(private readonly opts: AllingoClientOptions) {
    if (!opts.appId || !opts.appSecret) throw new Error('Allingo appId and appSecret are required');
    this.fetchImpl = opts.fetch ?? fetch;
    this.apiBase = (opts.apiBase ?? ALLINGO_API_BASE).replace(/\/$/, '');
    this.retryDelaysMs = opts.retryDelaysMs ?? [1_000, 4_000, 15_000];
    this.sleep = opts.sleep ?? defaultSleep;
    this.now = opts.now ?? Date.now;
    // Standard tier: 100 writes and 300 reads per minute; stay well under with 2 requests per second.
    this.limiter = new RateLimiter(2 * 3600, 5, this.now, this.sleep);
  }

  /** Test mode when the app id carries the test prefix. */
  get isTest(): boolean {
    return this.opts.appId.startsWith('app_test_');
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - 60_000 > this.now()) return this.token.value;
    const res = await this.send('POST', '/oauth/token', undefined, {
      grant_type: 'client_credentials',
      app_id: this.opts.appId,
      app_secret: this.opts.appSecret,
    });
    const body = res as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new AllingoError('Allingo token response has no access_token', 502);
    this.token = { value: body.access_token, expiresAt: this.now() + (body.expires_in ?? 3600) * 1000 };
    return body.access_token;
  }

  /** One HTTP exchange with retry on network errors, 408, 429 and 5xx. `auth` undefined = no bearer token. */
  private async send(
    method: string,
    path: string,
    auth: string | undefined,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<unknown> {
    const label = `Allingo ${method} ${path.split('?')[0]}`;
    for (let attempt = 0; ; attempt++) {
      await this.limiter.take();
      let res: Response;
      try {
        this.requestCount++;
        res = await this.fetchImpl(`${this.apiBase}${path}`, {
          method,
          headers: {
            Accept: 'application/json',
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
            ...extraHeaders,
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch {
        const delay = this.retryDelaysMs[attempt];
        if (delay === undefined) throw new AllingoError(`${label} failed (network)`, 0);
        await this.sleep(delay);
        continue;
      }
      const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
      if (retryable && attempt < this.retryDelaysMs.length) {
        const wait = Number(res.headers.get('retry-after')) * 1000;
        await this.sleep(wait > 0 ? Math.min(wait, 60_000) : this.retryDelaysMs[attempt]!);
        continue;
      }
      const text = await res.text();
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : undefined;
      } catch {
        throw new AllingoError(`${label} returned non-JSON (${res.status})`, res.status);
      }
      if (!res.ok) {
        const e = json as {
          error?: { code?: string; message?: string } | string;
          error_description?: string;
          request_id?: string;
        };
        const code = typeof e?.error === 'string' ? e.error : e?.error?.code;
        const message = typeof e?.error === 'string' ? e.error_description : e?.error?.message;
        throw new AllingoError(
          `${label} failed (${res.status}${code ? ` ${code}` : ''}): ${message ?? 'unknown error'}`,
          res.status,
          code,
          e?.request_id,
        );
      }
      return json;
    }
  }

  private async call<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    let token = await this.accessToken();
    try {
      return (await this.send(method, path, token, body, extraHeaders)) as T;
    } catch (err) {
      // an expired or revoked token: fetch a new one once and repeat
      if (
        err instanceof AllingoError &&
        err.status === 401 &&
        (err.code === 'token_expired' || err.code === 'token_revoked')
      ) {
        this.token = null;
        token = await this.accessToken();
        return (await this.send(method, path, token, body, extraHeaders)) as T;
      }
      throw err;
    }
  }

  /** Raw JSON of any call, unmapped: for the probe script only. */
  debugCall(method: string, path: string, body?: unknown): Promise<unknown> {
    return this.call(method, path, body);
  }

  /** Fee quotes of every carrier service that can take this parcel. */
  quote(req: InquiryRequest): Promise<InquiryResponse> {
    return this.call('POST', '/inquiries', req);
  }

  /** Create a shipment. The same `idempotencyKey` always returns the same shipment (cached 24 h). */
  createOrder(req: OrderRequest, idempotencyKey: string): Promise<AllingoOrder> {
    return this.call('POST', '/orders', req, { 'Idempotency-Key': idempotencyKey });
  }

  cancelOrder(
    id: string,
    idempotencyKey: string,
    reason?: string,
  ): Promise<{ id: string; status: string; canceled_at?: string; refunded_amount?: number }> {
    return this.call('POST', `/orders/${encodeURIComponent(id)}/cancel`, reason ? { reason } : {}, {
      'Idempotency-Key': idempotencyKey,
    });
  }

  getOrder(id: string): Promise<AllingoOrder> {
    return this.call('GET', `/orders/${encodeURIComponent(id)}`);
  }

  async timeline(id: string): Promise<AllingoTimelineEvent[]> {
    const r = await this.call<{ events?: AllingoTimelineEvent[] }>(
      'GET',
      `/orders/${encodeURIComponent(id)}/timeline`,
    );
    return r.events ?? [];
  }

  /** Signed, expiring PDF link of the waybill. */
  waybill(id: string): Promise<{ url: string; expires_at?: string }> {
    return this.call('GET', `/orders/${encodeURIComponent(id)}/waybill-pdf`);
  }

  async partners(): Promise<AllingoPartner[]> {
    const r = await this.call<{ data?: AllingoPartner[] }>('GET', '/partners');
    return r.data ?? [];
  }

  wallet(): Promise<Record<string, unknown>> {
    return this.call('GET', '/wallet');
  }

  /** Test mode only: move a test shipment to a status (queued, picked_up, completed, return_finished...). */
  advanceTest(id: string, toStatus: string): Promise<AllingoOrder> {
    return this.call('POST', `/test/orders/${encodeURIComponent(id)}/advance`, { to_status: toStatus });
  }
}
