/**
 * Canonical eBay US top-level (L1) category set — single source of truth.
 *
 * Used by BOTH:
 *   1. The AI prompt in cloudAIService.ts (the list the model must choose from), and
 *   2. The domain-aware eBay category resolver in ebayController.ts
 *      (suggestEbayCategoryForTitle → domainToL1).
 *
 * Because both consumers share this constant, `item.category` is always a real eBay
 * L1 category name (as documented at schema.prisma:1026) and the prompt / resolver
 * can never drift apart.
 *
 * The names below use eBay's EXACT L1 ancestor category names so the resolver's
 * ancestor-membership matching (categoryName.includes(l1)) works against the real
 * taxonomy returned by eBay's get_category_suggestions.
 *
 * Dependency-free by design — safe to import from any backend layer.
 */

export const EBAY_L1_CATEGORIES: readonly string[] = [
  'Antiques',
  'Art',
  'Baby',
  'Books & Magazines',
  'Business & Industrial',
  'Cameras & Photo',
  'Cell Phones & Accessories',
  'Clothing, Shoes & Accessories',
  'Coins & Paper Money',
  'Collectibles',
  'Computers/Tablets & Networking',
  'Consumer Electronics',
  'Crafts',
  'Dolls & Bears',
  'Health & Beauty',
  'Home & Garden',
  'Jewelry & Watches',
  'Music',
  'Musical Instruments & Gear',
  'Pet Supplies',
  'Pottery & Glass',
  'Sporting Goods',
  'Sports Mem, Cards & Fan Shop',
  'Stamps',
  'Toys & Hobbies',
  'Video Games & Consoles',
  'eBay Motors',
  'Everything Else',
] as const;

/**
 * Keyword → canonical L1 map. First-match wins. EVERY `l1` value below is an exact
 * member of EBAY_L1_CATEGORIES so the resolver's ancestor matching stays valid.
 *
 * Order matters: more specific patterns (e.g. video game consoles) are listed before
 * broader ones (e.g. generic toys) so the specific match wins.
 */
export const DOMAIN_KEYWORD_MAP: Array<{ pattern: RegExp; l1: string }> = [
  { pattern: /video game|console|xbox|playstation|nintendo/i, l1: 'Video Games & Consoles' },
  { pattern: /aquarium|aquatic|fish\s*tank|reptile|terrarium|pet|cat|dog|bird|hamster|aerator/i, l1: 'Pet Supplies' },
  { pattern: /guitar|amp|drum|keyboard|piano|violin|instrument|microphone|dj/i, l1: 'Musical Instruments & Gear' },
  { pattern: /jewelry|watch|ring|necklace|bracelet|earring|pendant/i, l1: 'Jewelry & Watches' },
  { pattern: /clothing|apparel|shirt|dress|pants|shoes|jacket|coat|sweater|handbag|purse/i, l1: 'Clothing, Shoes & Accessories' },
  { pattern: /book|magazine|novel|textbook|comic/i, l1: 'Books & Magazines' },
  { pattern: /baby|infant|toddler|nursery|stroller/i, l1: 'Baby' },
  { pattern: /makeup|cosmetic|skincare|fragrance|beauty|perfume/i, l1: 'Health & Beauty' },
  { pattern: /car part|auto|automotive|motorcycle|vehicle|tire/i, l1: 'eBay Motors' },
  { pattern: /pottery|ceramic|glassware|porcelain|stoneware/i, l1: 'Pottery & Glass' },
  { pattern: /craft|sewing|yarn|fabric|scrapbook/i, l1: 'Crafts' },
  { pattern: /coin|currency/i, l1: 'Coins & Paper Money' },
  { pattern: /stamp/i, l1: 'Stamps' },
  { pattern: /\bart\b|painting|print|sculpture|canvas/i, l1: 'Art' },
  { pattern: /tool|hardware|power tool|drill|saw|wrench|hammer/i, l1: 'Business & Industrial' },
  { pattern: /toy|game|puzzle|doll|lego|action figure|board game|hobby/i, l1: 'Toys & Hobbies' },
  { pattern: /sport|bike|bicycle|fitness|golf|camping|outdoor|exercise/i, l1: 'Sporting Goods' },
  { pattern: /tv|stereo|camera|phone|laptop|computer|tablet|headphone|audio|electronic/i, l1: 'Consumer Electronics' },
  { pattern: /furniture|home decor|kitchen|garden|patio|bedding|lamp|rug|cookware|appliance|linen/i, l1: 'Home & Garden' },
  { pattern: /antique|vintage/i, l1: 'Antiques' },
  { pattern: /collectible|memorabilia/i, l1: 'Collectibles' },
];

/**
 * Map a free-text hint (an AI category, a title, or both joined) to the expected
 * eBay L1 category name(s) the correct category should live under.
 *
 *   a. If `text` contains an exact (case-insensitive) EBAY_L1_CATEGORIES name,
 *      return that canonical name (single-element array).
 *   b. Else apply the keyword regex map; first match wins.
 *   c. Else return [] (no domain constraint).
 *
 * @param text Free-text hint (item.category / suggestedCategory) and/or item title.
 * @returns Expected eBay L1 name(s); [] when nothing matches.
 */
export function domainToL1(text: string | null | undefined): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();

  // a. Exact canonical L1 name present in the text → return the canonical name.
  for (const name of EBAY_L1_CATEGORIES) {
    if (lower.includes(name.toLowerCase())) return [name];
  }

  // b. Keyword regex map; first match wins.
  for (const { pattern, l1 } of DOMAIN_KEYWORD_MAP) {
    if (pattern.test(text)) return [l1];
  }

  // c. No match.
  return [];
}
