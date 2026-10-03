/**
 * itemFieldRelevance
 *
 * Pure helpers (no React, no browser APIs) that decide which optional item-detail
 * fields are worth showing up front, based on the item's category text. Used by the
 * Edit Item page (and later the shared item form) for progressive disclosure.
 *
 * RULES (these are the contract the UI relies on):
 *  1. A field that already has a value is ALWAYS shown expanded. Relevance never hides data.
 *  2. A group that is irrelevant AND empty renders collapsed, with a "Show all fields"
 *     control that expands everything. Nothing is ever unreachable.
 *  3. A relevant group is open by default.
 *  4. Condition and condition grade are NOT gated here at all. This module never looks
 *     at a condition value.
 *
 * Matching is case-insensitive on the lowercased category text (the top-level category
 * plus the eBay leaf category name). Matching is anchored to word starts (not raw
 * substring) so "tool" matches "Tools & Workshop" but not "Bar Stools".
 */

/** Anything that can carry a value in the UI: strings, numbers, null, undefined. */
export type MaybeValue = string | number | null | undefined;

/**
 * Each category family has two keyword lists:
 *  - prefix: matches the start of a word ("accessor" matches accessory and accessories).
 *  - whole:  matches a whole word with an optional plural ("tool" matches tools but not
 *            stool; "dress" matches dresses but not dresser).
 */
export interface KeywordSet {
  prefix: readonly string[];
  whole: readonly string[];
}

const BOOK_MEDIA_KEYWORDS: KeywordSet = {
  prefix: ['book', 'magazine', 'comic', 'media'],
  whole: [],
};

const APPAREL_KEYWORDS: KeywordSet = {
  prefix: ['apparel', 'clothing', 'clothes', 'sneaker', 'accessor', 'handbag', 'jewel'],
  whole: ['shoe', 'boot', 'bag', 'purse', 'wallet', 'dress', 'shirt', 'jacket', 'coat', 'jeans', 'pants'],
};

const PRODUCT_ID_KEYWORDS: KeywordSet = {
  prefix: ['electronic', 'computer', 'camera', 'musical'],
  whole: ['tool', 'video game'],
};

/** Lowercase, collapse whitespace, decode the one HTML entity category strings carry. */
export function normalizeCategoryText(
  category?: string | null,
  ebayCategoryName?: string | null
): string {
  return `${category ?? ''} ${ebayCategoryName ?? ''}`
    .replace(/&amp;/gi, '&')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeRegExp = (kw: string) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when any keyword in the set matches the (already normalized) text. */
export function matchesAnyKeyword(text: string, keywords: KeywordSet): boolean {
  if (!text) return false;
  const prefixHit = keywords.prefix.some((kw) =>
    new RegExp(`(^|[^a-z0-9])${escapeRegExp(kw)}`).test(text)
  );
  if (prefixHit) return true;
  return keywords.whole.some((kw) =>
    new RegExp(`(^|[^a-z0-9])${escapeRegExp(kw)}(s|es)?([^a-z0-9]|$)`).test(text)
  );
}

/** ISBN is relevant for book, magazine, comic and media categories. */
export function isIsbnRelevant(category?: string | null, ebayCategoryName?: string | null): boolean {
  return matchesAnyKeyword(normalizeCategoryText(category, ebayCategoryName), BOOK_MEDIA_KEYWORDS);
}

/** Size, color and material are relevant for apparel-style categories. */
export function isApparelDetailsRelevant(
  category?: string | null,
  ebayCategoryName?: string | null
): boolean {
  return matchesAnyKeyword(normalizeCategoryText(category, ebayCategoryName), APPAREL_KEYWORDS);
}

/** MPN and UPC are relevant for electronics, tools, computers, video games, cameras and musical gear. */
export function isMpnUpcRelevant(category?: string | null, ebayCategoryName?: string | null): boolean {
  return matchesAnyKeyword(normalizeCategoryText(category, ebayCategoryName), PRODUCT_ID_KEYWORDS);
}

/** True when a value is present (non-empty after trimming; numbers count, including 0). */
export function hasValue(v: MaybeValue): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'number') return Number.isFinite(v);
  return String(v).trim().length > 0;
}

/** True when at least one of the values is present. */
export function hasAnyValue(...values: MaybeValue[]): boolean {
  return values.some(hasValue);
}

export interface DisclosureState {
  /** The category makes this group relevant. */
  relevant: boolean;
  /** At least one field in the group already holds a value. */
  hasValue: boolean;
  /** Should the group render expanded right now? */
  open: boolean;
}

/**
 * Product IDs group (MPN, UPC, ISBN). Open when the category makes any of the three
 * relevant, when any of them already has a value, or when the organizer asked to see all fields.
 */
export function getProductIdsDisclosure(opts: {
  category?: string | null;
  ebayCategoryName?: string | null;
  mpn?: MaybeValue;
  upc?: MaybeValue;
  isbn?: MaybeValue;
  showAll?: boolean;
}): DisclosureState {
  const relevant =
    isMpnUpcRelevant(opts.category, opts.ebayCategoryName) ||
    isIsbnRelevant(opts.category, opts.ebayCategoryName);
  const filled = hasAnyValue(opts.mpn, opts.upc, opts.isbn);
  return { relevant, hasValue: filled, open: relevant || filled || !!opts.showAll };
}

/**
 * Size, color, material group. Open when the category is apparel-style, when any of the
 * three already has a value, or when the organizer asked to see all fields.
 */
export function getApparelDetailsDisclosure(opts: {
  category?: string | null;
  ebayCategoryName?: string | null;
  size?: MaybeValue;
  color?: MaybeValue;
  material?: MaybeValue;
  showAll?: boolean;
}): DisclosureState {
  const relevant = isApparelDetailsRelevant(opts.category, opts.ebayCategoryName);
  const filled = hasAnyValue(opts.size, opts.color, opts.material);
  return { relevant, hasValue: filled, open: relevant || filled || !!opts.showAll };
}
