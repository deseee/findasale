/*
 * etsyCategoryHints.ts -- optional hints that map an eBay L1 category name (Item.category, see
 * config/ebayCategories.ts) to Etsy seller-taxonomy NAME PATHS (ADR-135 D3.1, batch E-B3).
 *
 * Dependency-free on purpose (same shape as ebayCategories.ts): no imports, no env, no I/O.
 *
 * Why this is empty today: Etsy's taxonomy tree needs a call to fetch, and that was not made
 * while building. The hints are product choices (which Etsy branch an eBay category belongs in),
 * so they are authored AFTER live test T4 from the real tree and reviewed by Patrick in the PR.
 * Until then the category picker still works: services/marketplace/etsyTaxonomy.ts offers a
 * searchable list of leaf categories plus keyword suggestions (labeled "Suggested") built from
 * the item title.
 *
 * Shape: { '<eBay L1 name>': [ ['<top-level Etsy node name>', '<child node name>', ...], ... ] }
 * Each inner array is one name path from the top of the tree, for example
 * ['Art & Collectibles', 'Collectibles']. A path is resolved at runtime against the cached tree
 * by comparing the joined names (see ETSY_TAXONOMY_PATH_SEPARATOR in etsyTaxonomy.ts), so a wrong
 * or stale name simply matches nothing and the picker falls back to keyword suggestions.
 */

export type EtsyCategoryHintPath = readonly string[];

export const ETSY_CATEGORY_HINTS: Readonly<Record<string, readonly EtsyCategoryHintPath[]>> = {};

/** Separator used to join a name path into the `fullPath` stored on EtsyTaxonomyNode. */
export const ETSY_HINT_PATH_SEPARATOR = ' > ';

/**
 * The joined name paths hinted for an eBay L1 category name, or [] when there are none (always
 * the case until hints are authored). `hints` is injectable for tests.
 */
export function getEtsyCategoryHintPrefixes(
  category: string | null | undefined,
  hints: Readonly<Record<string, readonly EtsyCategoryHintPath[]>> = ETSY_CATEGORY_HINTS
): string[] {
  if (typeof category !== 'string' || !category.trim()) return [];
  if (!Object.prototype.hasOwnProperty.call(hints, category)) return [];
  return hints[category]
    .filter((path) => Array.isArray(path) && path.length > 0 && path.every((n) => typeof n === 'string' && n.trim().length > 0))
    .map((path) => path.map((n) => n.trim()).join(ETSY_HINT_PATH_SEPARATOR));
}
