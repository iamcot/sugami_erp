/**
 * Money is stored as integers: VND in đồng, CNY in fen (1/100 yuan).
 */

const vndFormatter = new Intl.NumberFormat('vi-VN');

/** Format an integer VND amount, e.g. 1250000 -> "1.250.000 ₫". */
export function formatVnd(amount: number | bigint): string {
  return `${vndFormatter.format(amount)} ₫`;
}

/** Format CNY stored in fen, e.g. 1999 -> "¥19.99". */
export function formatCnyFen(fen: number): string {
  if (!Number.isInteger(fen)) throw new TypeError('fen must be an integer');
  const sign = fen < 0 ? '-' : '';
  const abs = Math.abs(fen);
  return `${sign}¥${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Convert CNY (fen) to VND (đồng) with a VND-per-yuan rate, rounded to the nearest đồng.
 * Example: 1999 fen at 3650 VND/CNY -> 72964.
 */
export function cnyFenToVnd(fen: number, vndPerCny: number): number {
  if (!Number.isInteger(fen)) throw new TypeError('fen must be an integer');
  if (!(vndPerCny > 0)) throw new RangeError('vndPerCny must be positive');
  return Math.round((fen * vndPerCny) / 100);
}

/**
 * Split an integer total across weights so the parts always sum exactly to the total
 * (largest remainder method). Used for landed-cost allocation.
 */
export function allocateByWeight(total: number, weights: readonly number[]): number[] {
  if (!Number.isInteger(total)) throw new TypeError('total must be an integer');
  if (weights.some((w) => w < 0 || !Number.isFinite(w))) throw new RangeError('weights must be >= 0');
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum === 0)
    return allocateByWeight(
      total,
      weights.map(() => 1),
    );

  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map((x) => Math.floor(x));
  let remainder = total - parts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) {
    const idx = order[k]!.i;
    parts[idx] = parts[idx]! + 1;
  }
  return parts;
}
