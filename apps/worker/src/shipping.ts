import { AllingoClient } from '@sugami/carriers-allingo';
import type { PrismaClient } from '@sugami/db';
import { pollShipments, processAllingoWebhooks, type ShipmentActivity } from '@sugami/sync';
import { recordActivity, reportError, type Activity } from './activity.js';

/** The shipment sync runs when the Allingo keys are in .env. */
export function shippingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ALLINGO_APP_ID && env.ALLINGO_APP_SECRET);
}

export function activitiesFromShipments(items: ShipmentActivity[]): Activity[] {
  return items.map((s) => ({
    kind: 'shipment' as const,
    title: s.title,
    body: s.body,
    url: `/orders?d=order:${encodeURIComponent(s.orderCode)}`,
    tag: `shipment-${s.shipmentId}-${s.title}`,
    push: s.push,
  }));
}

let client: AllingoClient | null = null;

/** One pass: `webhooks` handles stored webhook events, `poll` reads unfinished shipments from Allingo. */
export async function shippingPass(
  db: PrismaClient,
  mode: 'webhooks' | 'poll',
  log: (msg: string) => void = console.log,
): Promise<{ activities: number }> {
  try {
    let items: ShipmentActivity[];
    if (mode === 'webhooks') items = await processAllingoWebhooks(db);
    else {
      client ??= new AllingoClient({
        appId: process.env.ALLINGO_APP_ID ?? '',
        appSecret: process.env.ALLINGO_APP_SECRET ?? '',
        apiBase: process.env.ALLINGO_API_BASE || undefined,
      });
      items = await pollShipments(db, client);
    }
    await recordActivity(db, activitiesFromShipments(items), log);
    return { activities: items.length };
  } catch (err) {
    await reportError(db, 'Đồng bộ vận chuyển lỗi', (err as Error).message, log);
    throw err;
  }
}
