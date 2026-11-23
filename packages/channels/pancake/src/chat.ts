/**
 * Pancake Pages API client for the chat inbox (https://docs.pancake.vn/english/developers/api-reference).
 * Separate from the POS client: other host (`pages.fm`), other credential (a page access token made in
 * Pancake → Settings → Tool for the Shopee page), and it only reads. The token goes in the query string,
 * so URLs are never logged or put in error messages.
 */
import { RateLimiter } from '@sugami/channels-core';
import { PancakeError } from './client.js';

export const PANCAKE_CHAT_API_BASE = 'https://pages.fm/api/public_api/v1';

/** Pancake accepts at most one month between `since` and `until`. */
export const CHAT_MAX_RANGE_DAYS = 30;

export type ChatKind = 'INBOX' | 'COMMENT' | 'RATING';

/** Which marketplace or social channel a Pancake page belongs to, from its page id prefix. */
export type ChatChannel = 'shopee' | 'tiktok' | 'facebook' | 'whatsapp' | 'other';

export function chatChannelOf(pageId: string): ChatChannel {
  if (pageId.startsWith('spo_')) return 'shopee';
  if (pageId.startsWith('wa_')) return 'whatsapp';
  if (/^tt/i.test(pageId)) return 'tiktok';
  if (/^\d+$/.test(pageId)) return 'facebook';
  return 'other';
}

export interface ChatConversation {
  id: string;
  /** Pancake page this conversation belongs to, and its channel. */
  pageId: string;
  channel: ChatChannel;
  kind: ChatKind | string;
  /** Marketplace user name (Shopee username). */
  customerName: string;
  customerId: string | null;
  snippet: string;
  /** Anyone on the shop's side has opened it. */
  seen: boolean;
  /** Last message came from the shop (so the buyer may be waiting for nothing) or from the buyer. */
  lastSentByShop: boolean | null;
  messageCount: number;
  tags: string[];
  assigneeIds: string[];
  updatedAt: Date;
  createdAt: Date;
}

export interface ChatMessage {
  id: string;
  at: Date;
  fromShop: boolean;
  text: string;
  /** Attachment kinds, e.g. image, shopee_faq_messages. */
  attachments: string[];
}

export interface PancakeChatClientOptions {
  pageId: string;
  pageAccessToken: string;
  fetch?: typeof fetch;
  apiBase?: string;
  /** Max requests per second (default 2: the docs give no limit, so stay low). */
  requestsPerSecond?: number;
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** Pancake sends UTC timestamps without a zone ("2026-11-22T03:47:04.000000"). */
export function parseChatTime(s: unknown): Date {
  const text = str(s);
  if (!text) return new Date(0);
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text}Z`);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

type Raw = Record<string, unknown>;

export function toConversation(raw: Raw, pageId: string): ChatConversation {
  const from = (raw.from ?? {}) as Raw;
  const tags = Array.isArray(raw.tags) ? raw.tags : [];
  const assignees = Array.isArray(raw.assignee_ids) ? raw.assignee_ids : [];
  const lastSentBy = raw.last_sent_by as Raw | null | undefined;
  return {
    id: str(raw.id),
    pageId,
    channel: chatChannelOf(pageId),
    kind: str(raw.type) || 'INBOX',
    customerName: str(from.name) || str(from.username),
    customerId: from.id ? str(from.id) : null,
    snippet: str(raw.snippet),
    seen: raw.seen === true,
    lastSentByShop: lastSentBy && typeof lastSentBy === 'object' ? str(lastSentBy.id) === pageId : null,
    messageCount: Number(raw.message_count ?? 0) || 0,
    tags: tags.map((t) => str(typeof t === 'object' && t ? ((t as Raw).text ?? (t as Raw).id) : t)).filter(Boolean),
    assigneeIds: assignees.map(str),
    updatedAt: parseChatTime(raw.updated_at),
    createdAt: parseChatTime(raw.inserted_at),
  };
}

/** Message bodies come as small HTML ("<div>…</div>"); keep only the text. */
export function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function toMessage(raw: Raw, pageId: string): ChatMessage {
  const from = (raw.from ?? {}) as Raw;
  const attachments = Array.isArray(raw.attachments) ? raw.attachments : [];
  return {
    id: str(raw.id),
    at: parseChatTime(raw.inserted_at),
    fromShop: str(from.id) === pageId,
    text: plainText(str(raw.original_message ?? raw.message)),
    attachments: attachments.map((a) => str((a as Raw)?.type)).filter(Boolean),
  };
}

export class PancakeChatClient {
  private readonly fetchImpl: typeof fetch;
  private readonly apiBase: string;
  private readonly retryDelaysMs: number[];
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly limiter: RateLimiter;
  requestCount = 0;

  constructor(private readonly opts: PancakeChatClientOptions) {
    if (!opts.pageId || !opts.pageAccessToken) throw new Error('Pancake chat pageId and token are required');
    this.fetchImpl = opts.fetch ?? fetch;
    this.apiBase = (opts.apiBase ?? PANCAKE_CHAT_API_BASE).replace(/\/$/, '');
    this.retryDelaysMs = opts.retryDelaysMs ?? [1_000, 4_000];
    this.sleep = opts.sleep ?? defaultSleep;
    const rps = opts.requestsPerSecond ?? 2;
    this.limiter = new RateLimiter(rps * 600, rps, opts.now ?? Date.now, this.sleep);
  }

  get pageId() {
    return this.opts.pageId;
  }

  buildUrl(path: string, query: Record<string, string | number | undefined> = {}): string {
    const url = new URL(`${this.apiBase}/pages/${encodeURIComponent(this.opts.pageId)}${path}`);
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v));
    url.searchParams.set('page_access_token', this.opts.pageAccessToken);
    return url.toString();
  }

  private async get<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
    return this.request<T>('GET', path, query);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    query: Record<string, string | number | undefined> = {},
    body?: unknown,
  ): Promise<T> {
    const url = this.buildUrl(path, query);
    const label = `Pancake chat ${method} ${path}`;
    for (let attempt = 0; ; attempt++) {
      await this.limiter.take();
      let res: Response;
      try {
        this.requestCount++;
        res = await this.fetchImpl(url, {
          method,
          headers: {
            Accept: 'application/json',
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch {
        const delay = method === 'GET' ? this.retryDelaysMs[attempt] : undefined;
        if (delay === undefined) throw new PancakeError(`${label} failed (network)`, 0);
        await this.sleep(delay);
        continue;
      }
      // A POST is never retried after the server may have received it: the buyer could get the text twice.
      if (method === 'GET' && (res.status === 429 || res.status >= 500) && attempt < this.retryDelaysMs.length) {
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
      if (!res.ok || env?.success === false)
        throw new PancakeError(
          `${label} failed (${res.status}): ${env?.message ?? 'unknown error'}`,
          res.status,
          env?.error_code,
        );
      return json as T;
    }
  }

  /**
   * Conversations updated inside [since, until] (at most one month), newest first. Pancake pages the
   * list by `page_number` with no page size, so this reads pages until one comes back empty or
   * `maxPages` is reached.
   */
  async listConversations(opts: { since: Date; until: Date; maxPages?: number }): Promise<ChatConversation[]> {
    const since = Math.floor(opts.since.getTime() / 1000);
    const until = Math.floor(opts.until.getTime() / 1000);
    const out = new Map<string, ChatConversation>();
    for (let page = 1; page <= (opts.maxPages ?? 10); page++) {
      const res = await this.get<{ conversations?: Raw[] }>('/conversations', {
        page_id: this.opts.pageId,
        since,
        until,
        page_number: page,
        order_by: 'updated_at',
      });
      const rows = res.conversations ?? [];
      const before = out.size;
      for (const r of rows) {
        const c = toConversation(r, this.opts.pageId);
        if (c.id) out.set(c.id, c);
      }
      // An empty page, or one with nothing new (Pancake repeats the last page), ends the walk.
      if (!rows.length || out.size === before) break;
    }
    return [...out.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  /** Messages of one conversation, oldest first. `currentCount` skips that many of the newest messages. */
  async listMessages(conversationId: string, currentCount?: number): Promise<ChatMessage[]> {
    const res = await this.get<{ messages?: Raw[] }>(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
      current_count: currentCount,
    });
    return (res.messages ?? [])
      .map((m) => toMessage(m, this.opts.pageId))
      .sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  /**
   * Send a text message to the buyer of an INBOX conversation. This reaches a real person and cannot be
   * taken back, and it is not retried. Returns Pancake's id of the new message when it gives one.
   */
  async sendMessage(conversationId: string, text: string): Promise<{ id: string | null }> {
    const res = await this.request<{ id?: unknown }>(
      'POST',
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      {},
      { action: 'reply_inbox', message: text },
    );
    return { id: res.id ? str(res.id) : null };
  }
}
