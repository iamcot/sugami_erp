import { allocateByWeight, cnyFenToVnd } from './money.js';

export interface PurchaseLineInput {
  qty: number;
  /** Price per unit in the order's currency, minor units (đồng for VND, fen for CNY). */
  unitPrice: number;
}

export interface LandedLine {
  /** qty × unit price in VND. */
  valueVnd: number;
  /** This line's share of the extra costs (shipping, fees), VND. */
  extraVnd: number;
  /** (value + extra) / qty, rounded to the nearest đồng: the cost booked into stock. */
  unitCost: number;
}

/**
 * Landed cost per line: price converted to VND, plus extra costs spread by line value
 * (shares always add up to the total). Used when goods are received.
 */
export function landedCosts(
  lines: readonly PurchaseLineInput[],
  opts: { currency: 'VND' | 'CNY'; fxRate?: number | null; extraCostVnd: number },
): LandedLine[] {
  if (opts.currency === 'CNY' && !(Number(opts.fxRate) > 0)) throw new RangeError('Thiếu tỷ giá CNY/VND');
  const values = lines.map((l) => {
    const unitVnd = opts.currency === 'CNY' ? cnyFenToVnd(l.unitPrice, Number(opts.fxRate)) : l.unitPrice;
    return Math.round(l.qty * unitVnd);
  });
  const extra = lines.length ? allocateByWeight(opts.extraCostVnd, values) : [];
  return lines.map((l, i) => ({
    valueVnd: values[i]!,
    extraVnd: extra[i]!,
    unitCost: l.qty > 0 ? Math.round((values[i]! + extra[i]!) / l.qty) : 0,
  }));
}
