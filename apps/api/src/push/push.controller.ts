import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { isValidEndpoint } from '@sugami/notify';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { PushService } from './push.service.js';

const Subscription = z.object({
  endpoint: z.string().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(255), auth: z.string().min(1).max(255) }),
});
const Endpoint = z.object({ endpoint: z.string().max(2000) });

/** Web push for the PWA. Any signed-in user can manage push on their own devices. */
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('config')
  config() {
    return { publicKey: this.push.publicKey };
  }

  @Post('subscriptions')
  @HttpCode(204)
  async subscribe(@Body() body: unknown, @CurrentUser() user: AuthUser, @Headers('user-agent') ua?: string) {
    const sub = parseInput(Subscription, body);
    if (!isValidEndpoint(sub.endpoint)) throw new BadRequestException('Endpoint không hợp lệ');
    await this.push.get().saveSubscription(user.id, sub, ua);
  }

  @Delete('subscriptions')
  @HttpCode(204)
  async unsubscribe(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    await this.push.get().removeSubscription(user.id, parseInput(Endpoint, body).endpoint);
  }

  @Post('test')
  async test(@CurrentUser() user: AuthUser) {
    return this.push
      .get()
      .notify(
        { userIds: [user.id] },
        { title: 'Sugami', body: 'Thông báo đã bật trên thiết bị này.', url: '/', tag: 'test' },
      );
  }
}
