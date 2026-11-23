/**
 * Shipment status sync for self-delivered orders (Allingo). Two inputs feed the same idempotent update:
 *  - webhooks stored in `webhook_events` (provider "allingo"), processed here, and
 *  - a poll of every unfinished shipment (catches anything missed while the iMac or the tunnel was down).
 * The update records the timeline, then moves the order: parcel picked up -> status "shipped" and stock out,
 * delivered -> "delivered", returned to the shop -> "returned" (the shop then chooses put back in stock or not).
 */
import {
  effectiveStatus,
  isFinalPhase,
  phaseOf,
  type AllingoClient,
  type AllingoOrder,
  type AllingoTimelineEvent,
  type AllingoWebhookEvent,
  type ShipmentPhase,
} from '@sugami/carriers-allingo';
import { applyMovements, withLedgerTx, type PrismaClient } from '@sugami/db';

export const ALLINGO_PROVIDER = 'allingo';
const OPEN_ORDER = ['new', 'confirmed', 'packing'];

export interface OrderMove {
  toStatus: 'shipped' | 'delivered' | 'returned';
  /** Take the goods out of stock (they have not left yet). */
  takeStock: boolean;
}

/** What a shipment phase does to the order. Pure, so it can be tested without a database. */
export function decideOrderMove(
  phase: ShipmentPhase,
  order: { status: string; stockAppliedAt: Date | null },
): OrderMove | null {
  const open = OPEN_ORDER.includes(order.status);
  if (phase === 'picked_up' && open) return { toStatus: 'shipped', takeStock: !order.stockAppliedAt };
  if (phase === 'delivered') {
    if (open) return { toStatus: 'delivered', takeStock: !order.stockAppliedAt };
    if (order.status === 'shipped') return { toStatus: 'delivered', takeStock: false };
  }
  if (phase === 'returned' && ['shipped', 'delivered'].includes(order.status) && order.stockAppliedAt)
    return { toStatus: 'returned', takeStock: false };
  return null;
}

const SHIPPING_TEXT: Record<string, string> = {
  shipped: 'Đang giao',
  delivered: 'Giao thành công',
  returned: 'Hoàn hàng',
};

export interface ShipmentActivity {
  kind: 'shipment';
  shipmentId: string;
  orderCode: string;
  title: string;
  body: string;
  /** Worth a push: a failed delivery or a returned parcel. */
  push: boolean;
}

export interface ShipmentUpdate {
  status: string;
  partnerTrackNo?: string | null;
  trackLink?: string | null;
  partnerTrackLink?: string | null;
  fee?: { delivery?: number; insurance?: number; cod?: number; total?: number };
  events: {
    id: string;
    status: string;
    statusName?: string | null;
    note?: string | null;
    location?: string | null;
    at: Date;
  }[];
  source: 'webhook' | 'poll';
}

/** Apply one status report to a shipment and its order. Safe to repeat: events dedupe, order moves are guarded. */
export async function applyShipmentUpdate(
  db: PrismaClient,
  shipmentId: string,
  u: ShipmentUpdate,
): Promise<ShipmentActivity[]> {
  const shipment = await db.shipment.findUnique({
    where: { id: shipmentId },
    include: { order: { include: { lines: true } } },
  });
  if (!shipment) return [];
  const phase = phaseOf(u.status);
  const prevPhase = shipment.phase as ShipmentPhase;
  // a late report never drags a finished shipment backwards
  const final = isFinalPhase(prevPhase) && prevPhase !== phase;
  const now = new Date();
  const out: ShipmentActivity[] = [];

  await withLedgerTx(db, async (tx) => {
    if (u.events.length)
      await tx.shipmentEvent.createMany({
        data: u.events.map((e) => ({
          shipmentId,
          externalEventId: e.id.slice(0, 128),
          status: e.status.slice(0, 40),
          statusName: e.statusName?.slice(0, 191) ?? null,
          note: e.note?.slice(0, 500) ?? null,
          location: e.location?.slice(0, 255) ?? null,
          occurredAt: e.at,
          source: u.source,
        })),
        skipDuplicates: true,
      });
    if (final) {
      await tx.shipment.update({ where: { id: shipmentId }, data: { lastPolledAt: now } });
      return;
    }
    await tx.shipment.update({
      where: { id: shipmentId },
      data: {
        status: u.status.slice(0, 40),
        phase,
        lastEventAt: u.events.length ? new Date(Math.max(...u.events.map((e) => e.at.getTime()))) : undefined,
        lastPolledAt: now,
        ...(u.partnerTrackNo ? { partnerTrackNo: u.partnerTrackNo.slice(0, 64) } : {}),
        ...(u.trackLink ? { trackLink: u.trackLink.slice(0, 500) } : {}),
        ...(u.partnerTrackLink ? { partnerTrackLink: u.partnerTrackLink.slice(0, 500) } : {}),
        ...(u.fee?.total !== undefined
          ? {
              feeDelivery: BigInt(u.fee.delivery ?? 0),
              feeInsurance: BigInt(u.fee.insurance ?? 0),
              feeCod: BigInt(u.fee.cod ?? 0),
              feeTotal: BigInt(u.fee.total),
            }
          : {}),
        ...(phase === 'picked_up' && !shipment.pickedUpAt ? { pickedUpAt: now } : {}),
        ...(phase === 'delivered' ? { deliveredAt: shipment.deliveredAt ?? now } : {}),
        ...(phase === 'canceled' ? { canceledAt: shipment.canceledAt ?? now } : {}),
      },
    });

    const order = shipment.order;
    // only the shipment the order currently follows moves it (older, cancelled ones never do)
    const latest = await tx.shipment.findFirst({
      where: { orderId: order.id, phase: { not: 'canceled' } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const move = latest?.id === shipmentId ? decideOrderMove(phase, order) : null;
    if (move) {
      // the guard in the WHERE makes two writers (this and the manual button) take stock only once
      const moved = await tx.order.updateMany({
        where: {
          id: order.id,
          status: order.status,
          ...(move.takeStock ? { stockAppliedAt: null } : {}),
        },
        data: {
          status: move.toStatus,
          shippingStatus: SHIPPING_TEXT[move.toStatus],
          carrier: shipment.partnerName ?? shipment.partnerCode,
          trackingNo: u.partnerTrackNo ?? shipment.partnerTrackNo ?? shipment.trackId,
          fulfillment: 'delivery',
          ...(move.takeStock ? { stockAppliedAt: now } : {}),
          ...(move.toStatus === 'returned' ? { returnHandledAt: null } : {}),
        },
      });
      if (moved.count === 1 && move.takeStock)
        await applyMovements(
          tx,
          order.lines
            .filter((l) => l.variantId)
            .map((l) => ({
              warehouseId: order.warehouseId,
              variantId: l.variantId!,
              qtyDelta: -Number(l.qty),
              type: 'sale_out' as const,
              refType: 'order',
              refId: order.id,
              note: `Vận chuyển ${shipment.partnerName ?? shipment.partnerCode} lấy hàng, đơn ${order.code}`,
            })),
        );
    }

    if (phase !== prevPhase) {
      if (phase === 'failed_attempt')
        out.push({
          kind: 'shipment',
          shipmentId,
          orderCode: order.code,
          title: `Giao lỗi đơn ${order.code}`,
          body: 'Hãng báo giao không thành công, sẽ giao lại hoặc hoàn hàng.',
          push: true,
        });
      if (phase === 'returning' || phase === 'returned')
        out.push({
          kind: 'shipment',
          shipmentId,
          orderCode: order.code,
          title: phase === 'returned' ? `Hàng hoàn về shop: ${order.code}` : `Đơn ${order.code} đang hoàn`,
          body:
            phase === 'returned'
              ? 'Kiểm hàng rồi chọn Nhập lại kho hoặc Không nhập kho trong đơn.'
              : 'Hãng đang hoàn hàng về shop.',
          push: true,
        });
    }
  });
  return out;
}

function fromOrder(
  o: AllingoOrder,
): Pick<ShipmentUpdate, 'status' | 'partnerTrackNo' | 'trackLink' | 'partnerTrackLink' | 'fee'> {
  return {
    status: effectiveStatus(o.status, o.delivery?.status),
    partnerTrackNo: o.delivery?.partner_order_id ?? o.delivery?.partner_track_id ?? null,
    trackLink: o.delivery?.track_link ?? null,
    partnerTrackLink: o.delivery?.partner_track_link ?? null,
    fee: o.fee,
  };
}

const parseDate = (s: string | null | undefined, fallback: Date) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isNaN(t) ? fallback : new Date(t);
};

/** Process stored Allingo webhooks (signature was checked when they arrived). Returns what the owner should hear. */
export async function processAllingoWebhooks(db: PrismaClient, limit = 100): Promise<ShipmentActivity[]> {
  const rows = await db.webhookEvent.findMany({
    where: { provider: ALLINGO_PROVIDER, processedAt: null },
    orderBy: { receivedAt: 'asc' },
    take: limit,
  });
  const out: ShipmentActivity[] = [];
  for (const row of rows) {
    try {
      const ev = row.body as unknown as AllingoWebhookEvent;
      const obj = ev.data?.object;
      if (!obj?.id) throw new Error('no data.object.id');
      const shipment = await db.shipment.findFirst({
        where: { provider: ALLINGO_PROVIDER, externalId: obj.id },
        select: { id: true },
      });
      if (shipment) {
        const at = new Date((ev.created ?? Date.now() / 1000) * 1000);
        const status = effectiveStatus(obj.status, obj.delivery?.status);
        const data = ev.data as unknown as {
          status_event?: { status?: string; status_name?: string; note?: string };
        };
        out.push(
          ...(await applyShipmentUpdate(db, shipment.id, {
            ...fromOrder(obj),
            status: data.status_event?.status ?? status,
            events: [
              {
                id: ev.id,
                status: data.status_event?.status ?? status,
                statusName: data.status_event?.status_name ?? ev.type,
                note: data.status_event?.note ?? null,
                at: parseDate(undefined, at),
              },
            ],
            source: 'webhook',
          })),
        );
      }
      await db.webhookEvent.update({ where: { id: row.id }, data: { processedAt: new Date(), error: null } });
    } catch (err) {
      await db.webhookEvent.update({
        where: { id: row.id },
        data: {
          processedAt: new Date(),
          error: String(err instanceof Error ? err.message : err).slice(0, 1000),
        },
      });
    }
  }
  return out;
}

/** Read every unfinished shipment from Allingo: the safety net behind the webhooks. */
export async function pollShipments(
  db: PrismaClient,
  client: Pick<AllingoClient, 'getOrder' | 'timeline'>,
  now = new Date(),
): Promise<ShipmentActivity[]> {
  const open = await db.shipment.findMany({
    where: {
      provider: ALLINGO_PROVIDER,
      externalId: { not: null },
      phase: { in: ['waiting', 'picked_up', 'returning', 'failed_attempt'] },
      // do not read the same shipment more often than every 5 minutes
      OR: [{ lastPolledAt: null }, { lastPolledAt: { lt: new Date(now.getTime() - 5 * 60_000) } }],
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  const out: ShipmentActivity[] = [];
  for (const s of open) {
    try {
      const o = await client.getOrder(s.externalId!);
      let events: AllingoTimelineEvent[] = [];
      try {
        events = await client.timeline(s.externalId!);
      } catch {
        // the timeline is a bonus; the status above is what matters
      }
      out.push(
        ...(await applyShipmentUpdate(db, s.id, {
          ...fromOrder(o),
          events: events.map((e) => ({
            id: e.id,
            status: e.status,
            statusName: e.status_name,
            note: e.note,
            location: [e.scan_location?.name, e.scan_location?.city].filter(Boolean).join(', ') || null,
            at: parseDate(e.scanned_at, now),
          })),
          source: 'poll',
        })),
      );
    } catch (err) {
      await db.shipment.update({
        where: { id: s.id },
        data: { lastPolledAt: now, error: String(err instanceof Error ? err.message : err).slice(0, 500) },
      });
    }
  }
  return out;
}
