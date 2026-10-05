/**
 * Shopper condition filter, read through the one condition vocabulary (shopper condition wording, 2026-10-04).
 *
 * Item.condition is stored as NEW, USED, REFURBISHED or PARTS_OR_REPAIR, but older rows (and older bookmarked
 * filter links) carry legacy words: LIKE_NEW, EXCELLENT, GOOD, FAIR, POOR and the like. A plain equality filter on
 * the raw value therefore returned nothing for the shopper filter values the UI used to offer (mint, excellent,
 * good, fair, poor, Very Good) against rows stored as USED.
 *
 * conditionFilterValues turns whatever the shopper sent into the list of stored spellings that mean the same
 * canonical condition, so every shopper query (items search, /api/search, saved-search alerts) matches both new
 * and legacy rows. Matching is case-insensitive, and spaces and underscores are interchangeable ("Like New" and
 * LIKE_NEW). canonicalConditionCounts folds raw facet counts onto the canonical four the same way.
 *
 * PURE: no prisma, no services.
 */
import { CANONICAL_CONDITIONS, CanonicalCondition, normalizeCondition } from './conditionMapping';

/** Every stored spelling that reads as each canonical condition (canonical word first). Upper case, underscores. */
const STORED_SPELLINGS: Record<CanonicalCondition, readonly string[]> = {
  NEW: ['NEW'],
  USED: [
    'USED', 'LIKE_NEW', 'EXCELLENT', 'GOOD', 'FAIR',
    'USED_EXCELLENT', 'USED_VERY_GOOD', 'USED_GOOD', 'USED_ACCEPTABLE', 'USED_LIKE_NEW', 'USED_FAIR',
  ],
  REFURBISHED: ['REFURBISHED', 'SELLER_REFURBISHED'],
  PARTS_OR_REPAIR: ['PARTS_OR_REPAIR', 'POOR', 'PARTS', 'FOR_PARTS', 'FOR_PARTS_OR_NOT_WORKING'],
};

/**
 * Words the old shopper filters offered that the condition model does not read as a condition. They were
 * used-goods wording ("Very Good", "mint"), so a bookmarked link with one of them keeps meaning Used.
 */
const LEGACY_FILTER_ALIASES: Record<string, CanonicalCondition> = {
  VERY_GOOD: 'USED',
  MINT: 'USED',
  ACCEPTABLE: 'USED',
};

function keyOf(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

/** The canonical condition a shopper filter value stands for, or null when it is empty or not recognized. */
export function canonicalConditionForFilter(raw: unknown): CanonicalCondition | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  const normalized = normalizeCondition(raw).condition;
  if (normalized) return normalized;
  return LEGACY_FILTER_ALIASES[keyOf(raw)] ?? null;
}

/**
 * Stored values to match for a shopper condition filter, upper case (compare with UPPER(column) or a
 * case-insensitive Prisma filter). Includes the space-separated spelling of each multi-word value.
 * Returns null when there is no filter. An unrecognized value falls back to exact, case-insensitive
 * matching of what was sent, which is what the filter did before.
 */
export function conditionFilterValues(raw: unknown): string[] | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  const canonical = canonicalConditionForFilter(raw);
  if (!canonical) return [raw.trim().toUpperCase()];
  const out = new Set<string>();
  for (const spelling of STORED_SPELLINGS[canonical]) {
    out.add(spelling);
    if (spelling.includes('_')) out.add(spelling.replace(/_/g, ' '));
  }
  return Array.from(out);
}

/**
 * Fold raw per-value counts (a groupBy on Item.condition) onto the canonical conditions. A recognized legacy
 * value counts toward its canonical condition; an unrecognized value keeps its own name. Canonical conditions
 * come first in a fixed order, then any unrecognized names by count.
 */
export function canonicalConditionCounts(
  rows: ReadonlyArray<{ name: string; count: number }>,
): { name: string; count: number }[] {
  const canonicalTotals = new Map<CanonicalCondition, number>();
  const other = new Map<string, number>();
  for (const row of rows) {
    const canonical = normalizeCondition(row.name).condition;
    if (canonical) canonicalTotals.set(canonical, (canonicalTotals.get(canonical) ?? 0) + row.count);
    else other.set(row.name, (other.get(row.name) ?? 0) + row.count);
  }
  const result: { name: string; count: number }[] = [];
  for (const c of CANONICAL_CONDITIONS) {
    const count = canonicalTotals.get(c);
    if (count) result.push({ name: c, count });
  }
  const rest = Array.from(other.entries()).sort((a, b) => b[1] - a[1]);
  for (const [name, count] of rest) result.push({ name, count });
  return result;
}
