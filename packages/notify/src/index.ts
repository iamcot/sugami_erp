/**
 * Web push to the owner's phones/computers (PWA). Used by the API and, later, the worker
 * (new orders, sync falling behind). Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in .env,
 * generated once with `pnpm vapid:generate`.
 */
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@sugami/db';
import webpush from 'web-push';

export interface PushPayload {
  title: string;
  body?: string;
  /** Page opened when the notification is tapped, e.g. "/orders/PC123". */
  url?: string;
  /** Same tag replaces the previous notification instead of stacking. */
  tag?: string;
}

export interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function vapidFromEnv(env: NodeJS.ProcessEnv = process.env): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY ?? '';
  const privateKey = env.VAPID_PRIVATE_KEY ?? '';
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: env.VAPID_SUBJECT || 'https://erp.sugami.vn' };
}

export const endpointHash = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex');

/** Only real push services over HTTPS; blocks using the server to call arbitrary URLs. */
export function isValidEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && endpoint.length <= 2000;
  } catch {
    return false;
  }
}

type SendFn = (
  sub: BrowserSubscription,
  body: string,
  opts: webpush.RequestOptions,
) => Promise<{ statusCode: number }>;

export interface SendResult {
  sent: number;
  removed: number;
  failed: number;
  /** One line per device: what the push service answered (for diagnosing). */
  devices: { device: string; ok: boolean; status?: number; error?: string }[];
}

/** Push service answers that mean the subscription is gone for good. */
function deviceName(ua: string | null): string {
  if (!ua) return 'không rõ';
  const os = /android/i.test(ua)
    ? 'Android'
    : /iphone|ipad/i.test(ua)
      ? 'iOS'
      : /mac/i.test(ua)
        ? 'Mac'
        : /windows/i.test(ua)
          ? 'Windows'
          : 'khác';
  return `${os}${/Samsung/i.test(ua) ? ' (Samsung)' : ''}`;
}

const GONE = new Set([404, 410]);

export class PushSender {
  private readonly send: SendFn;

  constructor(
    private readonly db: PrismaClient,
    private readonly vapid: VapidConfig,
    send?: SendFn,
  ) {
    this.send = send ?? ((sub, body, opts) => webpush.sendNotification(sub, body, opts));
  }

  async saveSubscription(userId: string, sub: BrowserSubscription, userAgent?: string) {
    if (!isValidEndpoint(sub.endpoint)) throw new Error('Invalid push endpoint');
    const data = {
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent?.slice(0, 255) ?? null,
      failCount: 0,
    };
    return this.db.pushSubscription.upsert({
      where: { endpointHash: endpointHash(sub.endpoint) },
      create: { ...data, endpointHash: endpointHash(sub.endpoint) },
      update: data,
    });
  }

  async removeSubscription(userId: string, endpoint: string) {
    await this.db.pushSubscription.deleteMany({ where: { userId, endpointHash: endpointHash(endpoint) } });
  }

  /** Send to the given users, or to every active user holding one of `permissions` ("*" counts). */
  async notify(
    target: { userIds: string[] } | { permissions: string[] },
    payload: PushPayload,
  ): Promise<SendResult> {
    const where =
      'userIds' in target
        ? { userId: { in: target.userIds } }
        : {
            user: {
              isActive: true,
              roles: {
                some: {
                  role: {
                    OR: [
                      { permissions: { array_contains: '*' } },
                      ...target.permissions.map((p) => ({ permissions: { array_contains: p } })),
                    ],
                  },
                },
              },
            },
          };
    const subs = await this.db.pushSubscription.findMany({ where });
    const body = JSON.stringify(payload);
    const result: SendResult = { sent: 0, removed: 0, failed: 0, devices: [] };
    await Promise.all(
      subs.map(async (s) => {
        try {
          await this.send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
            vapidDetails: this.vapid,
            TTL: 24 * 3600,
            urgency: 'normal',
            timeout: 10_000,
          });
          result.sent++;
          result.devices.push({ device: deviceName(s.userAgent), ok: true });
          await this.db.pushSubscription.update({
            where: { id: s.id },
            data: { lastSuccessAt: new Date(), failCount: 0 },
          });
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          result.devices.push({
            device: deviceName(s.userAgent),
            ok: false,
            status,
            error: (err as Error).message?.slice(0, 120),
          });
          if ((status && GONE.has(status)) || s.failCount >= 9) {
            result.removed++;
            await this.db.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
          } else {
            result.failed++;
            await this.db.pushSubscription.update({
              where: { id: s.id },
              data: { failCount: { increment: 1 } },
            });
          }
        }
      }),
    );
    return result;
  }
}
