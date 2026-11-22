import { describe, expect, it } from 'vitest';
import { parseAttributes, parseProductList } from './products.js';
import { excelDate, KiotVietFormatError, readFirstSheet, writeSheet } from './sheet.js';

const H = [
  'Loại hàng',
  'Nhóm hàng(3 Cấp)',
  'Mã hàng',
  'Mã vạch',
  'Tên hàng',
  'Thương hiệu',
  'Giá bán',
  'Giá vốn',
  'Tồn kho',
  'Tồn nhỏ nhất',
  'Thuộc tính',
  'Mã HH Liên quan',
  'Hình ảnh (url1,url2...)',
  'Trọng lượng',
  'Đang kinh doanh',
  'Mô tả',
];
type R = Partial<Record<(typeof H)[number], string | number | null>>;
const file = (rows: R[]) =>
  writeSheet(
    'Sheet1',
    H,
    rows.map((r) => H.map((h) => r[h] ?? null)),
  );
const row = (sku: string, extra: R = {}): R => ({
  'Mã hàng': sku,
  'Tên hàng': `Hàng ${sku}`,
  'Giá bán': 100000,
  'Giá vốn': 50000,
  'Tồn kho': 3,
  'Nhóm hàng(3 Cấp)': 'Bé chơi',
  ...extra,
});

describe('parseAttributes', () => {
  it('splits at the first colon and on |', () => {
    expect(parseAttributes('LOẠI:Tím: Hiện đại|MÀU:Đỏ')).toEqual([
      { name: 'LOẠI', value: 'Tím: Hiện đại' },
      { name: 'MÀU', value: 'Đỏ' },
    ]);
    expect(parseAttributes(null)).toEqual([]);
  });
});

describe('parseProductList', () => {
  it('groups variants under the parent code with aligned option values', async () => {
    const r = await parseProductList(
      await file([
        row('SP1', { 'Thuộc tính': 'Phân loại:Gia đình|Số lượng:1 set', 'Giá vốn': 8890.22 }),
        row('SP2', {
          'Mã HH Liên quan': 'SP1',
          'Thuộc tính': 'Phân loại:Hoa lá|Số lượng:Combo 4',
          'Tên hàng': 'Khác tên',
        }),
        row('SP3', { 'Mã HH Liên quan': 'SP1', 'Thuộc tính': 'Phân loại:Hoa lá' }),
        row('Y95D', {
          'Nhóm hàng(3 Cấp)': 'Bé chơi>>Xe',
          'Hình ảnh (url1,url2...)': 'https://a/1.jpg,https://a/2.jpg',
          'Trọng lượng': 0,
        }),
      ]),
    );
    expect(r.rowCount).toBe(4);
    expect(r.groups).toHaveLength(2);
    const g = r.groups.find((x) => x.code === 'SP1')!;
    expect(g.name).toBe('Hàng SP1');
    expect(g.optionNames).toEqual(['Phân loại', 'Số lượng']);
    expect(g.variants.map((v) => [v.sku, v.optionValues])).toEqual([
      ['SP1', ['Gia đình', '1 set']],
      ['SP2', ['Hoa lá', 'Combo 4']],
      ['SP3', ['Hoa lá', '']],
    ]);
    expect(g.variants[0]!.cost).toBe(8890);
    const y = r.groups.find((x) => x.code === 'Y95D')!;
    expect(y.categoryPath).toEqual(['Bé chơi', 'Xe']);
    expect(y.variants[0]!.imageUrls).toHaveLength(2);
    expect(y.variants[0]!.weightGrams).toBeNull();
    expect(r.issues).toEqual([]);
  });

  it('reports row problems', async () => {
    const r = await parseProductList(
      await file([
        row('A', { 'Tồn kho': -5, 'Giá bán': 0, 'Mã vạch': '893' }),
        row('A'),
        row('B', { 'Mã HH Liên quan': 'MISSING', 'Mã vạch': '893' }),
        { 'Tên hàng': 'Không mã' },
        row('C', { 'Giá bán': 'abc' }),
      ]),
    );
    const msgs = r.issues.map((i) => `${i.level}:${i.sku ?? '-'}:${i.message}`);
    expect(msgs).toEqual(
      expect.arrayContaining([
        'warning:A:Tồn kho âm (-5)',
        'warning:A:Giá bán bằng 0',
        'error:A:Mã hàng bị trùng (dòng 2)',
        'warning:B:Mã vạch 893 trùng với A, bỏ mã vạch',
        'warning:B:Mã hàng liên quan MISSING không có trong file, tách thành sản phẩm riêng',
        'error:-:Thiếu mã hàng',
        'error:C:Cột "Giá bán" không phải số: abc',
      ]),
    );
    expect(r.groups.map((g) => g.code).sort()).toEqual(['A', 'B', 'C']);
  });

  it('rejects files that are not a product list', async () => {
    await expect(
      parseProductList(await writeSheet('x', ['Mã hàng', 'Số lượng'], [['A', 1]])),
    ).rejects.toThrow(/thiếu cột Tên hàng/);
    await expect(readFirstSheet(new TextEncoder().encode('not a zip'))).rejects.toBeInstanceOf(
      KiotVietFormatError,
    );
  });
});

describe('excelDate', () => {
  it('reads serials and KiotViet text formats as Vietnam time', () => {
    expect(excelDate(46342.5)?.toISOString()).toBe('2026-11-16T05:00:00.000Z');
    expect(excelDate('21/11/2026 18:50')?.toISOString()).toBe('2026-11-21T11:50:00.000Z');
    expect(excelDate('2026-11-16 15:55:01.880000')?.toISOString()).toBe('2026-11-16T08:55:01.880Z');
    expect(excelDate('--')).toBeNull();
  });
});
