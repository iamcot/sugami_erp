/**
 * Files Sugami produces for KiotViet's own Excel import screens (docs/kiotviet-excel.md §5–7).
 * Column names and order match KiotViet's templates exactly; KiotViet rejects anything else.
 */
import { writeSheet } from './sheet.js';

export const PURCHASE_ORDER_SHEET = 'PurchaseOrderTemplate';
export const PURCHASE_ORDER_HEADERS = [
  'Mã hàng',
  'Tên hàng',
  'Đơn vị tính',
  'Đơn giá',
  'Giảm giá',
  'Giảm giá (%)',
  'Số lượng',
] as const;

export const STOCK_TAKE_SHEET = 'StockTakeTemplate';
export const STOCK_TAKE_HEADERS = ['Mã hàng', 'Số lượng'] as const;

export const PRODUCT_SHEET = 'ProductTemplate';
export const PRODUCT_HEADERS = [
  'Loại hàng',
  'Nhóm hàng(3 Cấp)',
  'Mã hàng',
  'Mã vạch',
  'Tên hàng',
  'Tên hàng trên hóa đơn điện tử',
  'Thương hiệu',
  'Giá bán',
  'Giá vốn',
  'Tồn kho',
  'Tồn nhỏ nhất',
  'Tồn lớn nhất',
  'ĐVT',
  'Mã ĐVT Cơ bản',
  'Quy đổi',
  'Thuộc tính',
  'Mã HH Liên quan',
  'Hình ảnh (url1,url2...)',
  'Trọng lượng',
  'Tích điểm',
  'Đang kinh doanh',
  'Được bán trực tiếp',
  'Mô tả',
  'Mẫu ghi chú',
  'Vị trí',
  'Hàng thành phần',
] as const;

export interface PurchaseLine {
  sku: string;
  name?: string;
  /** VND per unit, already including allocated shipping/fees. */
  unitCost: number;
  quantity: number;
}

/**
 * Phiếu nhập hàng. Duplicate SKUs are merged (KiotViet keeps one line per code) with a
 * quantity-weighted unit cost, rounded to whole đồng.
 */
export function purchaseOrderFile(lines: readonly PurchaseLine[]): Promise<Buffer> {
  const merged = new Map<string, { name?: string; qty: number; value: number }>();
  for (const l of lines) {
    const m = merged.get(l.sku) ?? { name: l.name, qty: 0, value: 0 };
    m.qty += l.quantity;
    m.value += l.quantity * l.unitCost;
    merged.set(l.sku, m);
  }
  const rows = [...merged].map(([sku, m]) => [
    sku,
    m.name ?? null,
    null,
    m.qty ? Math.round(m.value / m.qty) : 0,
    null,
    null,
    m.qty,
  ]);
  return writeSheet(PURCHASE_ORDER_SHEET, PURCHASE_ORDER_HEADERS, rows);
}

/** Phiếu kiểm kho: `quantity` is the counted (actual) stock; KiotViet computes the difference itself. */
export function stockTakeFile(lines: readonly { sku: string; quantity: number }[]): Promise<Buffer> {
  const last = new Map(lines.map((l) => [l.sku, l.quantity]));
  return writeSheet(
    STOCK_TAKE_SHEET,
    STOCK_TAKE_HEADERS,
    [...last].map(([sku, q]) => [sku, q]),
  );
}

export interface NewProductRow {
  sku: string;
  name: string;
  category?: string | null;
  brand?: string | null;
  barcode?: string | null;
  price: number;
  cost: number;
  minStock?: number;
  /** [name, value] pairs, written as `Tên:Giá trị|Tên:Giá trị`. */
  attributes?: [string, string][];
  /** Parent SKU for variants (Mã HH Liên quan); empty for the first/only variant. */
  parentSku?: string | null;
  imageUrls?: string[];
  weightGrams?: number | null;
  description?: string | null;
}

/** Hàng hóa mới. Stock is 0: goods enter KiotViet through a purchase order, never through this file. */
export function productTemplateFile(rows: readonly NewProductRow[]): Promise<Buffer> {
  const clean = (s: string) => s.replace(/[|:]/g, ' ').trim();
  return writeSheet(
    PRODUCT_SHEET,
    PRODUCT_HEADERS,
    rows.map((r) => {
      const v: Record<(typeof PRODUCT_HEADERS)[number], string | number | null> = {
        'Loại hàng': 'Hàng hóa',
        'Nhóm hàng(3 Cấp)': r.category ?? null,
        'Mã hàng': r.sku,
        'Mã vạch': r.barcode ?? null,
        'Tên hàng': r.name,
        'Tên hàng trên hóa đơn điện tử': null,
        'Thương hiệu': r.brand ?? null,
        'Giá bán': r.price,
        'Giá vốn': r.cost,
        'Tồn kho': 0,
        'Tồn nhỏ nhất': r.minStock ?? 0,
        'Tồn lớn nhất': null,
        ĐVT: null,
        'Mã ĐVT Cơ bản': null,
        'Quy đổi': 1,
        'Thuộc tính': r.attributes?.length
          ? r.attributes.map(([n, val]) => `${clean(n)}:${val.replace(/\|/g, ' ')}`).join('|')
          : null,
        'Mã HH Liên quan': r.parentSku ?? null,
        'Hình ảnh (url1,url2...)': r.imageUrls?.length ? r.imageUrls.join(',') : null,
        'Trọng lượng': r.weightGrams ?? null,
        'Tích điểm': null,
        'Đang kinh doanh': 1,
        'Được bán trực tiếp': 1,
        'Mô tả': r.description ?? null,
        'Mẫu ghi chú': null,
        'Vị trí': null,
        'Hàng thành phần': null,
      };
      return PRODUCT_HEADERS.map((h) => v[h]);
    }),
  );
}
