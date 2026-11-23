import { describe, expect, it } from 'vitest';
import { chatPagesFromEnv, pageChannel, pageOfConversation } from './chat-pages.js';

describe('chatPagesFromEnv', () => {
  it('reads several pages and the single-page variables', () => {
    const pages = chatPagesFromEnv({
      PANCAKE_CHAT_PAGES: 'spo_1=tokA; 123=tokB',
      PANCAKE_CHAT_PAGE_ID: 'tt_9',
      PANCAKE_CHAT_TOKEN: 'tokC',
    });
    expect(pages).toEqual([
      { pageId: 'spo_1', token: 'tokA' },
      { pageId: '123', token: 'tokB' },
      { pageId: 'tt_9', token: 'tokC' },
    ]);
  });
  it('uses a page id once and ignores broken entries', () => {
    expect(
      chatPagesFromEnv({ PANCAKE_CHAT_PAGES: 'spo_1=a;junk;=x;spo_2=', PANCAKE_CHAT_PAGE_ID: 'spo_1', PANCAKE_CHAT_TOKEN: 'b' }),
    ).toEqual([{ pageId: 'spo_1', token: 'a' }]);
    expect(chatPagesFromEnv({})).toEqual([]);
  });
});

describe('explicit channel', () => {
  it('reads channel:pageId and falls back to the id prefix', () => {
    const pages = chatPagesFromEnv({ PANCAKE_CHAT_PAGES: 'facebook:sugami.vn=tokB;spo_1=tokA;zz:odd=tokC' });
    expect(pages).toEqual([
      { pageId: 'sugami.vn', token: 'tokB', channel: 'facebook' },
      { pageId: 'spo_1', token: 'tokA' },
      { pageId: 'zz:odd', token: 'tokC' },
    ]);
    expect(pageChannel(pages[0]!)).toBe('facebook');
    expect(pageChannel(pages[1]!)).toBe('shopee');
  });
});

describe('pageOfConversation', () => {
  const pages = [
    { pageId: 'spo_1', token: 'a' },
    { pageId: 'spo_12', token: 'b' },
  ];
  it('matches the page prefix, longest first', () => {
    expect(pageOfConversation(pages, 'spo_12_555')?.token).toBe('b');
    expect(pageOfConversation(pages, 'spo_1_555')?.token).toBe('a');
    expect(pageOfConversation(pages, 'other_1')).toBeNull();
  });
});
