/**
 * Bulk "category" operation value normalizer.
 *
 * The Review page's EbayCategoryPicker sends eBay top-level names such as "Home & Garden" or
 * "Books & Magazines", while older data uses 14 lowercase legacy names. Any clean string is accepted;
 * a case-insensitive match to a legacy name is canonicalized to lowercase so existing data stays
 * consistent, and every other value keeps its casing and punctuation.
 */
export const LEGACY_CATEGORY_NAMES = [
  'furniture', 'decor', 'vintage', 'textiles', 'collectibles',
  'art', 'antiques', 'jewelry', 'books', 'tools',
  'electronics', 'clothing', 'home', 'other',
] as const;

export function normalizeBulkCategoryValue(
  value: unknown,
): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof value !== 'string') {
    return { ok: false, message: 'category value must be a non-empty string.' };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, message: 'category value must be a non-empty string.' };
  }
  // eslint-disable-next-line no-control-regex
  if (trimmed.length > 200 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    return { ok: false, message: 'category must be 1 to 200 characters with no control characters.' };
  }
  const lower = trimmed.toLowerCase();
  const legacy = (LEGACY_CATEGORY_NAMES as readonly string[]).find((name) => name === lower);
  return { ok: true, value: legacy ?? trimmed };
}
