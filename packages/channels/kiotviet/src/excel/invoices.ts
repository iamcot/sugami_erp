import type { ImportIssue } from './products.js';
import {
  type CellValue,
  excelDate,
  KiotVietFormatError,
  num,
  readFirstSheet,
  requireColumns,
  str,
} from './sheet.js';

export type KvChannelCode = 'shopee' | 'tiktok' | 'store';
export type KvOrderStatus = 'confirmed' | 'shipped' | 'delivered' | 'completed' | 'cancelled';

export interface KvInvoiceLine {
  row: number;
  sku: string;
  name: string;
  qty: number;
  /** VND per unit, before line discount. */
  unitPrice: number;
  /** VND per unit. */
  discount: number;
  /** VND per unit, after discount. */
  price: number;
  lineTotal: number;
}

export interface KvInvoice {
  /** First row of the invoice in the file. */
  row: number;
  code: string;
  orderCode: string | null;
  channel: KvChannelCode;
  /** Marketplace order number, e.g. Shopee order sn. */
  externalCode: string | null;
  customerCode: string | null;
  orderedAt: Date;
  status: KvOrderStatus;
  statusText: string | null;
  shippingStatus: string | null;
  carrier: string | null;
  trackingNo: string | null;
  shippingFee: number;
  subtotal: number;
  discount: number;
  otherIncome: number;
  total: number;
  paid: number;
  cod: number;
  lines: KvInvoiceLine[];
}

export const INVOICE_DETAIL_COLUMNS = [
  'Mã hóa đơn',
  'Thời gian',
  'Mã hàng',
  'Số lượng',
  'Thành tiền',
] as const;

/** Invoice code prefixes KiotViet uses for marketplace orders. TikTok's is assumed, not yet seen. */
const CHANNEL_PREFIXES: [prefix: string, channel: KvChannelCode][] = [
  ['HDSPE_', 'shopee'],
  ['HDTTS_', 'tiktok'],
  ['HDTTK_', 'tiktok'],
];

export function channelOfInvoice(
  code: string,
  carrier: string | null,
): { channel: KvChannelCode; externalCode: string | null } {
  for (const [prefix, channel] of CHANNEL_PREFIXES) {
    if (code.startsWith(prefix)) return { channel, externalCode: code.slice(prefix.length) || null };
  }
  if (carrier && /tiktok/i.test(carrier)) return { channel: 'tiktok', externalCode: null };
  return { channel: 'store', externalCode: null };
}

/** KiotViet "Trạng thái" + "Trạng thái giao hàng" → Sugami status; null when unknown. */
export function mapInvoiceStatus(status: string | null, shipping: string | null): KvOrderStatus | null {
  const s = (status ?? '').toLowerCase();
  const d = (shipping ?? '').toLowerCase();
  if (s.includes('hủy') || s.includes('huỷ')) return 'cancelled';
  if (s.includes('hoàn thành')) return 'completed';
  if (s.includes('đang xử lý') || s === '') {
    if (d.includes('thành công')) return 'delivered';
    if (d.includes('đang giao') || d.includes('chuyển hoàn')) return 'shipped';
    return 'confirmed';
  }
  return null;
}

const money = (v: CellValue) => {
  const n = num(v);
  return n === null || Number.isNaN(n) ? 0 : Math.round(n);
};

export interface ParsedInvoices {
  invoices: KvInvoice[];
  rowCount: number;
  issues: ImportIssue[];
}

/**
 * Parse "DanhSachChiTietHoaDon_KV*.xlsx" (Hóa đơn → Xuất file chi tiết): one row per invoice line,
 * invoice fields repeated. Customer names, phones, addresses and notes are ignored on purpose.
 */
export async function parseInvoiceDetails(data: ArrayBuffer | Uint8Array): Promise<ParsedInvoices> {
  const { headers, rows } = await readFirstSheet(data);
  if (headers.includes('Mã hóa đơn') && !headers.includes('Mã hàng')) {
    throw new KiotVietFormatError(
      'Đây là file hóa đơn tổng quan. Hãy xuất file chi tiết (có từng dòng hàng).',
    );
  }
  requireColumns(headers, INVOICE_DETAIL_COLUMNS, 'chi tiết hóa đơn');
  const issues: ImportIssue[] = [];
  const byCode = new Map<string, KvInvoice>();

  for (const { row, values } of rows) {
    const v = (c: string): CellValue => values[c] ?? null;
    const code = str(v('Mã hóa đơn'));
    if (!code) {
      issues.push({ row, level: 'error', message: 'Thiếu mã hóa đơn' });
      continue;
    }
    let inv = byCode.get(code);
    if (!inv) {
      const orderedAt = excelDate(v('Thời gian'));
      if (!orderedAt) {
        issues.push({
          row,
          sku: code,
          level: 'error',
          message: `Thời gian không đọc được: ${String(v('Thời gian'))}`,
        });
        continue;
      }
      const carrier = str(v('Đối tác giao hàng'));
      const statusText = str(v('Trạng thái'));
      const shippingStatus = str(v('Trạng thái giao hàng'));
      let status = mapInvoiceStatus(statusText, shippingStatus);
      if (!status) {
        issues.push({
          row,
          sku: code,
          level: 'warning',
          message: `Trạng thái lạ "${statusText}", coi như đã xác nhận`,
        });
        status = 'confirmed';
      }
      const { channel, externalCode } = channelOfInvoice(code, carrier);
      inv = {
        row,
        code,
        orderCode: str(v('Mã đặt hàng')),
        channel,
        externalCode,
        customerCode: str(v('Mã khách hàng')),
        orderedAt,
        status,
        statusText,
        shippingStatus,
        carrier,
        trackingNo: str(v('Mã vận đơn')),
        shippingFee: money(v('Phí trả ĐTGH')),
        subtotal: money(v('Tổng tiền hàng')),
        discount: money(v('Giảm giá hóa đơn')),
        otherIncome: money(v('Thu khác')),
        total: money(v('Khách cần trả')),
        paid: money(v('Khách đã trả')),
        cod: money(v('Còn cần thu (COD)')),
        lines: [],
      };
      byCode.set(code, inv);
    }
    const sku = str(v('Mã hàng'));
    const qty = num(v('Số lượng'));
    if (!sku || qty === null || Number.isNaN(qty) || qty <= 0) {
      issues.push({
        row,
        sku: sku ?? code,
        level: 'error',
        message: `Dòng hàng thiếu mã hoặc số lượng (${code})`,
      });
      continue;
    }
    const price = money(v('Giá bán'));
    inv.lines.push({
      row,
      sku,
      name: str(v('Tên hàng')) ?? sku,
      qty,
      unitPrice: money(v('Đơn giá')) || price,
      discount: money(v('Giảm giá')),
      price,
      lineTotal: money(v('Thành tiền')),
    });
  }
  const invoices = [...byCode.values()].filter((i) => i.lines.length > 0);
  for (const inv of invoices) {
    const sum = inv.lines.reduce((a, l) => a + l.lineTotal, 0);
    if (inv.subtotal && sum !== inv.subtotal) {
      issues.push({
        row: inv.row,
        sku: inv.code,
        level: 'warning',
        message: `Tổng dòng hàng ${sum} khác tổng tiền hàng ${inv.subtotal}`,
      });
    }
  }
  issues.sort((a, b) => a.row - b.row);
  return { invoices, rowCount: rows.length, issues };
}

/** "DanhSachSanPham_KV22112026-134912-531.xlsx" → export time (VN local), or null. */
export function exportTimeFromFilename(name: string): Date | null {
  const m = /_KV(\d{2})(\d{2})(\d{4})-(\d{2})(\d{2})(\d{2})/.exec(name);
  if (!m) return null;
  const [, dd, mm, yyyy, h, mi, s] = m.map(Number) as number[];
  return new Date(Date.UTC(yyyy!, mm! - 1, dd!, h!, mi!, s!) - 7 * 3600 * 1000);
}
