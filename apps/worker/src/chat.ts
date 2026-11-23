import { chatPagesFromEnv, PancakeChatClient, type ChatConversation } from '@sugami/channels-pancake';
import type { PrismaClient } from '@sugami/db';
import { applyChatRead, CHAT_LOOKBACK_DAYS } from '@sugami/sync';
import { type Activity, recordActivity, reportError } from './activity.js';

const CHANNEL_NAME: Record<string, string> = {
  shopee: 'Shopee',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
};
/** More than this many new chats in one pass become a single push (every one still gets a bell line). */
const PUSH_BURST = 3;

export function chatSyncEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return chatPagesFromEnv(env).length > 0 && env.PANCAKE_CHAT_SYNC !== 'off';
}

/** The bell line and push for chats the buyer wrote in since the last pass. */
export function activitiesFromChats(announce: ChatConversation[]): Activity[] {
  const burst = announce.length > PUSH_BURST;
  const items: Activity[] = announce.map((c) => ({
    kind: 'chat_new',
    title: `Tin nhắn mới ${CHANNEL_NAME[c.channel] ?? c.channel}`,
    body: `${c.customerName || 'Khách'}: ${c.snippet || '(không có nội dung)'}`.slice(0, 200),
    url: `/chat?c=${encodeURIComponent(c.id)}`,
    tag: `chat-${c.id}`,
    push: !burst,
  }));
  if (burst)
    items.push({
      kind: 'chat_new',
      title: `${announce.length} tin nhắn mới`,
      body: 'Xem danh sách chat',
      url: '/chat',
      tag: 'chat-burst',
      push: true,
    });
  return items;
}

/** One pass: read every chat page, remember who waits for an answer, announce new buyer messages. */
export async function chatPass(db: PrismaClient, log: (msg: string) => void = console.log) {
  const pages = chatPagesFromEnv(process.env);
  const until = new Date();
  const since = new Date(until.getTime() - CHAT_LOOKBACK_DAYS * 86_400_000);
  const announce: ChatConversation[] = [];
  const failures: string[] = [];
  for (const page of pages) {
    try {
      const rows = await new PancakeChatClient({ pageId: page.pageId, pageAccessToken: page.token }).listConversations({
        since,
        until,
      });
      // pages are applied one by one so one broken page never blocks the others
      const r = await applyChatRead(db, rows);
      announce.push(...(r.announce as ChatConversation[]));
    } catch (e) {
      failures.push(`${page.pageId}: ${(e as Error).message}`);
    }
  }
  if (announce.length) await recordActivity(db, activitiesFromChats(announce), log);
  if (failures.length) {
    await reportError(db, 'Không đọc được chat Pancake', failures.slice(0, 3).join('; '), log);
    if (failures.length === pages.length) throw new Error(failures[0]);
  }
  return { announced: announce.length, failures: failures.length };
}
