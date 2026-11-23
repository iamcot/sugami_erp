import type { ChatConversation } from '@sugami/channels-pancake';
import { describe, expect, it } from 'vitest';
import { chatSummary, filterConversations } from './chat-filter.js';

const c = (over: Partial<ChatConversation>): ChatConversation => ({
  id: 'x',
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
  c({ id: 'r', kind: 'RATING', snippet: '[5⭐]', seen: false, lastSentByShop: false, customerName: 'Mimi' }),
];
const base = { kind: '', unread: false, waiting: false, q: '' };

describe('filterConversations', () => {
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
    expect(chatSummary(rows)).toEqual({ total: 3, inbox: 2, rating: 1, unread: 2, waiting: 1 });
  });
});
