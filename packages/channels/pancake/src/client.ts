/**
 * Pancake POS Open API client (https://pos.pancake.vn/developers/api/en).
 * Auth is an `api_key` query parameter, so URLs are never logged or put in error messages.
 * Pancake allows < 30 reads/s per endpoint and shop; we stay far below with a token bucket.
 */
import { RateLimiter } from '@sugami/channels-core';

export const PANCAKE_API_BASE = 'https://pos.pages.fm/api/v1';

export interface PancakeClientOptions {
  apiKey: string;
  shopId: string;
  fetch?: typeof fetch;
  apiBase?: string;
  /** Max requests per second (default 5). */
  requestsPerSecond?: number;
  /** Delays between retries for 429/5xx/network errors, in ms. */
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export class PancakeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errorCode?: number,
  ) {
    super(message);
    this.name = 'PancakeError';
  }
}

export interface PancakePage<T> {
  success?: boolean;
  data: T[];
  page_number?: number;
  page_size?: number;
  total_entries?: number;
  total_pages?: number;
}

export type Query = Record<string, string | number | boolean | string[] | undefined>;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class PancakeClient {
  private readonly fetchImpl: typeof fetch;
  private readonly apiBase: string;
  private readonly retryDelaysMs: number[];
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly limiter: RateLimiter;
  /** Number of HTTP requests sent. */
  requestCount = 0;

  constructor(private readonly opts: PancakeClientOptions) {
    if (!opts.apiKey || !opts.shopId) throw new Error('Pancake apiKey and shopId are required');
    this.fetchImpl = opts.fetch ?? fetch;
    this.apiBase = (opts.apiBase ?? PANCAKE_API_BASE).replace(/\/$/, '');
    this.retryDelaysMs = opts.retryDelaysMs ?? [1_000, 4_000, 15_000];
    this.sleep = opts.sleep ?? defaultSleep;
    const rps = opts.requestsPerSecond ?? 5;
    this.limiter = new RateLimiter(rps * 3600, rps, opts.now ?? Date.now, this.sleep);
  }

  /** Path relative to /shops/{shopId}, e.g. `/orders`. */
  buildUrl(path: string, query: Query = {}): string {
    const url = new URL(`${this.apiBase}/shops/${encodeURIComponent(this.opts.shopId)}${path.startsWith('/') ? path : `/${path}`}`);
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) for (const item of v) url.searchParams.append(`${k}[]`, item);
      else url.searchParams.set(k, String(v));
    }
    url.searchParams.set('api_key', this.opts.apiKey);
    return url.toString();
  }

  async get<T>(path: string, query: Query = {}): Promise<T> {
    return this.request<T>('GET', path, query);
  }

  private async request<T>(method: string, path: string, query: Query, body?: unknown): Promise<T> {
    const url = this.buildUrl(path, query);
    const label = `Pancake ${method} ${path}`;
    for (let attempt = 0; ; attempt++) {
      await this.limiter.take();
      let res: Response;
      try {
        this.requestCount++;
        res = await this.fetchImpl(url, {
          method,
          headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch {
        const delay = this.retryDelaysMs[attempt];
        // Don't rethrow the fetch error itself: its message can include the URL (and the key).
        if (delay === undefined) throw new PancakeError(`${label} failed (network)`, 0);
        await this.sleep(delay);
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < this.retryDelaysMs.length) {
        await this.sleep(this.retryDelaysMs[attempt]!);
        continue;
      }
      const text = await res.text();
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : undefined;
      } catch {
        throw new PancakeError(`${label} returned non-JSON (${res.status})`, res.status);
      }
      const env = json as { success?: boolean; message?: string; error_code?: number } | undefined;
      if (!res.ok || env?.success === false) {
        throw new PancakeError(`${label} failed (${res.status}): ${env?.message ?? 'unknown error'}`, res.status, env?.error_code);
      }
      return json as T;
    }
  }

  /** Iterate every item of a paged list (page_number/page_size). */
  async *paginate<T>(path: string, query: Query = {}, pageSize = 100): AsyncGenerator<T> {
    for (let page = 1; ; page++) {
      const res = await this.get<PancakePage<T>>(path, { ...query, page_size: pageSize, page_number: page });
      const data = res.data ?? [];
      for (const item of data) yield item;
      const lastPage = res.total_pages !== undefined ? page >= res.total_pages : data.length < pageSize;
      if (lastPage || data.length === 0) return;
    }
  }
}
