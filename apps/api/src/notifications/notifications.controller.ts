import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../auth/decorators.js';
import { parseInput } from '../common/validation.js';
import { PrismaService } from '../prisma/prisma.service.js';

const Q = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

/** The log behind the bell: what the background jobs did (new orders, status changes, errors). */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('orders.read')
  async list(@Query() raw: unknown) {
    const { limit } = parseInput(Q, raw);
    const rows = await this.prisma.client.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return {
      data: rows.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        url: n.url,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  }
}
