import type { ImportIssue } from './products.js';
import { type CellValue, excelDate, num, readFirstSheet, requireColumns, str } from './sheet.js';

export interface KvCustomer {
  row: number;
  code: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  gender: string | null;
  birthday: Date | null;
  facebook: string | null;
  addressLine: string | null;
  region: string | null;
  ward: string | null;
  /** KiotViet customer groups, split on "|". */
  groups: string[];
  active: boolean;
  createdAt: Date | null;
  lastPurchaseAt: Date | null;
  /** VND. */
  totalSales: number;
  debt: number;
}

export const CUSTOMER_COLUMNS = ['Mã khách hàng', 'Tên khách hàng'] as const;

export interface ParsedCustomers {
  customers: KvCustomer[];
  rowCount: number;
  issues: ImportIssue[];
}

const money = (v: CellValue) => {
  const n = num(v);
  return n === null || Number.isNaN(n) ? 0 : Math.round(n);
};

/** Phone as digits (keeps a leading +), or null when it is empty or masked. */
export function cleanPhone(v: string | null): string | null {
  if (!v || v.includes('*')) return null;
  const p = v.replace(/[\s.()-]/g, '');
  return p.length >= 6 ? p : null;
}

/**
 * Parse "DanhSachKhachHang_KV*.xlsx" (Khách hàng → Xuất file). Names and addresses are kept as
 * exported (KiotViet masks most of them). The note column is ignored on purpose: for marketplace
 * customers it holds the buyer's marketplace username. Dates are VN local time.
 */
export async function parseCustomerList(data: ArrayBuffer | Uint8Array): Promise<ParsedCustomers> {
  const { headers, rows } = await readFirstSheet(data);
  requireColumns(headers, CUSTOMER_COLUMNS, 'danh sách khách hàng');
  const issues: ImportIssue[] = [];
  const seen = new Map<string, number>();
  const customers: KvCustomer[] = [];
  for (const { row, values } of rows) {
    const v = (c: string): CellValue => values[c] ?? null;
    const code = str(v('Mã khách hàng'));
    if (!code) {
      issues.push({ row, level: 'error', message: 'Thiếu mã khách hàng' });
      continue;
    }
    if (seen.has(code)) {
      issues.push({
        row,
        sku: code,
        level: 'warning',
        message: `Trùng mã khách hàng với dòng ${seen.get(code)}, bỏ qua dòng này`,
      });
      continue;
    }
    seen.set(code, row);
    const phone = str(v('Điện thoại'));
    const status = num(v('Trạng thái'));
    customers.push({
      row,
      code,
      name: str(v('Tên khách hàng')),
      phone: cleanPhone(phone),
      email: str(v('Email')),
      gender: str(v('Giới tính')),
      birthday: excelDate(v('Ngày sinh')),
      facebook: str(v('Facebook')),
      addressLine: str(v('Địa chỉ')),
      region: str(v('Khu vực giao hàng')),
      ward: str(v('Phường/Xã')),
      groups: (str(v('Nhóm khách hàng')) ?? '')
        .split('|')
        .map((g) => g.trim())
        .filter(Boolean),
      active: status === null || Number.isNaN(status) ? true : status !== 0,
      createdAt: excelDate(v('Ngày tạo')),
      lastPurchaseAt: excelDate(v('Ngày giao dịch cuối')),
      totalSales: money(v('Tổng bán')),
      debt: money(v('Nợ cần thu hiện tại')),
    });
  }
  return { customers, rowCount: rows.length, issues };
}
