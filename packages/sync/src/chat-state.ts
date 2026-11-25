import type { PrismaClient } from '@sugami/db';

/** What the planner needs to know about a conversation read from Pancake (structurally a ChatConversation). */
export interface ChatRow {
  id: string;
  pageId: string;
  channel: string;
  kind: string;
  customerName: string;
  snippet: string;
  updatedAt: Date;
  /** true = last message from the shop, false = from the buyer, null = unknown. */
  lastSentByShop: boolean | null;
}

export interface ChatState {
  lastMessageAt: Date;
  lastFromBuyer: boolean;
  notifiedAt: Date | null;
}

export interface ChatUpsert {
  id: string;
  pageId: string;
  channel: string;
  customerName: string;
  snippet: string;
  lastMessageAt: Date;
  lastFromBuyer: boolean;
  notifiedAt: Date | null;
}

/** A buyer message older than this is catch-up after downtime, not news: remembered, never announced. */
export const CHAT_FRESH_MS = 6 * 3600 * 1000;
/** How far back the background job looks, and what the menu number counts. */
export const CHAT_LOOKBACK_DAYS = 7;

/** Waiting for the shop's answer and not checked since the buyer's last message. */
export function needsAttention(s: {
  kind?: string;
  lastFromBuyer: boolean;
  lastMessageAt: Date;
  reviewedAt: Date | null;
}): boolean {
  if (s.kind && s.kind !== 'INBOX') return false;
  return s.lastFromBuyer && !(s.reviewedAt && s.reviewedAt.getTime() >= s.lastMessageAt.getTime());
}

/**
 * Compare a fresh read of the inbox with what was stored: which rows to write, and which buyer messages are
 * new and worth announcing. Only chats (not ratings) count. The very first read announces nothing, so
 * switching the feature on does not flood the phone with old chats.
 */
export function planChatUpdate(
  existing: Map<string, ChatState>,
  rows: ChatRow[],
  now = Date.now(),
): { upserts: ChatUpsert[]; announce: ChatRow[] } {
  const firstRun = existing.size === 0;
  const upserts: ChatUpsert[] = [];
  const announce: ChatRow[] = [];
  for (const r of rows) {
    if (r.kind !== 'INBOX') continue;
    const prev = existing.get(r.id);
    const fromBuyer = r.lastSentByShop === false;
    let notifiedAt = prev?.notifiedAt ?? null;
    if (fromBuyer) {
      const already = notifiedAt !== null && notifiedAt.getTime() >= r.updatedAt.getTime();
      const fresh = now - r.updatedAt.getTime() < CHAT_FRESH_MS;
      if (!already && !firstRun && fresh) announce.push(r);
      if (!already) notifiedAt = r.updatedAt;
    }
    const unchanged =
      prev &&
      prev.lastMessageAt.getTime() === r.updatedAt.getTime() &&
      prev.lastFromBuyer === fromBuyer &&
      (prev.notifiedAt?.getTime() ?? null) === (notifiedAt?.getTime() ?? null);
    if (unchanged) continue;
    upserts.push({
      id: r.id,
      pageId: r.pageId,
      channel: r.channel,
      customerName: r.customerName.slice(0, 191),
      snippet: r.snippet.slice(0, 500),
      lastMessageAt: r.updatedAt,
      lastFromBuyer: fromBuyer,
      notifiedAt,
    });
  }
  return { upserts, announce };
}

/** Read stored state for these conversations, apply the plan, and return what to announce. */
export async function applyChatRead(
  db: PrismaClient,
  rows: ChatRow[],
  now = Date.now(),
): Promise<{ announce: ChatRow[]; written: number }> {
  const stored = await db.chatConversation.findMany({
    select: { id: true, lastMessageAt: true, lastFromBuyer: true, notifiedAt: true },
  });
  const existing = new Map<string, ChatState>(stored.map((s) => [s.id, s]));
  const { upserts, announce } = planChatUpdate(existing, rows, now);
  for (const u of upserts) {
    const { id, ...data } = u;
    await db.chatConversation.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
  // two months of history is plenty
  await db.chatConversation
    .deleteMany({ where: { lastMessageAt: { lt: new Date(now - 60 * 86_400_000) } } })
    .catch(() => undefined);
  return { announce, written: upserts.length };
}
