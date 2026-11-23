import type { PrismaClient } from '@sugami/db';
import { PushSender, type PushPayload, vapidFromEnv } from '@sugami/notify';
import type { NewOrder, OrderEvent } from '@sugami/sync';

const CHANNEL_NAME: Record<string, string> = { shopee: 'Shopee', tiktok: 'TikTok' };
const STATUS_LABEL: Record<string, string> = {
  new: 'Mới',
  confirmed: 'Đã xác nhận',
  packing: 'Đang đóng gói',
  shipped: 'Đã giao cho vận chuyển',
  delivered: 'Đã giao',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
  returned: 'Hoàn hàng về shop',
};
const vnd = (n: number) => `${n.toLocaleString('vi-VN')} đ`;
/** Orders older than this are catch-up after downtime, not news: logged, but no push. */
const FRESH_MS = 6 * 3600 * 1000;
/** The same kind of error is recorded at most this often, so a stuck sync does not fill the bell. */
const ERROR_EVERY_MS = 30 * 60_000;

export interface Activity extends PushPayload {
  kind: 'order_new' | 'order_status' | 'order_items' | 'chat_new' | 'error';
  title: string;
  /** Also send as push (the bell always gets it). */
  push: boolean;
}

/** Everything the order sync did that the owner should be able to see. */
export function activityFromSync(
  result: { newOrders: NewOrder[]; events: OrderEvent[] },
  now = Date.now(),
): Activity[] {
  const out: Activity[] = [];
  const fresh = result.newOrders.filter((o) => now - o.orderedAt.getTime() < FRESH_MS);
  // a burst of new orders is one push, but each stays in the log
  const burst = fresh.length > 3;
  for (const o of result.newOrders) {
    const isFresh = fresh.includes(o);
    out.push({
      kind: 'order_new',
      title: `Đơn mới ${CHANNEL_NAME[o.channel] ?? o.channel}`,
      body: `${o.code} · ${vnd(o.total)}`,
      url: '/orders',
      tag: `order-${o.code}`,
      push: isFresh && !burst,
    });
  }
  if (burst)
    out.push({
      kind: 'order_new',
      title: `${fresh.length} đơn mới`,
      body: 'Xem danh sách đơn hàng',
      url: '/orders',
      tag: 'orders-new',
      push: true,
      // logged individually above; this one is only for the push
    });
  for (const e of result.events) {
    const ch = CHANNEL_NAME[e.channel] ?? e.channel;
    const important = e.to === 'cancelled' || e.to === 'returned' || e.kind === 'items';
    out.push({
      kind: e.kind === 'items' ? 'order_items' : 'order_status',
      title:
        e.kind === 'items'
          ? `Đơn ${ch} đổi sản phẩm`
          : e.to === 'cancelled'
            ? `Đơn ${ch} bị hủy`
            : e.to === 'returned'
              ? `Đơn ${ch} hoàn về shop`
              : `Đơn ${ch}: ${STATUS_LABEL[e.to] ?? e.to}`,
      body: `${e.code} · ${vnd(e.total)}${e.kind === 'status' ? ` · ${STATUS_LABEL[e.from] ?? e.from} → ${STATUS_LABEL[e.to] ?? e.to}` : ''}`,
      url: '/orders',
      tag: `order-${e.code}-${e.to}`,
      push: important,
    });
  }
  return out;
}

/** Save to the bell's log and send the push ones. A failure here never breaks the sync. */
export async function recordActivity(
  db: PrismaClient,
  items: Activity[],
  log: (msg: string) => void = console.log,
): Promise<void> {
  if (items.length === 0) return;
  // burst summaries exist only for push
  const logged = items.filter(
    (a) => !((a.kind === 'order_new' && a.tag === 'orders-new') || (a.kind === 'chat_new' && a.tag === 'chat-burst')),
  );
  try {
    await db.notification.createMany({
      data: logged.map((a) => ({ kind: a.kind, title: a.title, body: a.body ?? null, url: a.url ?? null })),
    });
  } catch (e) {
    log(`[thông báo] không ghi được nhật ký: ${(e as Error).message}`);
  }
  // keep the log small: two months is plenty
  await db.notification
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 60 * 86_400_000) } } })
    .catch(() => undefined);
  for (const a of logged) log(`[thông báo] ${a.title}${a.body ? ` — ${a.body}` : ''}`);
  const vapid = vapidFromEnv();
  if (!vapid) return;
  const sender = new PushSender(db, vapid);
  for (const a of items.filter((x) => x.push))
    await sender
      .notify({ permissions: ['orders.read'] }, { title: a.title, body: a.body, url: a.url, tag: a.tag })
      .catch((e: Error) => log(`[thông báo] push lỗi: ${e.message}`));
}

/** A background job failed: tell the owner, but not more than once per half hour for the same problem. */
export async function reportError(
  db: PrismaClient,
  title: string,
  detail: string,
  log: (msg: string) => void = console.log,
): Promise<void> {
  const recent = await db.notification
    .findFirst({
      where: { kind: 'error', title, createdAt: { gt: new Date(Date.now() - ERROR_EVERY_MS) } },
      select: { id: true },
    })
    .catch(() => null);
  if (recent) return;
  await recordActivity(
    db,
    [{ kind: 'error', title, body: detail.slice(0, 480), url: '/', tag: 'error', push: true }],
    log,
  );
}
