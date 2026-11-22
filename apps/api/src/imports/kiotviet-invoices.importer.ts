import type { ImportIssue, KvChannelCode, KvInvoice, ParsedInvoices } from '@sugami/channels-kiotviet';
import { applyMovements, type MovementInput, Prisma, type PrismaClient, withLedgerTx } from '@sugami/db';

export interface InvoiceImportOptions {
  warehouseId: string;
  dryRun: boolean;
  userId?: string;
}

export interface InvoiceImportSummary {
  dryRun: boolean;
  rows: number;
  orders: { created: number; updated: number; unchanged: number };
  byChannel: Record<string, { orders: number; revenue: number }>;
  /** Sum of "Khách cần trả" of non-cancelled invoices, VND. */
  revenue: number;
  stock: {
    /** Lines whose stock was deducted (sale after the SKU's opening stock snapshot). */
    applied: number;
    /** Lines before the opening snapshot: already included in KiotViet's stock, not deducted again. */
    beforeSnapshot: number;
    /** Lines reversed because the invoice was cancelled after import. */
    reversed: number;
  };
  unknownSkus: string[];
  issues: ImportIssue[];
}

const CHANNEL_NAMES: Record<KvChannelCode, { type: 'shopee' | 'tiktok' | 'store'; name: string }> = {
  shopee: { type: 'shopee', name: 'Shopee' },
  tiktok: { type: 'tiktok', name: 'TikTok Shop' },
  store: { type: 'store', name: 'Bán trực tiếp' },
};

const big = (n: number) => BigInt(Math.round(n));

/**
 * Import KiotViet invoices as Sugami orders, matched by invoice code (re-running is safe).
 * Stock: a line deducts stock (sale_out) only if the sale happened after the SKU's opening stock
 * snapshot in this warehouse; earlier sales are already reflected in the opening balance.
 */
export async function importKiotVietInvoices(
  db: PrismaClient,
  parsed: ParsedInvoices,
  opts: InvoiceImportOptions,
): Promise<InvoiceImportSummary> {
  const issues = [...parsed.issues];
  const errors = issues.filter((i) => i.level === 'error');
  if (errors.length && !opts.dryRun) throw new InvoiceImportBlockedError(errors);

  const summary: InvoiceImportSummary = {
    dryRun: opts.dryRun,
    rows: parsed.rowCount,
    orders: { created: 0, updated: 0, unchanged: 0 },
    byChannel: {},
    revenue: 0,
    stock: { applied: 0, beforeSnapshot: 0, reversed: 0 },
    unknownSkus: [],
    issues,
  };
  const invoices = parsed.invoices;
  const skus = [...new Set(invoices.flatMap((i) => i.lines.map((l) => l.sku)))];

  const [variants, existing, channels, openings] = await Promise.all([
    db.variant.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true, costAvg: true } }),
    db.order.findMany({
      where: { kiotvietInvoiceCode: { in: invoices.map((i) => i.code) } },
      include: { lines: true },
    }),
    db.channel.findMany(),
    db.stockMovement.groupBy({
      by: ['variantId'],
      where: {
        warehouseId: opts.warehouseId,
        type: { in: ['kiotviet_import', 'opening'] },
        variant: { sku: { in: skus } },
      },
      _min: { occurredAt: true },
    }),
  ]);
  const variantBySku = new Map(variants.map((v) => [v.sku, v]));
  const orderByCode = new Map(existing.map((o) => [o.kiotvietInvoiceCode!, o]));
  // Orders the Pancake sync created before this invoice arrived: same marketplace order number.
  const marketplaceCodes = invoices.map((i) => i.externalCode).filter((c): c is string => !!c);
  const fromPancake = await db.order.findMany({
    where: { externalCode: { in: marketplaceCodes }, kiotvietInvoiceCode: null, source: 'pancake' },
    include: { lines: true, channel: { select: { code: true } } },
  });
  const pancakeByMarketplace = new Map(fromPancake.map((o) => [`${o.channel.code}:${o.externalCode}`, o]));
  const channelByCode = new Map(channels.map((c) => [c.code, c]));
  const snapshotAt = new Map(openings.map((o) => [o.variantId, o._min.occurredAt]));
  const unknown = new Set<string>();

  const channelId = async (code: KvChannelCode) => {
    let ch = channelByCode.get(code);
    if (!ch && !opts.dryRun) {
      ch = await db.channel.create({ data: { code, ...CHANNEL_NAMES[code] } });
      channelByCode.set(code, ch);
    }
    return ch?.id ?? `dry:${code}`;
  };

  for (const inv of invoices) {
    const active = inv.status !== 'cancelled';
    if (active) {
      summary.revenue += inv.total;
      const c = (summary.byChannel[inv.channel] ??= { orders: 0, revenue: 0 });
      c.orders++;
      c.revenue += inv.total;
    }
    for (const l of inv.lines) if (!variantBySku.has(l.sku)) unknown.add(l.sku);

    const fields = {
      status: inv.status,
      shippingStatus: inv.shippingStatus,
      carrier: inv.carrier,
      trackingNo: inv.trackingNo,
      subtotal: big(inv.subtotal),
      discount: big(inv.discount),
      otherIncome: big(inv.otherIncome),
      total: big(inv.total),
      paidAmount: big(inv.paid),
      codAmount: big(inv.cod),
      shippingFee: big(inv.shippingFee),
      completedAt: inv.status === 'completed' || inv.status === 'delivered' ? inv.orderedAt : null,
    };
    const prev =
      orderByCode.get(inv.code) ??
      (inv.externalCode ? pancakeByMarketplace.get(`${inv.channel}:${inv.externalCode}`) : undefined);

    // Lines that should move stock: active order, known SKU, sale after the SKU's opening snapshot.
    const saleLines = (o: KvInvoice) =>
      o.lines.filter((l) => {
        const v = variantBySku.get(l.sku);
        if (!v) return false;
        const at = snapshotAt.get(v.id);
        return Boolean(at && o.orderedAt > at);
      });

    if (!prev) {
      summary.orders.created++;
      const toApply = active ? saleLines(inv) : [];
      if (active) {
        summary.stock.applied += toApply.length;
        summary.stock.beforeSnapshot +=
          inv.lines.filter((l) => variantBySku.has(l.sku)).length - toApply.length;
      }
      if (opts.dryRun) continue;
      let customerId: string | null = null;
      if (inv.customerCode) {
        customerId = (
          await db.customer.upsert({
            where: { kiotvietCode: inv.customerCode },
            create: { kiotvietCode: inv.customerCode },
            update: {},
          })
        ).id;
      }
      const chId = await channelId(inv.channel);
      await withLedgerTx(db, async (tx) => {
        const order = await tx.order.create({
          data: {
            code: inv.code,
            kiotvietInvoiceCode: inv.code,
            kiotvietOrderCode: inv.orderCode,
            externalCode: inv.externalCode,
            channelId: chId,
            customerId,
            warehouseId: opts.warehouseId,
            orderedAt: inv.orderedAt,
            source: 'kiotviet_excel',
            ...fields,
            stockAppliedAt: toApply.length ? new Date() : null,
            lines: {
              create: inv.lines.map((l, i) => {
                const v = variantBySku.get(l.sku);
                return {
                  variantId: v?.id ?? null,
                  sku: l.sku,
                  name: l.name.slice(0, 255),
                  qty: new Prisma.Decimal(l.qty),
                  unitPrice: big(l.unitPrice),
                  discount: big(l.discount),
                  price: big(l.price),
                  lineTotal: big(l.lineTotal),
                  costSnapshot: v?.costAvg ?? null,
                  sort: i,
                };
              }),
            },
          },
        });
        await applyMovements(
          tx,
          toApply.map((l) => saleMovement(l.sku, -l.qty, 'sale_out', order.id, inv, opts, variantBySku)),
        );
      });
      continue;
    }

    // Existing order: update header fields; reverse stock if it got cancelled.
    // Linking an order that Pancake created counts as a change even if the fields match.
    const linking = prev.kiotvietInvoiceCode === null;
    const changed =
      linking ||
      prev.status !== fields.status ||
      prev.shippingStatus !== fields.shippingStatus ||
      prev.trackingNo !== fields.trackingNo ||
      prev.total !== fields.total ||
      prev.paidAmount !== fields.paidAmount ||
      prev.codAmount !== fields.codAmount ||
      prev.shippingFee !== fields.shippingFee;
    const linesSame =
      prev.lines.length === inv.lines.length &&
      inv.lines.every((l) => prev.lines.some((p) => p.sku === l.sku && Number(p.qty) === l.qty));
    if (!linesSame) {
      issues.push({
        row: inv.row,
        sku: inv.code,
        level: 'warning',
        message: 'Dòng hàng khác lần nhập trước, giữ dòng hàng cũ',
      });
    }
    if (!changed) {
      summary.orders.unchanged++;
      continue;
    }
    summary.orders.updated++;
    const reverse = !active && prev.stockAppliedAt !== null;
    const reverseLines = reverse ? prev.lines.filter((l) => l.variantId) : [];
    summary.stock.reversed += reverseLines.length;
    if (opts.dryRun) continue;
    await withLedgerTx(db, async (tx) => {
      if (reverse) {
        // Only lines that were deducted: those dated after the snapshot at import time.
        const moved = await tx.stockMovement.findMany({
          where: { refType: 'order', refId: prev.id, type: 'sale_out' },
          select: { variantId: true, qtyDelta: true },
        });
        await applyMovements(
          tx,
          moved.map((m) => ({
            warehouseId: opts.warehouseId,
            variantId: m.variantId,
            qtyDelta: m.qtyDelta.neg(),
            type: 'return_in' as const,
            refType: 'order',
            refId: prev.id,
            note: `Hủy hóa đơn ${inv.code}`,
            createdBy: opts.userId,
          })),
        );
      }
      await tx.order.update({
        where: { id: prev.id },
        data: {
          ...fields,
          ...(linking ? { kiotvietInvoiceCode: inv.code, kiotvietOrderCode: inv.orderCode } : {}),
          ...(reverse ? { stockAppliedAt: null } : {}),
        },
      });
    });
  }

  summary.unknownSkus = [...unknown].sort();
  for (const sku of summary.unknownSkus) {
    issues.push({
      row: 0,
      sku,
      level: 'warning',
      message: 'Mã hàng chưa có trong Sugami, dòng hàng không trừ tồn',
    });
  }
  issues.sort((a, b) => a.row - b.row);
  return summary;
}

function saleMovement(
  sku: string,
  qtyDelta: number,
  type: 'sale_out',
  orderId: string,
  inv: KvInvoice,
  opts: InvoiceImportOptions,
  variantBySku: Map<string, { id: string }>,
): MovementInput {
  return {
    warehouseId: opts.warehouseId,
    variantId: variantBySku.get(sku)!.id,
    qtyDelta,
    type,
    refType: 'order',
    refId: orderId,
    note: `Hóa đơn ${inv.code}`,
    occurredAt: inv.orderedAt,
    createdBy: opts.userId,
  };
}

export class InvoiceImportBlockedError extends Error {
  constructor(readonly errors: ImportIssue[]) {
    super(`File có ${errors.length} dòng lỗi, sửa trên KiotViet rồi xuất lại`);
    this.name = 'InvoiceImportBlockedError';
  }
}
