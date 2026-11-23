import { createHash } from 'node:crypto';
import {
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { verifyAllingoSignature } from '@sugami/carriers-allingo';
import type { AhamoveOrder } from '@sugami/channels-ahamove';
import { verifyPancakeWebhook, webhookType } from '@sugami/channels-pancake';
import type { Prisma } from '@sugami/db';
import type { Request } from 'express';
import { Public } from '../auth/decorators.js';
import { applyAhamoveStatus } from '../pos/ahamove.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Webhook inbox. Each call is checked, stored in webhook_events and answered 200 right away
 * (Pancake wants a 2xx within 30 s); the worker processes stored events later.
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('pancake')
  @Public()
  @HttpCode(200)
  async pancake(@Req() req: RawBodyRequest<Request>) {
    const secret = process.env.PANCAKE_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('Pancake webhook chưa được cấu hình');
    if (!verifyPancakeWebhook({ headers: req.headers }, secret)) throw new ForbiddenException();
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body ?? {});
    const body = (req.body ?? {}) as Record<string, unknown>;
    // Pancake sends no delivery id; identical retries hash the same and are stored once.
    const deliveryId = createHash('sha256').update(raw).digest('hex');
    try {
      await this.prisma.client.webhookEvent.create({
        data: {
          provider: 'pancake',
          eventType: webhookType(body),
          deliveryId,
          body: body as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      return { ok: true, duplicate: true };
    }
    return { ok: true };
  }

  /**
   * Allingo shipment events. The signature (`X-AllinGo-Signature`) is checked on the raw bytes; the event is
   * stored under its own id (Allingo repeats the same id on every retry) and processed by the worker.
   */
  @Post('allingo')
  @Public()
  @HttpCode(200)
  async allingo(@Req() req: RawBodyRequest<Request>) {
    const secret = process.env.ALLINGO_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('Allingo webhook chưa được cấu hình');
    const raw = req.rawBody?.toString('utf8') ?? '';
    const sig = req.headers['x-allingo-signature'];
    if (!verifyAllingoSignature(raw, Array.isArray(sig) ? sig[0] : sig, secret))
      throw new ForbiddenException();
    const body = (req.body ?? {}) as { id?: unknown; type?: unknown };
    const deliveryId =
      typeof body.id === 'string' && body.id
        ? body.id.slice(0, 128)
        : createHash('sha256').update(raw).digest('hex');
    try {
      await this.prisma.client.webhookEvent.create({
        data: {
          provider: 'allingo',
          eventType: typeof body.type === 'string' ? body.type.slice(0, 64) : 'unknown',
          deliveryId,
          body: body as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      return { ok: true, duplicate: true };
    }
    return { ok: true };
  }

  /**
   * Ahamove trip updates. Ahamove calls with an `apikey` header or a bearer token that we agreed on
   * (AHAMOVE_WEBHOOK_SECRET). The event is kept in webhook_events and applied to the order at once.
   */
  @Post('ahamove')
  @Public()
  @HttpCode(200)
  async ahamove(@Req() req: RawBodyRequest<Request>) {
    const secret = process.env.AHAMOVE_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('Ahamove webhook chưa được cấu hình');
    const sent = req.headers.apikey ?? req.headers.authorization?.replace(/^Bearer /i, '');
    if (sent !== secret) throw new ForbiddenException();
    const body = (req.body ?? {}) as AhamoveOrder & { _id?: string };
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(body);
    const deliveryId = createHash('sha256').update(raw).digest('hex');
    // Stop-level events of multi-drop orders are "{order_id}-{n}"; we only book one drop-off.
    const orderId = String(body._id ?? '').split('-')[0] ?? '';
    try {
      await this.prisma.client.webhookEvent.create({
        data: {
          provider: 'ahamove',
          eventType: String(body.status ?? 'unknown').slice(0, 64),
          deliveryId,
          body: body as Prisma.InputJsonValue,
          processedAt: new Date(),
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      return { ok: true, duplicate: true };
    }
    if (orderId) await applyAhamoveStatus(this.prisma.client, orderId, body);
    return { ok: true };
  }
}
