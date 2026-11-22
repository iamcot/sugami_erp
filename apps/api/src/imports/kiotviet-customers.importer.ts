import type { ImportIssue, KvCustomer, ParsedCustomers } from '@sugami/channels-kiotviet';
import { Prisma, type PrismaClient } from '@sugami/db';
import { toSearchKey } from '@sugami/shared';

export interface CustomerImportOptions {
  dryRun: boolean;
}

export interface CustomerImportSummary {
  dryRun: boolean;
  rows: number;
  customers: { created: number; updated: number; unchanged: number };
  withPhone: number;
  /** Names KiotViet masked ("T******u"): stored as exported, replaced when an unmasked export arrives. */
  maskedNames: number;
  /** Customers already linked to imported orders (invoice import creates a stub per customer code). */
  linkedToOrders: number;
  issues: ImportIssue[];
}

export class CustomerImportBlockedError extends Error {
  constructor(public readonly errors: ImportIssue[]) {
    super(`File có ${errors.length} lỗi, chưa nhập gì. Sửa file rồi thử lại.`);
    this.name = 'CustomerImportBlockedError';
  }
}

const CHUNK = 500;

function toData(c: KvCustomer): Prisma.CustomerUncheckedCreateInput {
  return {
    kiotvietCode: c.code,
    name: c.name,
    searchKey: toSearchKey([c.name, c.phone, c.code].filter(Boolean).join(' ')).slice(0, 400),
    phone: c.phone,
    email: c.email,
    gender: c.gender,
    birthday: c.birthday,
    facebook: c.facebook,
    addressLine: c.addressLine,
    region: c.region,
    ward: c.ward,
    tags: c.groups.length ? c.groups : undefined,
    isActive: c.active,
    kvCreatedAt: c.createdAt,
    lastPurchaseAt: c.lastPurchaseAt,
    kvTotalSales: BigInt(c.totalSales),
    kvDebt: BigInt(c.debt),
  };
}

const sameDate = (a: Date | null | undefined, b: Date | null | undefined) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

function unchanged(
  old: Prisma.CustomerUncheckedCreateInput & { tags?: unknown },
  n: Prisma.CustomerUncheckedCreateInput,
) {
  const k = [
    'name',
    'searchKey',
    'phone',
    'email',
    'gender',
    'facebook',
    'addressLine',
    'region',
    'ward',
    'isActive',
  ] as const;
  return (
    k.every((f) => (old[f] ?? null) === (n[f] ?? null)) &&
    sameDate(old.birthday as Date | null, n.birthday as Date | null) &&
    sameDate(old.kvCreatedAt as Date | null, n.kvCreatedAt as Date | null) &&
    sameDate(old.lastPurchaseAt as Date | null, n.lastPurchaseAt as Date | null) &&
    BigInt(old.kvTotalSales ?? 0) === BigInt(n.kvTotalSales ?? 0) &&
    BigInt(old.kvDebt ?? 0) === BigInt(n.kvDebt ?? 0) &&
    JSON.stringify(old.tags ?? null) === JSON.stringify(n.tags ?? null)
  );
}

/**
 * Import a parsed KiotViet customer list. Customers are matched by KiotViet code, so running the
 * same file twice changes nothing, and customers already created by the invoice import get their
 * profile filled in (orders stay linked).
 */
export async function importKiotVietCustomers(
  db: PrismaClient,
  parsed: ParsedCustomers,
  opts: CustomerImportOptions,
): Promise<CustomerImportSummary> {
  const summary: CustomerImportSummary = {
    dryRun: opts.dryRun,
    rows: parsed.rowCount,
    customers: { created: 0, updated: 0, unchanged: 0 },
    withPhone: parsed.customers.filter((c) => c.phone).length,
    maskedNames: parsed.customers.filter((c) => c.name?.includes('*')).length,
    linkedToOrders: 0,
    issues: parsed.issues,
  };
  const errors = parsed.issues.filter((i) => i.level === 'error');
  if (errors.length && !opts.dryRun) throw new CustomerImportBlockedError(errors);

  for (let i = 0; i < parsed.customers.length; i += CHUNK) {
    const chunk = parsed.customers.slice(i, i + CHUNK);
    const existing = await db.customer.findMany({
      where: { kiotvietCode: { in: chunk.map((c) => c.code) } },
      include: { _count: { select: { orders: true } } },
    });
    const byCode = new Map(existing.map((e) => [e.kiotvietCode!, e]));
    const toCreate: Prisma.CustomerUncheckedCreateInput[] = [];
    const toUpdate: { id: string; data: Prisma.CustomerUncheckedCreateInput }[] = [];
    for (const c of chunk) {
      const data = toData(c);
      const old = byCode.get(c.code);
      // KiotViet only has the marketplace's masked name ("T******u"); never replace a real name or a
      // Shopee nickname we already learned (or the owner typed) with it.
      if (old?.name && !old.name.includes('*') && data.name?.includes('*')) {
        data.name = old.name;
        data.searchKey = toSearchKey([old.name, c.phone, c.code].filter(Boolean).join(' ')).slice(0, 400);
      }
      if (!old) {
        summary.customers.created++;
        toCreate.push(data);
      } else {
        if (old._count.orders > 0) summary.linkedToOrders++;
        if (unchanged(old as never, data)) summary.customers.unchanged++;
        else {
          summary.customers.updated++;
          toUpdate.push({ id: old.id, data });
        }
      }
    }
    if (opts.dryRun) continue;
    if (toCreate.length) await db.customer.createMany({ data: toCreate });
    for (const u of toUpdate) {
      const { kiotvietCode: _code, ...rest } = u.data;
      await db.customer.update({
        where: { id: u.id },
        data: { ...rest, tags: u.data.tags ?? Prisma.DbNull },
      });
    }
  }
  return summary;
}
