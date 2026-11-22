/** Shapes of /api/stock-documents shared by the document pages. */
export type DocType = 'receipt' | 'count';
export type DocStatus = 'draft' | 'confirmed' | 'cancelled';

export interface DocLine {
  sku: string;
  name: string;
  optionValues: string[] | null;
  quantity: number;
  unitCost: number | null;
  onHand: number;
  inKiotviet: boolean;
}
export interface DocDetail {
  document: {
    code: string;
    type: DocType;
    status: DocStatus;
    reason: string | null;
    warehouse: { code: string; name: string };
    createdAt: string;
    confirmedAt: string | null;
    cancelledAt: string | null;
    exportedToKiotvietAt: string | null;
    lines: DocLine[];
  };
  kiotviet: { missingSkus: string[] };
}

export const TYPE_LABEL: Record<DocType, string> = { receipt: 'Phiếu nhập hàng', count: 'Phiếu kiểm kho' };
export const STATUS_LABEL: Record<DocStatus, { label: string; tone: 'neutral' | 'success' | 'warn' }> = {
  draft: { label: 'Nháp', tone: 'neutral' },
  confirmed: { label: 'Đã xác nhận', tone: 'success' },
  cancelled: { label: 'Đã hủy', tone: 'warn' },
};

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
