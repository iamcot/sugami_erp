import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';

export type CellValue = string | number | boolean | Date | null;
export type SheetRow = { row: number; values: Record<string, CellValue> };

/** File structure problem (wrong file, missing columns): nothing can be imported. */
export class KiotVietFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KiotVietFormatError';
  }
}

function normalizeCell(v: ExcelJS.CellValue): CellValue {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim();
  if (typeof v === 'object') {
    if ('richText' in v) return normalizeCell(v.richText.map((t) => t.text).join(''));
    if ('result' in v) return normalizeCell((v.result ?? null) as ExcelJS.CellValue);
    if ('text' in v) return normalizeCell(String(v.text));
    if ('error' in v) return null;
  }
  return String(v);
}

/**
 * Read the first sheet: row 1 = headers, later rows keyed by header name. Empty rows are skipped.
 * Uses the streaming reader with styles ignored: KiotViet files have no styles part, which the
 * regular exceljs loader cannot handle. Without styles, dates arrive as Excel serial numbers (see excelDate).
 */
export async function readFirstSheet(
  data: ArrayBuffer | Uint8Array,
): Promise<{ headers: string[]; rows: SheetRow[] }> {
  const buf = Buffer.from(data instanceof Uint8Array ? data : new Uint8Array(data));
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from([buf]), {
    styles: 'ignore',
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    worksheets: 'emit',
    entries: 'emit',
  });
  let headers: string[] = [];
  const rows: SheetRow[] = [];
  let sawSheet = false;
  try {
    for await (const ws of reader) {
      sawSheet = true;
      for await (const r of ws) {
        const cells = (r.values as ExcelJS.CellValue[]).slice(1);
        if (r.number === 1) {
          headers = cells.map((c) => String(normalizeCell(c) ?? '').trim());
          continue;
        }
        const values: Record<string, CellValue> = {};
        let any = false;
        headers.forEach((h, i) => {
          if (!h) return;
          const v = normalizeCell(cells[i] ?? null);
          values[h] = v;
          if (v !== null) any = true;
        });
        if (any) rows.push({ row: r.number, values });
      }
      break;
    }
  } catch {
    throw new KiotVietFormatError('Không đọc được file. Hãy dùng file .xlsx xuất từ KiotViet.');
  }
  if (!sawSheet) throw new KiotVietFormatError('Không đọc được file. Hãy dùng file .xlsx xuất từ KiotViet.');
  return { headers: headers.filter(Boolean), rows };
}

export function requireColumns(headers: string[], required: readonly string[], fileLabel: string): void {
  const missing = required.filter((c) => !headers.includes(c));
  if (missing.length) {
    throw new KiotVietFormatError(
      `Không phải file ${fileLabel} của KiotViet: thiếu cột ${missing.join(', ')}`,
    );
  }
}

export const str = (v: CellValue): string | null => (v === null ? null : String(v).trim() || null);

/** Number cell (KiotViet writes numbers as numbers, sometimes as "1,234.5" text). */
export function num(v: CellValue): number | null {
  if (v === null || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

/** KiotViet times are Vietnam local time (UTC+7) without a zone. */
const VN_OFFSET_MS = 7 * 3600 * 1000;

/**
 * Cell → Date: Excel serial number (days since 1899-12-30, VN local time), a Date, or text
 * "dd/MM/yyyy HH:mm[:ss]" / "yyyy-MM-dd HH:mm:ss[.SSS]" (VN local time).
 */
export function excelDate(v: CellValue): Date | null {
  if (v === null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400000) - VN_OFFSET_MS);
  const s = String(v).trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m)
    return new Date(
      Date.UTC(+m[3]!, +m[2]! - 1, +m[1]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)) - VN_OFFSET_MS,
    );
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?$/.exec(s);
  if (m) {
    const ms = m[7] ? Math.round(Number(`0.${m[7]}`) * 1000) : 0;
    return new Date(
      Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), ms) - VN_OFFSET_MS,
    );
  }
  return null;
}

/** Write one sheet (row 1 = headers) to .xlsx bytes. Used for exports in KiotViet's import formats and test files. */
export async function writeSheet(
  sheetName: string,
  headers: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRow([...headers]);
  for (const r of rows) ws.addRow(r.map((c) => (c === undefined ? null : c)));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
