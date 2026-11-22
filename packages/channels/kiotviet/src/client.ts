/**
 * Minimal KiotViet Public API client.
 * Auth: OAuth2 client_credentials at id.kiotviet.vn, scope PublicApi.Access.
 * Every call sends `Authorization: Bearer <token>` and `Retailer: <store name>`.
 * GET limit is ~5,000 requests/hour per store, so calls go through a token bucket.
 */

export const KIOTVIET_TOKEN_URL = 'https://id.kiotviet.vn/connect/token';
export const KIOTVIET_API_BASE = 'https://public.kiotapi.com';

export interface KiotVietCredentials {
  clientId: string;
  clientSecret: string;
  retailer: string;
}

export interface KiotVietClientOptions extends KiotVietCredentials {
  fetch?: typeof fetch;
  tokenUrl?: string;
  apiBase?: string;
  /** Max requests per hour (default 4,500, below KiotViet's 5,000 GET limit). */
  requestsPerHour?: number;
  /** Delays between retries for 429/5xx/network errors, in ms. */
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export class KiotVietError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = 'KiotVietError';
  }
}

export interface KiotVietPage<T> {
  total?: number;
  pageSize?: number;
  data: T[];
  removedIds?: number[];
  removeId?: number[];
  timestamp?: string;
}

export type Query = Record<string, string | number | boolean | undefined>;

/** Simple token bucket: capacity = burst, refills to requestsPerHour over an hour. */
export class RateLimiter {
  private tokens: number;
  private last: number;
  private readonly perMs: number;

  constructor(
    requestsPerHour: number,
    private readonly burst: number,
    private readonly now: () => number,
    private readonly sleep: (ms: number) => Promise<void>,
  ) {
    this.tokens = burst;
    this.perMs = requestsPerHour / 3_600_000;
    this.last = now();
  }

  async take(): Promise<void> {
    for (;;) {
      const t = this.now();
      this.tokens = Math.min(this.burst, this.tokens + (t - this.last) * this.perMs);
      this.last = t;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      await this.sleep(Math.ceil((1 - this.tokens) / this.perMs));
    }
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class KiotVietClient {
  private readonly fetchImpl: typeof fetch;
  private readonly tokenUrl: string;
  private readonly apiBase: string;
  private readonly retryDelaysMs: number[];
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly limiter: RateLimiter;
  private token?: { value: string; expiresAt: number };
  private tokenPromise?: Promise<string>;
  /** Token lifetime reported by the last token response, in seconds. */
  lastTokenExpiresIn?: number;
  /** Number of HTTP requests sent to the API (excluding token requests). */
  requestCount = 0;

  constructor(private readonly opts: KiotVietClientOptions) {
    if (!opts.clientId || !opts.clientSecret || !opts.retailer) {
      throw new Error('KiotViet clientId, clientSecret and retailer are required');
    }
    this.fetchImpl = opts.fetch ?? fetch;
    this.tokenUrl = opts.tokenUrl ?? KIOTVIET_TOKEN_URL;
    this.apiBase = (opts.apiBase ?? KIOTVIET_API_BASE).replace(/\/$/, '');
    this.retryDelaysMs = opts.retryDelaysMs ?? [1_000, 4_000, 15_000];
    this.sleep = opts.sleep ?? defaultSleep;
    this.now = opts.now ?? Date.now;
    this.limiter = new RateLimiter(opts.requestsPerHour ?? 4_500, 10, this.now, this.sleep);
  }

  /** Get a cached access token, refreshing 5 minutes before expiry. Concurrent callers share one request. */
  async getToken(force = false): Promise<string> {
    if (!force && this.token && this.token.expiresAt - 300_000 > this.now()) return this.token.value;
    this.tokenPromise ??= this.fetchToken().finally(() => {
      this.tokenPromise = undefined;
    });
    return this.tokenPromise;
  }

  private async fetchToken(): Promise<string> {
    const body = new URLSearchParams({
      scopes: 'PublicApi.Access',
      grant_type: 'client_credentials',
      client_id: this.opts.clientId,
      client_secret: this.opts.clientSecret,
    });
    const res = await this.fetchImpl(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const text = await res.text();
    if (!res.ok) throw new KiotVietError(`KiotViet token request failed (${res.status})`, res.status, text);
    const json = JSON.parse(text) as { access_token?: string; expires_in?: number };
    if (!json.access_token)
      throw new KiotVietError('KiotViet token response has no access_token', res.status, '');
    this.lastTokenExpiresIn = json.expires_in;
    this.token = { value: json.access_token, expiresAt: this.now() + (json.expires_in ?? 3600) * 1000 };
    return json.access_token;
  }

  buildUrl(path: string, query: Query = {}): string {
    const url = new URL(this.apiBase + (path.startsWith('/') ? path : `/${path}`));
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v));
    return url.toString();
  }

  /** GET with rate limiting, one re-auth on 401, and backoff on 429/5xx/network errors. */
  async get<T>(path: string, query: Query = {}): Promise<T> {
    return this.request<T>('GET', path, query);
  }

  private async request<T>(method: string, path: string, query: Query, body?: unknown): Promise<T> {
    const url = this.buildUrl(path, query);
    let reauthed = false;
    for (let attempt = 0; ; attempt++) {
      await this.limiter.take();
      const token = await this.getToken();
      let res: Response;
      try {
        this.requestCount++;
        res = await this.fetchImpl(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Retailer: this.opts.retailer,
            Accept: 'application/json',
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch (err) {
        const delay = this.retryDelaysMs[attempt];
        if (delay === undefined) throw err;
        await this.sleep(delay);
        continue;
      }
      if (res.status === 401 && !reauthed) {
        reauthed = true;
        await this.getToken(true);
        attempt--;
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        const delay = this.retryAfterMs(res) ?? this.retryDelaysMs[attempt];
        if (delay !== undefined && attempt < this.retryDelaysMs.length) {
          await this.sleep(delay);
          continue;
        }
      }
      const text = await res.text();
      if (!res.ok)
        throw new KiotVietError(`KiotViet ${method} ${path} failed (${res.status})`, res.status, text);
      return (text ? JSON.parse(text) : undefined) as T;
    }
  }

  private retryAfterMs(res: Response): number | undefined {
    const h = res.headers.get('retry-after');
    if (!h) return undefined;
    const secs = Number(h);
    return Number.isFinite(secs) ? secs * 1000 : undefined;
  }

  /** Iterate all items of a paged list endpoint (pageSize max 100, offset via currentItem). */
  async *paginate<T>(path: string, query: Query = {}, pageSize = 100): AsyncGenerator<T> {
    let currentItem = 0;
    for (;;) {
      const page = await this.get<KiotVietPage<T>>(path, { ...query, pageSize, currentItem });
      const data = page.data ?? [];
      for (const item of data) yield item;
      currentItem += data.length;
      if (data.length < pageSize || (page.total !== undefined && currentItem >= page.total)) return;
    }
  }
}
