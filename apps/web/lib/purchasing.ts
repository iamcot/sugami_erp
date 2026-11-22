/** Shapes of /api/purchase-orders shared by the purchasing pages. */
import { formatCnyFen, formatVnd } from '@sugami/shared';

export type PoStatus = 'draft' | 'ordered' | 'received' | 'cancelled';

export interface PoLine {
  sku: string;
  name: string;
  option: string;
  qty: number;
  /** Minor units of the order currency. */
  unitPrice: number;
  valueVnd: number;
  extraVnd: number;
  unitCost: number;
  currentCost: number;
}
export interface PoDetail {
  code: string;
  status: PoStatus;
  supplierId: string | null;
  supplier: string | null;
  currency: 'VND' | 'CNY';
  fxRate: number | null;
  note: string | null;
  warehouse: string;
  orderedAt: string | null;
  receivedAt: string | null;
  stockDocument: string | null;
  costs: { label: string; amount: number }[];
  lines: PoLine[];
}

export const STATUS_LABEL: Record<PoStatus, string> = {
  draft: 'Nháp',
  ordered: 'Đã đặt hàng',
  received: 'Đã nhận',
  cancelled: 'Đã hủy',
};
export const STATUS_TONE: Record<PoStatus, 'neutral' | 'brand' | 'success' | 'danger'> = {
  draft: 'neutral',
  ordered: 'brand',
  received: 'success',
  cancelled: 'danger',
};

export const money = (minor: number, currency: 'VND' | 'CNY') =>
  currency === 'CNY' ? formatCnyFen(minor) : formatVnd(minor);
