/** Remove Vietnamese diacritics so "Xe điều khiển" can be searched as "xe dieu khien". */
export function removeVietnameseDiacritics(input: string): string {
  return input.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

/** Lowercase, diacritic-free, whitespace-collapsed form used for search keys. */
export function toSearchKey(input: string): string {
  return removeVietnameseDiacritics(input).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** URL/code friendly slug: "Xe điều khiển 4WD" -> "xe-dieu-khien-4wd". */
export function slugify(input: string): string {
  return toSearchKey(input)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
