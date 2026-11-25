import type { ChatConversation } from '@sugami/channels-pancake';
import { describe, expect, it } from 'vitest';
import { activitiesFromChats, chatSyncEnabled } from './chat.js';

const conv = (n: number): ChatConversation =>
  ({
    id: `spo_1_${n}`,
    channel: 'shopee',
    customerName: `buyer${n}`,
    snippet: 'Còn hàng không',
  }) as ChatConversation;

describe('activitiesFromChats', () => {
  it('one push per chat, linking to the chat', () => {
    const items = activitiesFromChats([conv(1)]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'chat_new',
      title: 'Tin nhắn mới Shopee',
      body: 'buyer1: Còn hàng không',
      url: '/chat?c=spo_1_1',
      push: true,
    });
  });
  it('a burst becomes one push, while each chat stays in the bell', () => {
    const items = activitiesFromChats([1, 2, 3, 4].map(conv));
    expect(items.filter((i) => i.push)).toHaveLength(1);
    expect(items.find((i) => i.push)!.title).toBe('4 tin nhắn mới');
    expect(items.filter((i) => i.tag !== 'chat-burst')).toHaveLength(4);
  });
});

describe('chatSyncEnabled', () => {
  it('needs a chat page and can be switched off', () => {
    expect(chatSyncEnabled({})).toBe(false);
    expect(chatSyncEnabled({ PANCAKE_CHAT_PAGES: 'spo_1=tok' })).toBe(true);
    expect(chatSyncEnabled({ PANCAKE_CHAT_PAGES: 'spo_1=tok', PANCAKE_CHAT_SYNC: 'off' })).toBe(false);
  });
});
