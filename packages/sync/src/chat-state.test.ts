import { describe, expect, it } from 'vitest';
import { type ChatRow, type ChatState, needsAttention, planChatUpdate } from './chat-state.js';

const NOW = Date.parse('2026-11-23T08:00:00Z');
const row = (over: Partial<ChatRow> = {}): ChatRow => ({
  id: 'spo_1_1',
  pageId: 'spo_1',
  channel: 'shopee',
  kind: 'INBOX',
  customerName: 'buyer_a',
  snippet: 'Còn hàng không',
  updatedAt: new Date('2026-11-23T07:50:00Z'),
  lastSentByShop: false,
  ...over,
});
const state = (over: Partial<ChatState> = {}): ChatState => ({
  lastMessageAt: new Date('2026-11-23T07:00:00Z'),
  lastFromBuyer: false,
  notifiedAt: null,
  ...over,
});
const known = new Map([['other', state()]]); // not the first run

describe('planChatUpdate', () => {
  it('announces a new buyer message once', () => {
    const first = planChatUpdate(known, [row()], NOW);
    expect(first.announce.map((r) => r.id)).toEqual(['spo_1_1']);
    expect(first.upserts[0]).toMatchObject({
      lastFromBuyer: true,
      notifiedAt: new Date('2026-11-23T07:50:00Z'),
    });
    const stored = new Map([
      [
        'spo_1_1',
        state({ lastMessageAt: row().updatedAt, lastFromBuyer: true, notifiedAt: row().updatedAt }),
      ],
    ]);
    const again = planChatUpdate(stored, [row()], NOW);
    expect(again.announce).toEqual([]);
    expect(again.upserts).toEqual([]);
  });

  it('announces again when the buyer writes again', () => {
    const stored = new Map([
      [
        'spo_1_1',
        state({ lastMessageAt: row().updatedAt, lastFromBuyer: true, notifiedAt: row().updatedAt }),
      ],
    ]);
    const later = row({ updatedAt: new Date('2026-11-23T07:55:00Z') });
    expect(planChatUpdate(stored, [later], NOW).announce).toHaveLength(1);
  });

  it('says nothing for the shop own messages, ratings, old chats and the very first read', () => {
    expect(planChatUpdate(known, [row({ lastSentByShop: true })], NOW).announce).toEqual([]);
    expect(planChatUpdate(known, [row({ kind: 'RATING' })], NOW).upserts).toEqual([]);
    expect(
      planChatUpdate(known, [row({ updatedAt: new Date('2026-11-22T00:00:00Z') })], NOW).announce,
    ).toEqual([]);
    const firstRun = planChatUpdate(new Map(), [row()], NOW);
    expect(firstRun.announce).toEqual([]);
    expect(firstRun.upserts[0]!.notifiedAt).toEqual(row().updatedAt);
  });

  it('records that the shop answered', () => {
    const stored = new Map([
      [
        'spo_1_1',
        state({ lastMessageAt: row().updatedAt, lastFromBuyer: true, notifiedAt: row().updatedAt }),
      ],
    ]);
    const plan = planChatUpdate(
      stored,
      [row({ lastSentByShop: true, updatedAt: new Date('2026-11-23T07:59:00Z') })],
      NOW,
    );
    expect(plan.upserts[0]).toMatchObject({ lastFromBuyer: false });
  });
});

describe('needsAttention', () => {
  const base = { lastFromBuyer: true, lastMessageAt: new Date('2026-11-23T07:00:00Z'), reviewedAt: null };
  it('is on until reviewed, and back on when the buyer writes again', () => {
    expect(needsAttention(base)).toBe(true);
    expect(needsAttention({ ...base, reviewedAt: new Date('2026-11-23T07:30:00Z') })).toBe(false);
    expect(
      needsAttention({
        ...base,
        lastMessageAt: new Date('2026-11-23T08:00:00Z'),
        reviewedAt: new Date('2026-11-23T07:30:00Z'),
      }),
    ).toBe(true);
    expect(needsAttention({ ...base, lastFromBuyer: false })).toBe(false);
    expect(needsAttention({ ...base, kind: 'RATING' })).toBe(false);
  });
});
