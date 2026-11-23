/**
 * Allingo shipment status -> what Sugami does with the order.
 * Order-level statuses: draft, queued, on_going, completed, canceled, return_finished. The carrier-level
 * `delivery.status` is finer (courier_assigned, picked_up, in_transit, deliver_failed...). Unknown values
 * count as "in progress" (docs).
 */
export type ShipmentPhase =
  | 'waiting' // created, the carrier has not taken the parcel
  | 'picked_up' // the parcel left the shop
  | 'delivered'
  | 'canceled'
  | 'returning'
  | 'returned' // back at the shop
  | 'failed_attempt'; // delivery failed, the carrier will retry

const WAITING = new Set([
  'draft',
  'queued',
  'pending',
  'pending_schedule',
  'courier_assigned',
  'courier_to_origin',
  'courier_at_origin',
  'pickup_failed',
]);
const PICKED = new Set([
  'picked_up',
  'in_transit',
  'on_going',
  'delivering',
  'courier_to_destination',
  'courier_arrived_destination',
  'courier_waiting_at_destination',
  'arrived',
]);

export function phaseOf(status: string | null | undefined): ShipmentPhase {
  const s = (status ?? '').toLowerCase();
  if (s === 'completed' || s === 'delivered') return 'delivered';
  if (s === 'canceled' || s === 'cancelled') return 'canceled';
  if (s === 'return_finished') return 'returned';
  if (s === 'return_active') return 'returning';
  if (s === 'deliver_failed') return 'failed_attempt';
  if (s === 'failed' || s === 'lost' || s === 'damaged') return 'returned';
  if (WAITING.has(s)) return 'waiting';
  if (PICKED.has(s)) return 'picked_up';
  // unknown values count as in progress; on_going orders have a carrier already
  return 'picked_up';
}

/** Statuses after which nothing changes any more: the poller stops reading them. */
export function isFinalPhase(p: ShipmentPhase): boolean {
  return p === 'delivered' || p === 'canceled' || p === 'returned';
}

/**
 * The most advanced of the order-level and carrier-level statuses. The finer carrier status wins unless it is
 * missing, so `on_going` + `courier_assigned` stays "waiting" until the parcel is really picked up.
 */
export function effectiveStatus(
  order: string | null | undefined,
  delivery: string | null | undefined,
): string {
  return delivery || order || 'queued';
}
