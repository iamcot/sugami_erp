import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PushSender, vapidFromEnv } from '@sugami/notify';
import { PrismaService } from '../prisma/prisma.service.js';

/** Built lazily so a missing VAPID config only disables push, not the whole API. */
@Injectable()
export class PushService {
  private sender?: PushSender;

  constructor(private readonly prisma: PrismaService) {}

  get publicKey(): string | null {
    return vapidFromEnv()?.publicKey ?? null;
  }

  get(): PushSender {
    if (this.sender) return this.sender;
    const vapid = vapidFromEnv();
    if (!vapid) throw new ServiceUnavailableException('Chưa cấu hình VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY');
    this.sender = new PushSender(this.prisma.client, vapid);
    return this.sender;
  }

  /** For tests: replace the sender (e.g. with a fake transport). */
  set(sender: PushSender) {
    this.sender = sender;
  }
}
