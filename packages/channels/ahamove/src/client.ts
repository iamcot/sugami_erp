/**
 * Ahamove Partner API v3 client (https://developers.ahamove.com).
 * Auth: an API key (emailed by Ahamove) + the shop's registered phone give a bearer token via
 * POST /accounts/token; a 401 means the token expired, so we ask for a new one once and retry.
 * The api_key and tokens are never put in error messages.
 */
import { RateLimiter } from '@sugami/channels-core';

export const AHAMOVE_BASES = {
  stg: 'https://partner-apistg.ahamove.com/v3',
  prod: 'https://partner-api.ahamove.com/v3',
} as const;

export interface AhamoveClientOptions {
  apiKey: string;
  /** Phone of the registered Ahamove account (the shop's). */
  mobile: string;
  env?: 'stg' | 'prod';
  apiBase?: string;
  fetch?: typeof fetch;
  requestsPerSecond?: number;
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export class AhamoveError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Ahamove error code such as ORDER_NOT_FOUND or INVALID_DELIVERY_AREA. */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'AhamoveError';
  }
}

export interface AhamoveStop {
  address: string;
  name: string;
  mobile: string;
  lat?: number;
  lng?: number;
  /** Shop's own order code; Ahamove echoes it back. */
  tracking_number?: string;
  remarks?: string;
  /** Cash the recipient pays the driver (drop-off only), VND. */
  cod?: number;
}

export interface AhamoveQuote {
  serviceId: string;
  /** Total fee in VND, discounts and VAT included. */
  fee: number;
  distanceKm: number | null;
  /** Driving time of the route in minutes (Ahamove's own figure). */
  durationMinutes: number | null;
  /** Fee lines as Ahamove itemises them (distance, surcharge, discount...). */
  breakdown: { name: string; value: number }[];
  /** Set when Ahamove refused this service (out of area, over COD limit...). */
  error?: string;
}

/** An extra a service can carry ("Gửi SMS cho người nhận", "Giao hàng tận tay", tip...). */
export interface AhamoveExtra {
  id: string;
  name: string;
  description: string | null;
  /** bool = on/off, tier = pick a level, unit = a count (tip). */
  kind: 'bool' | 'tier' | 'unit';
  /** VND (per unit for kind unit); a value below 1 is a share of the distance fee. */
  price: number;
  maxInput: number | null;
  tiers: { code: string; name: string; description: string | null; price: number }[];
}

/** What the seller chose for a trip. */
export interface AhamoveRequestChoice {
  id: string;
  tierCode?: string;
  num?: number;
}

const requestBody = (r: AhamoveRequestChoice) => ({
  _id: r.id,
  ...(r.tierCode ? { tier_code: r.tierCode } : {}),
  ...(r.num ? { num: r.num } : {}),
});

interface RawRequest {
  _id: string;
  enable?: boolean;
  type?: string;
  name_vi_vn?: string;
  name?: string;
  description_vi_vn?: string;
  description?: string;
  price?: number;
  max_input?: number;
  tier_list?: {
    code: string;
    name_vi_vn?: string;
    description_vi_vn?: string;
    price?: number;
    selectable?: boolean;
  }[];
}

/** Requests of a service a seller can switch on. Tolls, ferries, insurance and COD are priced by Ahamove itself. */
const SKIP_EXTRA = /(TOLL|FERRY|INSURANCE|COLLECT-COD|HI-COD)$/;
function extrasOf(list: RawRequest[] | undefined): AhamoveExtra[] {
  const out: AhamoveExtra[] = [];
  for (const r of list ?? []) {
    if (r.enable === false || SKIP_EXTRA.test(r._id)) continue;
    const kind =
      r.type === 'TIER'
        ? 'tier'
        : r.type === 'PER_UNIT'
          ? 'unit'
          : r.type === 'BOOLEAN' || r.type === 'COMMISSION_DISTANCE_PERCENTAGE'
            ? 'bool'
            : null;
    if (!kind) continue;
    out.push({
      id: r._id,
      name: (r.name_vi_vn ?? r.name ?? r._id).trim(),
      description: (r.description_vi_vn ?? r.description)?.trim() || null,
      kind,
      price: r.price ?? 0,
      maxInput: r.max_input ?? null,
      tiers: (r.tier_list ?? [])
        .filter((t) => t.selectable !== false && (t.price ?? 0) >= 0)
        .map((t) => ({
          code: t.code,
          name: t.name_vi_vn ?? t.code,
          description: t.description_vi_vn ?? null,
          price: t.price ?? 0,
        })),
    });
  }
  return out;
}

export interface AhamoveService {
  id: string;
  name: string;
  /** One line about the service ("Lấy hàng ngay, giao hỏa tốc"). */
  summary: string | null;
  /** Full terms: lead time, fee table, COD fee, size and weight limits. */
  details: string | null;
  maxCod: number | null;
  maxKg: number | null;
  extras: AhamoveExtra[];
}

export interface AhamoveOrder {
  _id?: string;
  status?: string;
  sub_status?: string;
  supplier_name?: string;
  cancel_comment?: string;
  total_pay?: number;
  total_price?: number;
  total_fee?: number;
  shared_link?: string;
  service_id?: string;
  order_time?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class AhamoveClient {
  private readonly fetchImpl: typeof fetch;
  private readonly base: string;
  private readonly retryDelaysMs: number[];
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly limiter: RateLimiter;
  private token: string | null = null;
  requestCount = 0;

  constructor(private readonly opts: AhamoveClientOptions) {
    if (!opts.apiKey || !opts.mobile) throw new Error('Ahamove apiKey and mobile are required');
    this.fetchImpl = opts.fetch ?? fetch;
    this.base = (opts.apiBase ?? AHAMOVE_BASES[opts.env ?? 'prod']).replace(/\/$/, '');
    this.retryDelaysMs = opts.retryDelaysMs ?? [1_000, 4_000];
    this.sleep = opts.sleep ?? defaultSleep;
    const rps = opts.requestsPerSecond ?? 3;
    this.limiter = new RateLimiter(rps * 3600, rps, opts.now ?? Date.now, this.sleep);
  }

  private async raw(method: string, path: string, body: unknown, bearer: string | null) {
    const label = `Ahamove ${method} ${path.split('?')[0]}`;
    for (let attempt = 0; ; attempt++) {
      await this.limiter.take();
      let res: Response;
      try {
        this.requestCount++;
        res = await this.fetchImpl(`${this.base}${path}`, {
          method,
          headers: {
            Accept: 'application/json',
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch {
        const delay = this.retryDelaysMs[attempt];
        if (delay === undefined || method !== 'GET') throw new AhamoveError(`${label} failed (network)`, 0);
        await this.sleep(delay);
        continue;
      }
      // Only reads are retried on 5xx: a repeated POST could book two drivers.
      if (
        (res.status === 429 || res.status >= 500) &&
        method === 'GET' &&
        attempt < this.retryDelaysMs.length
      ) {
        await this.sleep(this.retryDelaysMs[attempt]!);
        continue;
      }
      const text = await res.text();
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        throw new AhamoveError(`${label} returned non-JSON (${res.status})`, res.status);
      }
      return { status: res.status, ok: res.ok, json, label };
    }
  }

  private async authenticate(): Promise<string> {
    const r = await this.raw(
      'POST',
      '/accounts/token',
      { mobile: this.opts.mobile, api_key: this.opts.apiKey },
      null,
    );
    const token = (r.json as { token?: string }).token;
    if (!r.ok || !token) throw this.fail(r);
    this.token = token;
    return token;
  }

  private fail(r: { status: number; json: unknown; label: string }): AhamoveError {
    const j = r.json as { code?: string; title?: string; description?: string; message?: string };
    const code = typeof j.code === 'string' ? j.code : j.title;
    const msg = j.description ?? j.message ?? code ?? 'unknown error';
    return new AhamoveError(`${r.label} failed (${r.status}): ${msg}`, r.status, code);
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let token = this.token ?? (await this.authenticate());
    let r = await this.raw(method, path, body, token);
    if (r.status === 401) {
      token = await this.authenticate();
      r = await this.raw(method, path, body, token);
    }
    if (!r.ok) throw this.fail(r);
    return r.json as T;
  }

  /** Unparsed answer of any call, for the probe to show what Ahamove really returns (never used by the app). */
  async debugCall(method: string, path: string, body?: unknown): Promise<unknown> {
    return this.call<unknown>(method, path, body);
  }

  /** Services available in a city (id like `SGN-BIKE`) with their Vietnamese names. */
  async services(cityId: string): Promise<AhamoveService[]> {
    const list = await this.call<
      {
        _id: string;
        name?: string;
        name_vi_vn?: string;
        description_vi_vn?: string;
        fee_description_vi_vn?: string;
        max_cod?: number;
        requests?: RawRequest[];
      }[]
    >('GET', `/services?city_id=${encodeURIComponent(cityId)}&delivery_type=INSTANT`);
    return list.map((s) => {
      const details = s.fee_description_vi_vn?.trim() || null;
      const kg = details ? /Trọng lượng tiêu chuẩn:\s*(\d+)\s*kg/i.exec(details)?.[1] : undefined;
      return {
        id: s._id,
        name: s.name_vi_vn ?? s.name ?? s._id,
        // the Vietnamese text sometimes repeats itself: keep the first sentence
        summary: s.description_vi_vn?.split('. ')[0]?.trim() || null,
        details,
        maxCod: s.max_cod ?? null,
        maxKg: kg ? Number(kg) : null,
        extras: extrasOf(s.requests),
      };
    });
  }

  /** Price of each service for one pickup and one drop-off. Services Ahamove refuses come back with `error`. */
  async quote(
    pickup: AhamoveStop,
    dropoff: AhamoveStop,
    serviceIds: string[],
    /** Extras chosen, by service id (only the service the seller picked has any). */
    chosen: Record<string, AhamoveRequestChoice[]> = {},
  ): Promise<AhamoveQuote[]> {
    const res = await this.call<
      {
        service_id: string;
        data?: {
          total_price?: number;
          total_fee?: number;
          distance?: number;
          duration?: number;
          user_price_details?: { details?: { name?: string; value?: number }[] };
        };
        error?: unknown;
      }[]
    >('POST', '/orders/estimates', {
      order_time: 0,
      path: [pickup, dropoff],
      services: serviceIds.map((_id) => ({ _id, requests: (chosen[_id] ?? []).map(requestBody) })),
      payment_method: 'CASH',
    });
    return res.map((q) => ({
      serviceId: q.service_id,
      fee: Math.round(q.data?.total_price ?? q.data?.total_fee ?? 0),
      distanceKm: q.data?.distance ?? null,
      durationMinutes: q.data?.duration ? Math.round(q.data.duration / 60) : null,
      breakdown: (q.data?.user_price_details?.details ?? [])
        .filter((d) => d.name && typeof d.value === 'number')
        .map((d) => ({ name: d.name!, value: Math.round(d.value!) })),
      ...(q.data ? {} : { error: 'Không báo giá được' }),
    }));
  }

  /**
   * Book a driver. `payment`: CASH = the shop pays the driver in cash, BALANCE = from the Ahamove wallet.
   * Not retried: a second POST could book a second driver.
   */
  async createOrder(input: {
    serviceId: string;
    pickup: AhamoveStop;
    dropoff: AhamoveStop;
    payment: 'CASH' | 'BALANCE';
    note?: string;
    requests?: AhamoveRequestChoice[];
    /** Unix seconds for a booking made for later; omitted = find a driver now. */
    orderTime?: number;
  }): Promise<{ orderId: string; status: string; sharedLink: string | null; fee: number }> {
    const res = await this.call<{
      order_id: string;
      status?: string;
      shared_link?: string;
      order?: AhamoveOrder;
    }>('POST', '/orders', {
      order_time: input.orderTime ?? 0,
      path: [input.pickup, input.dropoff],
      service_id: input.serviceId,
      requests: (input.requests ?? []).map(requestBody),
      payment_method: input.payment,
      ...(input.note ? { remarks: input.note } : {}),
    });
    return {
      orderId: res.order_id,
      status: res.status ?? res.order?.status ?? 'ASSIGNING',
      sharedLink: res.shared_link ?? res.order?.shared_link ?? null,
      fee: Math.round(res.order?.total_price ?? res.order?.total_fee ?? 0),
    };
  }

  async getOrder(orderId: string): Promise<AhamoveOrder> {
    return this.call<AhamoveOrder>('GET', `/orders/${encodeURIComponent(orderId)}`);
  }

  async cancelOrder(orderId: string, comment: string): Promise<void> {
    await this.call('DELETE', `/orders/${encodeURIComponent(orderId)}`, { comment });
  }
}

/** Reads the credentials from the environment; null when Ahamove is not set up. */
export function ahamoveFromEnv(env: NodeJS.ProcessEnv = process.env): AhamoveClient | null {
  if (!env.AHAMOVE_API_KEY || !env.AHAMOVE_MOBILE) return null;
  return new AhamoveClient({
    apiKey: env.AHAMOVE_API_KEY,
    mobile: env.AHAMOVE_MOBILE,
    env: env.AHAMOVE_ENV === 'stg' ? 'stg' : 'prod',
  });
}
