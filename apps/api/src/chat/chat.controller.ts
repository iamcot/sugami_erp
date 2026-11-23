import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  CHAT_MAX_RANGE_DAYS,
  chatChannelOf,
  type ChatConversation,
  PancakeChatClient,
  PancakeError,
} from '@sugami/channels-pancake';
import { z } from 'zod';
import { RequirePermissions } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { chatSummary, filterConversations } from './chat-filter.js';
import { type ChatPageConfig, chatPagesFromEnv, pageOfConversation } from './chat-pages.js';

const ListQuery = z.object({
  channel: z.string().trim().max(20).default(''),
  kind: z.enum(['', 'INBOX', 'RATING', 'COMMENT']).default(''),
  unread: z.enum(['0', '1']).default('0'),
  waiting: z.enum(['0', '1']).default('0'),
  q: z.string().trim().max(100).default(''),
  days: z.coerce.number().int().min(1).max(CHAT_MAX_RANGE_DAYS).default(7),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

const SendBody = z.object({ text: z.string().trim().min(1).max(2000) });

/** Pancake is read at most this often per time range; the filters work on the cached list. */
const CACHE_MS = 20_000;

/**
 * Shop chat (Shopee) through Pancake's Pages API. Nothing is stored in Sugami; the only write is a reply the
 * user types and confirms. Needs a page access token from Pancake → Settings → Tool of the Shopee page.
 */
@Controller('chat')
export class ChatController {
  private cache = new Map<string, { at: number; rows: ChatConversation[] }>();

  private pages(): ChatPageConfig[] {
    const pages = chatPagesFromEnv(process.env);
    if (!pages.length)
      throw new ServiceUnavailableException('Chưa cấu hình PANCAKE_CHAT_PAGES (hoặc PANCAKE_CHAT_PAGE_ID / PANCAKE_CHAT_TOKEN)');
    return pages;
  }

  private clientFor(page: ChatPageConfig) {
    return new PancakeChatClient({ pageId: page.pageId, pageAccessToken: page.token });
  }

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof PancakeError)
        throw new UnprocessableEntityException(`Pancake từ chối: ${err.message}`);
      throw err;
    }
  }

  /** One page's conversations for the range, cached briefly. */
  private async rowsOf(page: ChatPageConfig, days: number): Promise<ChatConversation[]> {
    const key = `${page.pageId}:${days}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
    const until = new Date();
    const rows = await this.clientFor(page).listConversations({
      since: new Date(until.getTime() - days * 86_400_000),
      until,
    });
    this.cache.set(key, { at: Date.now(), rows });
    return rows;
  }

  @Get('conversations')
  @RequirePermissions('orders.read')
  async conversations(@Query() raw: unknown) {
    const q = parseInput(ListQuery, raw ?? {});
    const pages = this.pages();
    // A page that fails (expired token, Pancake down) must not hide the others.
    const results = await Promise.allSettled(pages.map((p) => this.rowsOf(p, q.days)));
    const rows: ChatConversation[] = [];
    const errors: { channel: string; pageId: string; message: string }[] = [];
    results.forEach((r, i) => {
      const page = pages[i]!;
      if (r.status === 'fulfilled') rows.push(...r.value);
      else
        errors.push({
          channel: chatChannelOf(page.pageId),
          pageId: page.pageId,
          message: r.reason instanceof PancakeError ? r.reason.message : 'Không đọc được chat',
        });
    });
    if (errors.length === pages.length) throw new UnprocessableEntityException(`Pancake từ chối: ${errors[0]!.message}`);
    rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    const channels = [...new Set([...pages.map((p) => chatChannelOf(p.pageId))])].map((channel) => ({
      channel,
      count: rows.filter((c) => c.channel === channel).length,
    }));
    // Chips for kind/unread/waiting count inside the chosen channel only.
    const inChannel = q.channel ? rows.filter((c) => c.channel === q.channel) : rows;
    const filtered = filterConversations(inChannel, {
      channel: q.channel,
      kind: q.kind,
      unread: q.unread === '1',
      waiting: q.waiting === '1',
      q: q.q,
    });
    const start = (q.page - 1) * q.pageSize;
    return {
      summary: chatSummary(inChannel),
      channels,
      errors,
      total: filtered.length,
      data: filtered.slice(start, start + q.pageSize).map((c) => ({
        ...c,
        updatedAt: c.updatedAt.toISOString(),
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  private pageFor(conversationId: string): ChatPageConfig {
    const page = pageOfConversation(this.pages(), conversationId);
    if (!page) throw new UnprocessableEntityException('Hội thoại không thuộc trang chat nào đã cấu hình');
    return page;
  }

  @Get('conversations/:id/messages')
  @RequirePermissions('orders.read')
  messages(@Param('id') id: string) {
    if (!/^[\w.@-]{1,128}$/.test(id)) throw new UnprocessableEntityException('Mã hội thoại không hợp lệ');
    return this.guard(async () => {
      const rows = await this.clientFor(this.pageFor(id)).listMessages(id);
      return { data: rows.map((m) => ({ ...m, at: m.at.toISOString() })) };
    });
  }

  /** Reply to a buyer's chat. Reaches a real buyer, so only chats (not ratings) and never retried. */
  @Post('conversations/:id/messages')
  @HttpCode(200)
  @RequirePermissions('orders.write')
  send(@Param('id') id: string, @Body() raw: unknown) {
    if (!/^[\w.@-]{1,128}$/.test(id)) throw new UnprocessableEntityException('Mã hội thoại không hợp lệ');
    if (id.includes('_rating_') || id.includes('_comment_'))
      throw new UnprocessableEntityException('Chỉ trả lời được chat, không trả lời được đánh giá ở đây');
    const { text } = parseInput(SendBody, raw ?? {});
    return this.guard(async () => {
      const sent = await this.clientFor(this.pageFor(id)).sendMessage(id, text);
      this.cache.clear();
      return { ok: true, id: sent.id };
    });
  }
}
