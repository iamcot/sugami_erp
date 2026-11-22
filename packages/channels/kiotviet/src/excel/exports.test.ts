import { describe, expect, it } from 'vitest';
import {
  PRODUCT_HEADERS,
  productTemplateFile,
  PURCHASE_ORDER_HEADERS,
  purchaseOrderFile,
  STOCK_TAKE_HEADERS,
  stockTakeFile,
} from './exports.js';
import { parseProductList } from './products.js';
import { readFirstSheet } from './sheet.js';
import ExcelJS from 'exceljs';

const sheetName = async (buf: Buffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb.worksheets.map((w) => w.name);
};

describe('KiotViet import files', () => {
  it('writes a purchase order with the template columns and merges duplicate SKUs', async () => {
    const buf = await purchaseOrderFile([
      { sku: 'SP000001', name: 'Xe', unitCost: 100000, quantity: 2 },
      { sku: 'SP000002', unitCost: 50000, quantity: 1 },
      { sku: 'SP000001', name: 'Xe', unitCost: 130000, quantity: 1 },
    ]);
    expect(await sheetName(buf)).toEqual(['PurchaseOrderTemplate']);
    const { headers, rows } = await readFirstSheet(buf);
    expect(headers).toEqual([...PURCHASE_ORDER_HEADERS]);
    expect(rows.map((r) => [r.values['Mã hàng'], r.values['Đơn giá'], r.values['Số lượng']])).toEqual([
      ['SP000001', 110000, 3],
      ['SP000002', 50000, 1],
    ]);
  });

  it('writes a stock take with counted quantities, last count per SKU wins', async () => {
    const buf = await stockTakeFile([
      { sku: 'A', quantity: 3 },
      { sku: 'B', quantity: 0 },
      { sku: 'A', quantity: 5 },
    ]);
    expect(await sheetName(buf)).toEqual(['StockTakeTemplate']);
    const { headers, rows } = await readFirstSheet(buf);
    expect(headers).toEqual([...STOCK_TAKE_HEADERS]);
    expect(rows.map((r) => [r.values['Mã hàng'], r.values['Số lượng']])).toEqual([
      ['A', 5],
      ['B', 0],
    ]);
  });

  it('writes new products that our own KiotViet list parser reads back', async () => {
    const buf = await productTemplateFile([
      {
        sku: 'SP900001',
        name: 'Xe đua',
        category: 'Bé chơi',
        price: 150000,
        cost: 90000,
        attributes: [['MÀU', 'Đỏ']],
      },
      {
        sku: 'SP900002',
        name: 'Xe đua',
        category: 'Bé chơi',
        price: 150000,
        cost: 90000,
        attributes: [['MÀU', 'Xanh: nhạt']],
        parentSku: 'SP900001',
      },
    ]);
    expect(await sheetName(buf)).toEqual(['ProductTemplate']);
    const { headers } = await readFirstSheet(buf);
    expect(headers).toEqual([...PRODUCT_HEADERS]);
    const parsed = await parseProductList(buf);
    expect(parsed.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0]!.variants.map((v) => [v.sku, v.parentSku, v.price, v.onHand, v.active])).toEqual([
      ['SP900001', null, 150000, 0, true],
      ['SP900002', 'SP900001', 150000, 0, true],
    ]);
    expect(parsed.groups[0]!.variants.map((v) => v.optionValues)).toEqual([['Đỏ'], ['Xanh: nhạt']]);
  });
});
