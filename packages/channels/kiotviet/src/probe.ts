/**
 * P0-06: read-only probe of a real KiotViet store. Never writes to KiotViet.
 *
 *   pnpm --filter @sugami/channels-kiotviet build
 *   pnpm --filter @sugami/channels-kiotviet probe [-- --out kiotviet-probe-report.json]
 *
 * Reads KIOTVIET_CLIENT_ID / KIOTVIET_CLIENT_SECRET / KIOTVIET_RETAILER from the root .env.
 * Writes one JSON report with HTTP status, totals, field lists and up to 3 redacted samples
 * per endpoint. The report contains no token or secret and masks customer details.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { KiotVietClient, KiotVietError, type KiotVietPage, type Query } from './client.js';
import { keyPaths, redact } from './redact.js';

interface Probe {
  name: string;
  path: string;
  query?: Query;
  /** Path hint so redaction treats every item as personal data (e.g. customers). */
  personal?: boolean;
}

const PROBES: Probe[] = [
  { name: 'branches', path: '/branches' },
  { name: 'categories', path: '/categories', query: { hierachicalData: true } },
  {
    name: 'products',
    path: '/products',
    query: { includeInventory: true, includePricebook: true, includeRemoveIds: true, orderBy: 'id' },
  },
  { name: 'productOnHands', path: '/productOnHands' },
  { name: 'pricebooks', path: '/pricebooks' },
  { name: 'trademark', path: '/trademark' },
  { name: 'suppliers', path: '/suppliers', personal: true },
  {
    name: 'orders',
    path: '/orders',
    query: {
      includePayment: true,
      includeOrderDelivery: true,
      orderBy: 'createdDate',
      orderDirection: 'Desc',
    },
  },
  {
    name: 'invoices',
    path: '/invoices',
    query: {
      includePayment: true,
      includeInvoiceDelivery: true,
      orderBy: 'createdDate',
      orderDirection: 'Desc',
    },
  },
  { name: 'returns', path: '/returns' },
  { name: 'purchaseorders', path: '/purchaseorders' },
  { name: 'transfers', path: '/transfers' },
  { name: 'customers', path: '/customers', personal: true },
  { name: 'users', path: '/users', personal: true },
  { name: 'saleChannel', path: '/salechannel' },
  { name: 'webhooks', path: '/webhooks' },
  { name: 'surcharges', path: '/surchages' },
  { name: 'bankaccounts', path: '/bankaccounts', personal: true },
];

interface ProbeResult {
  name: string;
  path: string;
  status: number | 'error';
  ms: number;
  total?: number;
  count?: number;
  fields?: string[];
  samples?: unknown[];
  error?: string;
}

function envOrExit(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing ${name} in .env`);
    process.exit(1);
  }
  return v;
}

/** Tally sale channel / source fields across recent orders or invoices. */
function tallyChannels(items: Record<string, unknown>[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const it of items) {
    const sc = it.SaleChannel ?? it.saleChannel;
    const label =
      (sc && typeof sc === 'object' && 'Name' in sc ? String((sc as { Name: unknown }).Name) : undefined) ??
      (sc && typeof sc === 'object' && 'name' in sc ? String((sc as { name: unknown }).name) : undefined) ??
      (it.saleChannelId !== undefined ? `id:${String(it.saleChannelId)}` : 'none');
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return counts;
}

async function main(): Promise<void> {
  const outArg = process.argv.indexOf('--out');
  const out = resolve(outArg > 0 ? process.argv[outArg + 1]! : 'kiotviet-probe-report.json');
  const client = new KiotVietClient({
    clientId: envOrExit('KIOTVIET_CLIENT_ID'),
    clientSecret: envOrExit('KIOTVIET_CLIENT_SECRET'),
    retailer: envOrExit('KIOTVIET_RETAILER'),
    retryDelaysMs: [1_000, 4_000],
  });

  const startedAt = new Date().toISOString();
  try {
    await client.getToken();
  } catch (err) {
    if (err instanceof KiotVietError) {
      console.error(`Token request failed (HTTP ${err.status}). Check client id/secret in .env.`);
    } else {
      const cause = err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : '';
      console.error(`Cannot reach id.kiotviet.vn (${String(err)}${cause}). Check the internet connection.`);
    }
    process.exit(1);
  }
  console.log(`Token OK (expires_in=${client.lastTokenExpiresIn}s)`);

  const results: ProbeResult[] = [];
  const extras: Record<string, unknown> = {};

  for (const p of PROBES) {
    const t0 = Date.now();
    try {
      const page = await client.get<KiotVietPage<Record<string, unknown>> | Record<string, unknown>[]>(
        p.path,
        {
          pageSize: 20,
          ...p.query,
        },
      );
      const data = Array.isArray(page) ? page : (page.data ?? []);
      const total = Array.isArray(page) ? data.length : page.total;
      const ctx = p.personal ? ['customer'] : [];
      results.push({
        name: p.name,
        path: p.path,
        status: 200,
        ms: Date.now() - t0,
        total,
        count: data.length,
        fields: [...keyPaths(data, '')].sort(),
        samples: data.slice(0, 3).map((d) => redact(d, ctx)),
      });
      if (p.name === 'orders' || p.name === 'invoices') extras[`${p.name}SaleChannels`] = tallyChannels(data);
      console.log(`  ${p.name.padEnd(16)} 200  total=${total ?? '?'}`);
    } catch (err) {
      const status = err instanceof KiotVietError ? err.status : 'error';
      const message = err instanceof KiotVietError ? err.body.slice(0, 300) : String(err);
      results.push({ name: p.name, path: p.path, status, ms: Date.now() - t0, error: message });
      console.log(`  ${p.name.padEnd(16)} ${status}`);
    }
  }

  const report = {
    tool: 'sugami kiotviet-probe',
    version: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    tokenExpiresIn: client.lastTokenExpiresIn,
    requestCount: client.requestCount,
    results,
    extras,
  };
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${out}`);
  console.log('Customer details are masked. Send this file in the chat for P0-07.');
}

void main();
