import { describe, expect, it, vi } from 'vitest';
import {
  chatChannelOf,
  PancakeChatClient,
  parseChatTime,
  plainText,
  toAttachment,
  toConversation,
  toMessage,
} from './chat.js';
import { PancakeError } from './client.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Synthetic samples in the documented shape; no real shop or customer data.
const conv = (over: Record<string, unknown> = {}) => ({
  id: 'spo_1_100',
  type: 'INBOX',
  seen: false,
  from: { id: 'sp_9', name: 'buyer_a', username: 'buyer_a' },
  last_sent_by: { id: 'sp_9', name: 'buyer_a' },
  snippet: 'Còn hàng không shop',
  message_count: 0,
  tags: [null, { id: 3, text: 'Hỏi hàng' }],
  assignee_ids: [],
  inserted_at: '2026-11-22T03:00:00.000000',
  updated_at: '2026-11-22T03:47:04.000000',
  ...over,
});

function makeClient(handler: (url: URL) => Response) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => handler(new URL(String(input))));
  const client = new PancakeChatClient({
    pageId: 'spo_1',
    pageAccessToken: 'secret-token',
    fetch: fetchMock as unknown as typeof fetch,
    sleep: async () => {},
    retryDelaysMs: [1],
  });
  return { client, fetchMock };
}

describe('chat mapping', () => {
  it('tells the channel from the page id', () => {
    expect(chatChannelOf('spo_6875667')).toBe('shopee');
    expect(chatChannelOf('256469571178082')).toBe('facebook');
    expect(chatChannelOf('wa_84328290781')).toBe('whatsapp');
    expect(chatChannelOf('tts_7494949569066076732')).toBe('tiktok');
    expect(chatChannelOf('zl_1')).toBe('other');
  });

  it('reads Pancake times as UTC', () => {
    expect(parseChatTime('2026-11-22T03:47:04.000000').toISOString()).toBe('2026-11-22T03:47:04.000Z');
    expect(parseChatTime(undefined).getTime()).toBe(0);
  });

  it('strips message HTML', () => {
    expect(plainText('<div>Chào &amp; cảm ơn<br>shop</div>')).toBe('Chào & cảm ơn\nshop');
    expect(plainText('<div></div>')).toBe('');
  });

  it('maps a conversation and drops empty tags', () => {
    const c = toConversation(conv(), 'spo_1');
    expect(c).toMatchObject({
      id: 'spo_1_100',
      kind: 'INBOX',
      customerName: 'buyer_a',
      buyerUsername: 'buyer_a',
      seen: false,
      lastSentByShop: false,
      tags: ['Hỏi hàng'],
    });
    expect(toConversation(conv({ last_sent_by: { id: 'spo_1' } }), 'spo_1').lastSentByShop).toBe(true);
  });

  it('marks messages sent by the shop page', () => {
    const m = toMessage(
      {
        id: 'm1',
        inserted_at: '2026-11-22T03:47:00.000000',
        from: { id: 'spo_1' },
        original_message: 'Dạ ạ',
        attachments: [{ type: 'image' }],
      },
      'spo_1',
    );
    expect(m).toMatchObject({ fromShop: true, text: 'Dạ ạ' });
    expect(m.attachments).toEqual([]); // an image with no URL has nothing to show
  });
});

describe('toAttachment', () => {
  it('keeps photos with their size and only https links', () => {
    expect(
      toAttachment({
        type: 'photo',
        url: 'https://content.example.vn/a.jpg',
        image_data: { width: 640, height: 480 },
      }),
    ).toEqual({
      kind: 'image',
      url: 'https://content.example.vn/a.jpg',
      width: 640,
      height: 480,
    });
    expect(toAttachment({ type: 'photo', url: 'http://insecure.example/a.jpg' })).toBeNull();
    expect(toAttachment({ type: 'photo', url: 'javascript:alert(1)' })).toBeNull();
    expect(toAttachment({ type: 'sticker', url: 'https://cdn.example/s.png' })).toMatchObject({
      kind: 'image',
    });
  });
  it('turns system lines and cards into notes', () => {
    expect(toAttachment({ type: 'shopee_faq_messages' })).toEqual({
      kind: 'note',
      text: 'Tin tự động của Shopee',
    });
    expect(
      toAttachment({
        type: 'system_message',
        message: 'Bạn đã yêu cầu thanh toán 159.000 ₫. Xem chi tiết(fb-pma://payments/x?id=1)',
      }),
    ).toEqual({ kind: 'note', text: 'Bạn đã yêu cầu thanh toán 159.000 ₫.' });
    expect(
      toAttachment({ type: 'attachment', name: 'abc', description: '159.000 ₫ Marked as shipped' }),
    ).toEqual({
      kind: 'note',
      text: 'abc · 159.000 ₫ Marked as shipped',
    });
    expect(toAttachment({ type: 'attachment' })).toBeNull();
  });
});

describe('PancakeChatClient', () => {
  it('lists conversations newest first and sends the documented parameters', async () => {
    const { client, fetchMock } = makeClient((url) => {
      expect(url.pathname).toBe('/api/public_api/v1/pages/spo_1/conversations');
      expect(url.searchParams.get('page_access_token')).toBe('secret-token');
      expect(url.searchParams.get('since')).toBe('1000');
      expect(url.searchParams.get('until')).toBe('2000');
      return url.searchParams.get('page_number') === '1'
        ? json({
            success: true,
            total: 2,
            conversations: [
              conv({ id: 'old', updated_at: '2026-11-10T00:00:00.000000' }),
              conv({ id: 'new', updated_at: '2026-11-22T00:00:00.000000' }),
            ],
          })
        : json({ success: true, conversations: [] });
    });
    const list = await client.listConversations({ since: new Date(1_000_000), until: new Date(2_000_000) });
    expect(list.map((c) => c.id)).toEqual(['new', 'old']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops when a page repeats the previous one', async () => {
    const { client, fetchMock } = makeClient(() => json({ success: true, conversations: [conv()] }));
    const list = await client.listConversations({ since: new Date(0), until: new Date(1000) });
    expect(list).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('lists messages oldest first', async () => {
    const { client } = makeClient((url) => {
      expect(url.pathname).toBe('/api/public_api/v1/pages/spo_1/conversations/spo_1_100/messages');
      return json({
        messages: [
          { id: 'b', inserted_at: '2026-11-22T03:47:04.000000', from: { id: 'sp_9' }, message: 'Đã nhận' },
          { id: 'a', inserted_at: '2026-11-22T03:47:00.000000', from: { id: 'spo_1' }, message: 'Dạ' },
        ],
      });
    });
    const msgs = await client.listMessages('spo_1_100');
    expect(msgs.map((m) => m.id)).toEqual(['a', 'b']);
    expect(msgs[0]!.fromShop).toBe(true);
  });

  it('retries a 5xx once', async () => {
    let calls = 0;
    const { client } = makeClient(() => (++calls === 1 ? json({}, 502) : json({ messages: [] })));
    await expect(client.listMessages('x')).resolves.toEqual([]);
    expect(calls).toBe(2);
  });

  it('never puts the token in an error', async () => {
    const { client } = makeClient(() =>
      json({ success: false, message: 'Invalid access_token', error_code: 102 }, 200),
    );
    const err = await client.listMessages('x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PancakeError);
    expect((err as Error).message).not.toContain('secret-token');
    expect((err as PancakeError).errorCode).toBe(102);
  });

  it('sends a text with reply_inbox and never retries the write', async () => {
    let calls = 0;
    const { client } = makeClient((url) => {
      calls++;
      expect(url.pathname).toBe('/api/public_api/v1/pages/spo_1/conversations/spo_1_100/messages');
      return json({ success: true, id: 'm_1' });
    });
    await expect(client.sendMessage('spo_1_100', 'Dạ shop còn hàng ạ')).resolves.toEqual({ id: 'm_1' });
    expect(calls).toBe(1);

    const failing = makeClient(() => json({}, 502));
    await expect(failing.client.sendMessage('x', 'hi')).rejects.toBeInstanceOf(PancakeError);
    expect(failing.fetchMock).toHaveBeenCalledTimes(1);
    const init = (
      failing.fetchMock.mock.calls as unknown as [string, { method: string; body: string }][]
    )[0]![1];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ action: 'reply_inbox', message: 'hi' });
  });
});
