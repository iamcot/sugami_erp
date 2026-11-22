import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma, type PrismaClient } from './generated/prisma/client.js';

/** Who is making the change. Set once per request (see the API's AuditInterceptor). */
export interface AuditActor {
  userId?: string;
}

const actorStore = new AsyncLocalStorage<AuditActor>();

/**
 * Run `fn` with `actor` recorded as the author of every audited write inside it.
 * Prisma queries are lazy (they run on `.then`), so a returned thenable is started inside the context.
 */
export function runAsActor<T>(actor: AuditActor, fn: () => T): T {
  return actorStore.run(actor, () => {
    const result = fn();
    const isThenable = typeof (result as { then?: unknown } | null)?.then === 'function';
    return (isThenable ? Promise.resolve(result) : result) as T;
  });
}

export function currentActor(): AuditActor | undefined {
  return actorStore.getStore();
}

/**
 * Audited models → entity type stored in audit_logs. Stock is not here on purpose: every stock
 * change is already an append-only stock_movement, which is its own history.
 */
export const AUDITED_MODELS = {
  Product: 'product',
  Variant: 'variant',
  Category: 'category',
  Brand: 'brand',
  Warehouse: 'warehouse',
} as const satisfies Partial<Record<Prisma.ModelName, string>>;

type AuditedModel = keyof typeof AUDITED_MODELS;

/**
 * Fields never written to the log: timestamps, derived search keys, and costAvg (maintained only by
 * the stock ledger inside its own transaction; its history is the stock_movements unit costs).
 */
const IGNORED_FIELDS = new Set(['createdAt', 'updatedAt', 'searchKey', 'costAvg']);

type Row = Record<string, unknown>;
export type AuditDiff = Record<string, { from: unknown; to: unknown }>;

/** JSON-safe value: BigInt and Decimal become strings, Date becomes ISO. */
function plain(v: unknown): unknown {
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (Prisma.Decimal.isDecimal(v)) return (v as Prisma.Decimal).toString();
  return v ?? null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(plain(a)) === JSON.stringify(plain(b));

/** Changed fields between two rows (missing side = create/delete). Ignored fields are skipped. */
export function diffRecords(before: Row | null, after: Row | null): AuditDiff {
  const diff: AuditDiff = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const key of keys) {
    if (IGNORED_FIELDS.has(key)) continue;
    const from = before?.[key];
    const to = after?.[key];
    if (before && after && same(from, to)) continue;
    diff[key] = { from: plain(from), to: plain(to) };
  }
  return diff;
}

const delegateName = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

/**
 * Prisma extension that writes audit_logs for create/update/delete on AUDITED_MODELS, with the
 * field-level diff and the actor from runAsActor().
 *
 * Writes are logged right after they succeed, outside any surrounding interactive transaction.
 * Keep audited models out of long transactions (the ledger only touches costAvg, which is ignored).
 */
export function withAudit(base: PrismaClient): PrismaClient {
  const log = async (model: AuditedModel, action: string, before: Row | null, after: Row | null) => {
    const row = after ?? before;
    if (!row) return;
    const diff = diffRecords(before, after);
    if (action === 'update' && Object.keys(diff).length === 0) return;
    await base.auditLog.create({
      data: {
        userId: currentActor()?.userId ?? null,
        action,
        entityType: AUDITED_MODELS[model],
        entityId: String(row.id),
        diff: diff as Prisma.InputJsonValue,
      },
    });
  };

  const isAudited = (model: string): model is AuditedModel => model in AUDITED_MODELS;
  // Delegates on the base client are typed per model; we only need these generic calls here.
  type AnyDelegate = {
    findUnique(args: { where: unknown }): Promise<Row | null>;
    findMany(args: { where: unknown }): Promise<Row[]>;
  };
  const delegate = (model: string) => (base as unknown as Record<string, AnyDelegate>)[delegateName(model)]!;

  const extended = base.$extends({
    name: 'audit',
    query: {
      $allModels: {
        async create({ model, args, query }) {
          const result = (await query(args)) as Row;
          if (isAudited(model)) await log(model, 'create', null, result);
          return result;
        },
        async update({ model, args, query }) {
          if (!isAudited(model)) return query(args);
          const before = await delegate(model).findUnique({ where: args.where });
          const result = (await query(args)) as Row;
          await log(model, 'update', before, await delegate(model).findUnique({ where: { id: result.id } }));
          return result;
        },
        async delete({ model, args, query }) {
          if (!isAudited(model)) return query(args);
          const before = await delegate(model).findUnique({ where: args.where });
          const result = await query(args);
          await log(model, 'delete', before, null);
          return result;
        },
        async updateMany({ model, args, query }) {
          if (!isAudited(model)) return query(args);
          const before = await delegate(model).findMany({ where: args.where });
          const result = await query(args);
          const after = await delegate(model).findMany({ where: { id: { in: before.map((r) => r.id) } } });
          const afterById = new Map(after.map((r) => [r.id, r]));
          for (const row of before) await log(model, 'update', row, afterById.get(row.id) ?? null);
          return result;
        },
        async deleteMany({ model, args, query }) {
          if (!isAudited(model)) return query(args);
          const before = await delegate(model).findMany({ where: args.where });
          const result = await query(args);
          for (const row of before) await log(model, 'delete', row, null);
          return result;
        },
      },
    },
  });
  // Query hooks don't change the client's API, so the extended client is a drop-in PrismaClient.
  return extended as unknown as PrismaClient;
}
