/** Shapes of GET /api/inventory and stock colouring shared by pages. */
export interface InventoryRow {
  id: string;
  sku: string;
  productCode: string;
  productName: string;
  optionValues: string[] | null;
  minStock: number;
  costAvg: number;
  onHand: number;
  value: number;
  byWarehouse: Record<string, number>;
}
export interface InventoryResponse {
  warehouses: { code: string; name: string }[];
  data: InventoryRow[];
  total: number;
  totals: { skus: number; units: number; value: number; negative: number; out: number };
}

/** Colour by stock level: negative red, zero grey, at/below minimum amber. */
export function stockTone(qty: number, min = 0) {
  if (qty < 0) return 'font-medium text-rose-600';
  if (qty === 0) return 'text-slate-400';
  if (min > 0 && qty <= min) return 'font-medium text-amber-600';
  return '';
}
