import type { ChatConversation } from '@sugami/channels-pancake';
import { describe, expect, it } from 'vitest';
import { chatSummary, filterConversations } from './chat-filter.js';

const c = (over: Partial<ChatConversation>): ChatConversation => ({
  id: 'x',
  pageId: 'spo_1',
  channel: 'shopee',
  kind: 'INBOX',
  customerName: 'buyer',
  customerId: null,
  snippet: '',
  seen: true,
  lastSentByShop: true,
  messageCount: 0,
  tags: [],
  assigneeIds: [],
  updatedAt: new Date(0),
  createdAt: new Date(0),
  ...over,
});

const rows = [
  c({ id: 'a', snippet: 'Còn hàng không shop', seen: false, lastSentByShop: false }),
  c({ id: 'b', snippet: 'Đã gửi nhé', lastSentByShop: true }),
  c({ id: 'f', channel: 'facebook', pageId: '123', snippet: 'Hello', seen: true }),
  c({ id: 'r', kind: 'RATING', snippet: '[5⭐]', seen: false, lastSentByShop: false, customerName: 'Mimi' }),
];
const base = { channel: '', kind: '', unread: false, waiting: false, q: '' };

describe('filterConversations', () => {
  it('filters by channel', () => {
    expect(filterConversations(rows, { ...base, channel: 'facebook' }).map((r) => r.id)).toEqual(['f']);
  });
  it('filters by kind', () => {
    expect(filterConversations(rows, { ...base, kind: 'RATING' }).map((r) => r.id)).toEqual(['r']);
  });
  it('unread keeps unopened ones', () => {
    expect(filterConversations(rows, { ...base, unread: true }).map((r) => r.id)).toEqual(['a', 'r']);
  });
  it('waiting keeps only chats whose last message is the buyer', () => {
    expect(filterConversations(rows, { ...base, waiting: true }).map((r) => r.id)).toEqual(['a']);
  });
  it('searches without accents or case', () => {
    expect(filterConversations(rows, { ...base, q: 'CON HANG' }).map((r) => r.id)).toEqual(['a']);
    expect(filterConversations(rows, { ...base, q: 'mimi' }).map((r) => r.id)).toEqual(['r']);
  });
  it('summarises the whole range', () => {
    expect(chatSummary(rows)).toEqual({ total: 4, inbox: 3, rating: 1, unread: 2, waiting: 1 });
  });
});
