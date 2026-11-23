export interface ChatPageConfig {
  pageId: string;
  token: string;
}

/**
 * Chat pages to read, from `.env`:
 *   PANCAKE_CHAT_PAGES=spo_6875667=<token>;<facebook page id>=<token>   (one `pageId=token` per page)
 * or, for a single page, PANCAKE_CHAT_PAGE_ID + PANCAKE_CHAT_TOKEN. Both can be set; a page id is used once.
 */
export function chatPagesFromEnv(env: Record<string, string | undefined>): ChatPageConfig[] {
  const out = new Map<string, ChatPageConfig>();
  for (const part of (env.PANCAKE_CHAT_PAGES ?? '').split(/[;\n]/)) {
    const i = part.indexOf('=');
    const pageId = part.slice(0, i).trim();
    const token = part.slice(i + 1).trim();
    if (i > 0 && pageId && token) out.set(pageId, { pageId, token });
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
