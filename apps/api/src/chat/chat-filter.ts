import type { ChatConversation } from '@sugami/channels-pancake';

/** A conversation as the chat page sees it: the live Pancake data plus what Sugami remembers about it. */
export type ChatItem = ChatConversation & {
  /** Waiting for the shop's answer and not checked ("đã kiểm tra") since the buyer's last message. */
  needsAttention: boolean;
  reviewedAt: Date | null;
};

export interface ChatFilter {
  /** shopee, tiktok, facebook...; empty = every channel. */
  channel: string;
  /** INBOX (chat), RATING (đánh giá), COMMENT; empty = all. */
  kind: string;
  /** Only conversations nobody on the shop's side has opened. */
  unread: boolean;
  /** Only chats that need attention: the buyer wrote last and nobody marked it checked. */
  waiting: boolean;
  /** Matches buyer name, snippet or tag, accent-insensitive. */
  q: string;
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

export function filterConversations(rows: ChatItem[], f: ChatFilter): ChatItem[] {
  const q = fold(f.q.trim());
  return rows.filter((c) => {
    if (f.channel && c.channel !== f.channel) return false;
    if (f.kind && c.kind !== f.kind) return false;
    if (f.unread && c.seen) return false;
    if (f.waiting && !c.needsAttention) return false;
    if (q && !fold(`${c.customerName} ${c.snippet} ${c.tags.join(' ')}`).includes(q)) return false;
    return true;
  });
}

/** Numbers for the filter chips, computed on the whole time range before the other filters. */
export function chatSummary(rows: ChatItem[]) {
  return {
    total: rows.length,
    inbox: rows.filter((c) => c.kind === 'INBOX').length,
    rating: rows.filter((c) => c.kind === 'RATING').length,
    unread: rows.filter((c) => !c.seen).length,
    waiting: rows.filter((c) => c.needsAttention).length,
  };
}
