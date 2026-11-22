import { removeVietnameseDiacritics } from './text.js';

/** Normalise one SKU segment: uppercase, no diacritics, A-Z0-9 only. */
export function skuSegment(input: string): string {
  return removeVietnameseDiacritics(input)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

/**
 * Build a variant SKU from a product code and option values, e.g.
 * buildSku('XE4WD', ['Đỏ', 'Lớn']) -> "XE4WD-DO-LON".
 */
export function buildSku(productCode: string, optionValues: readonly string[] = []): string {
  const parts = [productCode, ...optionValues].map(skuSegment).filter(Boolean);
  if (parts.length === 0) throw new Error('SKU would be empty');
  return parts.join('-');
}

/** Cartesian product of option values, used to generate the variant matrix. */
export function variantMatrix(options: readonly (readonly string[])[]): string[][] {
  return options.reduce<string[][]>(
    (acc, values) => acc.flatMap((combo) => values.map((v) => [...combo, v])),
    [[]],
  );
}
