import { type CellValue, num, readFirstSheet, requireColumns, type SheetRow, str } from './sheet.js';

export interface ImportIssue {
  row: number;
  sku?: string;
  level: 'error' | 'warning';
  message: string;
}

export interface KvProductRow {
  row: number;
  sku: string;
  /** "Mã HH Liên quan": the group's parent SKU, null on parent/standalone rows. */
  parentSku: string | null;
  name: string;
  /** Category path, top first ("Bé chơi" or ["Bé chơi", "Xe"]). */
  categoryPath: string[];
  brand: string | null;
  /** VND, rounded. */
  price: number;
  /** VND, rounded. */
  cost: number;
  onHand: number;
  minStock: number;
  barcode: string | null;
  weightGrams: number | null;
  attributes: { name: string; value: string }[];
  imageUrls: string[];
  description: string | null;
  active: boolean;
}

export interface KvVariant extends KvProductRow {
  /** Values in the group's optionNames order ('' when the row has no value for that option). */
  optionValues: string[];
}

export interface KvProductGroup {
  /** Product code = parent SKU. */
  code: string;
  name: string;
  categoryPath: string[];
  brand: string | null;
  description: string | null;
  optionNames: string[];
  variants: KvVariant[];
}

export const PRODUCT_LIST_COLUMNS = ['Mã hàng', 'Tên hàng', 'Giá bán', 'Giá vốn', 'Tồn kho'] as const;

/** Category groups that hold fee lines, not goods. */
const FEE_CATEGORIES = new Set(['order', 'ship']);

/** "LOẠI:Tím: Hiện đại|MÀU:Đỏ" → [{LOẠI, "Tím: Hiện đại"}, {MÀU, Đỏ}] (split at the first ':'). */
export function parseAttributes(raw: string | null): { name: string; value: string }[] {
  if (!raw) return [];
  return raw
    .split('|')
    .map((part) => {
      const i = part.indexOf(':');
      return i < 0
        ? { name: 'Phân loại', value: part.trim() }
        : { name: part.slice(0, i).trim(), value: part.slice(i + 1).trim() };
    })
    .filter((a) => a.name && a.value);
}

function parseRow({ row, values }: SheetRow, issues: ImportIssue[]): KvProductRow | null {
  const v = (col: string): CellValue => values[col] ?? null;
  const sku = str(v('Mã hàng'));
  if (!sku) {
    issues.push({ row, level: 'error', message: 'Thiếu mã hàng' });
    return null;
  }
  const name = str(v('Tên hàng'));
  if (!name) {
    issues.push({ row, sku, level: 'error', message: 'Thiếu tên hàng' });
    return null;
  }
  const n = (col: string, fallback: number | null = 0) => {
    const x = num(v(col));
    if (Number.isNaN(x)) {
      issues.push({ row, sku, level: 'error', message: `Cột "${col}" không phải số: ${String(v(col))}` });
      return fallback;
    }
    return x ?? fallback;
  };
  const price = n('Giá bán')!;
  const cost = n('Giá vốn')!;
  const onHand = n('Tồn kho')!;
  if (price < 0 || cost < 0) issues.push({ row, sku, level: 'error', message: 'Giá bán/giá vốn âm' });
  if (price === 0) issues.push({ row, sku, level: 'warning', message: 'Giá bán bằng 0' });
  if (onHand < 0) issues.push({ row, sku, level: 'warning', message: `Tồn kho âm (${onHand})` });
  if (!Number.isInteger(onHand))
    issues.push({ row, sku, level: 'warning', message: `Tồn kho lẻ (${onHand})` });
  const weight = n('Trọng lượng', null);
  const active = v('Đang kinh doanh') === null ? true : num(v('Đang kinh doanh')) !== 0;
  return {
    row,
    sku,
    parentSku: str(v('Mã HH Liên quan')),
    name,
    categoryPath: (str(v('Nhóm hàng(3 Cấp)')) ?? '')
      .split('>>')
      .map((s) => s.trim())
      .filter(Boolean),
    brand: str(v('Thương hiệu')),
    price: Math.round(price),
    cost: Math.round(cost),
    onHand,
    minStock: Math.max(0, n('Tồn nhỏ nhất') ?? 0),
    barcode: str(v('Mã vạch')),
    weightGrams: weight && weight > 0 ? Math.round(weight) : null,
    attributes: parseAttributes(str(v('Thuộc tính'))),
    imageUrls: (str(v('Hình ảnh (url1,url2...)')) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^https?:\/\//.test(s)),
    description: str(v('Mô tả')),
    active,
  };
}

/** Group rows into products by "Mã HH Liên quan"; build option names and aligned option values. */
export function groupProductRows(items: KvProductRow[], issues: ImportIssue[]): KvProductGroup[] {
  const bySku = new Map<string, KvProductRow>();
  for (const it of items) {
    if (bySku.has(it.sku)) {
      issues.push({
        row: it.row,
        sku: it.sku,
        level: 'error',
        message: `Mã hàng bị trùng (dòng ${bySku.get(it.sku)!.row})`,
      });
      continue;
    }
    bySku.set(it.sku, it);
  }
  const barcodes = new Map<string, string>();
  for (const it of bySku.values()) {
    if (!it.barcode) continue;
    const other = barcodes.get(it.barcode);
    if (other) {
      issues.push({
        row: it.row,
        sku: it.sku,
        level: 'warning',
        message: `Mã vạch ${it.barcode} trùng với ${other}, bỏ mã vạch`,
      });
      it.barcode = null;
    } else barcodes.set(it.barcode, it.sku);
  }

  const members = new Map<string, KvProductRow[]>();
  for (const it of bySku.values()) {
    let root = it.parentSku ?? it.sku;
    if (it.parentSku && !bySku.has(it.parentSku)) {
      issues.push({
        row: it.row,
        sku: it.sku,
        level: 'warning',
        message: `Mã hàng liên quan ${it.parentSku} không có trong file, tách thành sản phẩm riêng`,
      });
      root = it.sku;
    } else if (it.parentSku && bySku.get(it.parentSku)!.parentSku) {
      // Chains (A → B → C) are not produced by KiotViet; attach to B's root.
      root = bySku.get(it.parentSku)!.parentSku!;
    }
    const list = members.get(root) ?? [];
    list.push(it);
    members.set(root, list);
  }

  const groups: KvProductGroup[] = [];
  for (const [code, rows] of members) {
    const parent = bySku.get(code) ?? rows[0]!;
    rows.sort((a, b) => (a.sku === code ? -1 : b.sku === code ? 1 : a.row - b.row));
    const optionNames: string[] = [];
    for (const r of rows)
      for (const a of r.attributes) if (!optionNames.includes(a.name)) optionNames.push(a.name);
    const seen = new Map<string, string>();
    const variants = rows.map((r): KvVariant => {
      const optionValues = optionNames.map((n) => r.attributes.find((a) => a.name === n)?.value ?? '');
      const combo = optionValues.join('|');
      if (rows.length > 1 && seen.has(combo)) {
        issues.push({
          row: r.row,
          sku: r.sku,
          level: 'warning',
          message: `Trùng phân loại với ${seen.get(combo)}`,
        });
      }
      seen.set(combo, r.sku);
      return { ...r, optionValues };
    });
    groups.push({
      code,
      name: parent.name,
      categoryPath: parent.categoryPath,
      brand: parent.brand,
      description: parent.description ?? rows.find((r) => r.description)?.description ?? null,
      optionNames,
      variants,
    });
  }
  return groups;
}

export const isFeeGroup = (g: Pick<KvProductGroup, 'categoryPath'>) =>
  g.categoryPath.length === 1 && FEE_CATEGORIES.has(g.categoryPath[0]!.toLowerCase());

export interface ParsedProductList {
  groups: KvProductGroup[];
  rowCount: number;
  issues: ImportIssue[];
}

/** Parse "DanhSachSanPham_KV*.xlsx" (Hàng hóa → Xuất file). See docs/kiotviet-excel.md §1. */
export async function parseProductList(data: ArrayBuffer | Uint8Array): Promise<ParsedProductList> {
  const { headers, rows } = await readFirstSheet(data);
  requireColumns(headers, PRODUCT_LIST_COLUMNS, 'danh sách hàng hóa');
  const issues: ImportIssue[] = [];
  const items = rows.map((r) => parseRow(r, issues)).filter((x): x is KvProductRow => x !== null);
  const groups = groupProductRows(items, issues);
  issues.sort((a, b) => a.row - b.row);
  return { groups, rowCount: rows.length, issues };
}

export type { CellValue };
