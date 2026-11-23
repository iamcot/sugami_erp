import type { PrismaClient } from '@sugami/db';

/** The slice of a conversation the matcher needs. */
export interface BuyerRef {
  id: string;
  channel: string;
  /** Platform user id (Shopee `sp_123`, Facebook PSID). */
  customerId: string | null;
  customerName: string;
  buyerUsername: string;
}

export interface MatchedCustomer {
  id: string;
  code: string | null;
  name: string | null;
  orders: number;
  /** How it was found: the marketplace key, a Facebook link/id on the customer, or a unique same name. */
  by: 'marketplace' | 'facebook' | 'name';
}

/** Customers made from marketplace orders are keyed "<channel>:<lowercase nickname>" (see the order sync). */
export function marketplaceKey(channel: string, username: string): string | null {
  const nick = username.trim().toLowerCase();
  return (channel === 'shopee' || channel === 'tiktok') && nick ? `${channel}:${nick}`.slice(0, 191) : null;
}

/**
 * Find the Sugami customer behind each chat. Shopee/TikTok: the order sync keys customers by sales channel +
 * nickname, which is exactly the chat's username, so that match is exact. Facebook: a customer whose Facebook
 * field holds the profile id, else the one customer with the same name (the database compares names ignoring
 * case and accents); two customers with one name is not a match, because the wrong profile is worse than none.
 */
export async function matchCustomers(
  db: PrismaClient,
  rows: BuyerRef[],
): Promise<Map<string, MatchedCustomer>> {
  const out = new Map<string, MatchedCustomer>();
  const select = { id: true, kiotvietCode: true, name: true, externalKey: true, facebook: true } as const;
  const found = new Map<string, { id: string; code: string | null; name: string | null }>();
  const note = (c: { id: string; kiotvietCode: string | null; name: string | null }) =>
    found.set(c.id, { id: c.id, code: c.kiotvietCode, name: c.name });

  // marketplace
  const keyOf = new Map<string, string>();
  for (const r of rows) {
    const k = marketplaceKey(r.channel, r.buyerUsername || r.customerName);
    if (k) keyOf.set(r.id, k);
  }
  const byKey = new Map<string, string>();
  if (keyOf.size) {
    const list = await db.customer.findMany({
      where: { externalKey: { in: [...new Set(keyOf.values())] } },
      select,
    });
    for (const c of list) {
      note(c);
      if (c.externalKey) byKey.set(c.externalKey, c.id);
    }
  }

  // Facebook: profile id, then unique name
  const fb = rows.filter((r) => r.channel === 'facebook');
  const byFbId = new Map<string, string>();
  const byName = new Map<string, string[]>();
  if (fb.length) {
    const ids = [...new Set(fb.map((r) => r.customerId).filter((x): x is string => !!x))];
    const names = [...new Set(fb.map((r) => r.customerName.trim()).filter(Boolean))];
    const list = await db.customer.findMany({
      where: {
        OR: [...ids.map((id) => ({ facebook: { contains: id } })), ...(names.length ? [{ name: { in: names } }] : [])],
      },
      select,
    });
    for (const c of list) {
      note(c);
      for (const id of ids) if (c.facebook?.includes(id)) byFbId.set(id, c.id);
      if (c.name) {
        const k = c.name.trim().toLowerCase();
        byName.set(k, [...(byName.get(k) ?? []), c.id]);
      }
    }
  }

  const hit = new Map<string, { id: string; by: MatchedCustomer['by'] }>();
  for (const r of rows) {
    const k = keyOf.get(r.id);
    const m = k ? byKey.get(k) : undefined;
    if (m) {
      hit.set(r.id, { id: m, by: 'marketplace' });
      continue;
    }
    if (r.channel !== 'facebook') continue;
    const viaId = r.customerId ? byFbId.get(r.customerId) : undefined;
    if (viaId) {
      hit.set(r.id, { id: viaId, by: 'facebook' });
      continue;
    }
    const same = byName.get(r.customerName.trim().toLowerCase());
    if (same && new Set(same).size === 1) hit.set(r.id, { id: same[0]!, by: 'name' });
  }

  const counts = hit.size
    ? await db.order.groupBy({
        by: ['customerId'],
        where: { customerId: { in: [...new Set([...hit.values()].map((h) => h.id))] }, status: { not: 'cancelled' } },
        _count: true,
      })
    : [];
  const orderCount = new Map(counts.map((c) => [c.customerId!, c._count]));
  for (const [convId, h] of hit) {
    const c = found.get(h.id)!;
    out.set(convId, { ...c, orders: orderCount.get(h.id) ?? 0, by: h.by });
  }
  return out;
}
