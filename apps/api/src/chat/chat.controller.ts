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
  type ChatConversation,
  PancakeChatClient,
  PancakeError,
} from '@sugami/channels-pancake';
import { z } from 'zod';
import { RequirePermissions } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { chatSummary, filterConversations } from './chat-filter.js';

const ListQuery = z.object({
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
  private cache = new Map<number, { at: number; rows: ChatConversation[] }>();

  private client() {
    const pageId = process.env.PANCAKE_CHAT_PAGE_ID;
    const token = process.env.PANCAKE_CHAT_TOKEN;
    if (!pageId || !token)
      throw new ServiceUnavailableException('Chưa cấu hình PANCAKE_CHAT_PAGE_ID / PANCAKE_CHAT_TOKEN');
    return new PancakeChatClient({ pageId, pageAccessToken: token });
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

  @Get('conversations')
  @RequirePermissions('orders.read')
  conversations(@Query() raw: unknown) {
    const q = parseInput(ListQuery, raw ?? {});
    return this.guard(async () => {
      const hit = this.cache.get(q.days);
      let rows: ChatConversation[];
      if (hit && Date.now() - hit.at < CACHE_MS) rows = hit.rows;
      else {
        const until = new Date();
        rows = await this.client().listConversations({
          since: new Date(until.getTime() - q.days * 86_400_000),
          until,
        });
        this.cache.set(q.days, { at: Date.now(), rows });
      }
      const filtered = filterConversations(rows, {
        kind: q.kind,
        unread: q.unread === '1',
        waiting: q.waiting === '1',
        q: q.q,
      });
      const start = (q.page - 1) * q.pageSize;
      return {
        summary: chatSummary(rows),
        total: filtered.length,
        data: filtered.slice(start, start + q.pageSize).map((c) => ({
          ...c,
          updatedAt: c.updatedAt.toISOString(),
          createdAt: c.createdAt.toISOString(),
        })),
      };
    });
  }

  @Get('conversations/:id/messages')
  @RequirePermissions('orders.read')
  messages(@Param('id') id: string) {
    if (!/^[\w.@-]{1,128}$/.test(id)) throw new UnprocessableEntityException('Mã hội thoại không hợp lệ');
    return this.guard(async () => {
      const rows = await this.client().listMessages(id);
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
      const sent = await this.client().sendMessage(id, text);
      this.cache.clear();
      return { ok: true, id: sent.id };
    });
  }
}
