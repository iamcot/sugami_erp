import { type ChatChannel, chatChannelOf } from './chat.js';

export interface ChatPageConfig {
  pageId: string;
  token: string;
  /** Set when the page id alone does not tell the channel (e.g. a Facebook page whose id is `sugami.vn`). */
  channel?: ChatChannel;
}

const CHANNELS = ['shopee', 'tiktok', 'facebook', 'whatsapp'] as const;

/** The channel of a configured page: stated in the config, else guessed from the page id. */
export const pageChannel = (page: ChatPageConfig): ChatChannel => page.channel ?? chatChannelOf(page.pageId);

/**
 * Chat pages to read, from `.env`:
 *   PANCAKE_CHAT_PAGES=spo_6875667=<token>;facebook:sugami.vn=<token>   (one `pageId=token` per page)
 * A page id that does not show its channel is written `channel:pageId` (shopee, tiktok, facebook, whatsapp).
 * or, for a single page, PANCAKE_CHAT_PAGE_ID + PANCAKE_CHAT_TOKEN. Both can be set; a page id is used once.
 */
export function chatPagesFromEnv(env: Record<string, string | undefined>): ChatPageConfig[] {
  const out = new Map<string, ChatPageConfig>();
  for (const part of (env.PANCAKE_CHAT_PAGES ?? '').split(/[;\n]/)) {
    const i = part.indexOf('=');
    let pageId = part.slice(0, i).trim();
    const token = part.slice(i + 1).trim();
    let channel: ChatChannel | undefined;
    const tagged = /^([a-z]+):(.+)$/.exec(pageId);
    if (tagged && (CHANNELS as readonly string[]).includes(tagged[1]!)) {
      channel = tagged[1] as ChatChannel;
      pageId = tagged[2]!.trim();
    }
    if (i > 0 && pageId && token) out.set(pageId, { pageId, token, ...(channel ? { channel } : {}) });
  }
  if (env.PANCAKE_CHAT_PAGE_ID && env.PANCAKE_CHAT_TOKEN && !out.has(env.PANCAKE_CHAT_PAGE_ID.trim()))
    out.set(env.PANCAKE_CHAT_PAGE_ID.trim(), {
      pageId: env.PANCAKE_CHAT_PAGE_ID.trim(),
      token: env.PANCAKE_CHAT_TOKEN.trim(),
    });
  return [...out.values()];
}

/** Conversation ids start with their page id (`spo_6875667_29536…`): pick the longest page that matches. */
export function pageOfConversation(pages: ChatPageConfig[], conversationId: string): ChatPageConfig | null {
  return (
    pages
      .filter((p) => conversationId.startsWith(`${p.pageId}_`))
      .sort((a, b) => b.pageId.length - a.pageId.length)[0] ?? null
  );
}
