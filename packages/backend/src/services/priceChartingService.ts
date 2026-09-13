/**
 * Task 2: PriceCharting API Integration
 *
 * Integrates with PriceCharting (pricecharting.com) public API for pricing comparables.
 * Handles video games, trading cards, sports cards, comics, and vintage toys.
 *
 * API: https://www.pricecharting.com/api/
 * Rate limit: 1 req/second max (enforced with delay)
 *
 * REAL-API VERIFIED 2026-09-13 (previously unconfirmed -- STATE.md flagged this as a
 * same-bug-class pattern-match, not a confirmed finding). Live curl against
 * https://www.pricecharting.com/api/products confirmed TWO real bugs, not one:
 *   1. Every request was missing the required `t=<token>` auth parameter -- PriceCharting
 *      returns HTTP 400 {"error":"Must provide an access token"} with no token at all, so
 *      this integration has been silently returning null on EVERY call in production (the
 *      existing `!response.ok` branch swallows it as a plain warn+null, same fail-open shape
 *      as the Vercel-tombstone bug, just triggered 100% of the time instead of on a lookalike
 *      condition). Fixed by reading PRICECHARTING_API_TOKEN and gating the call on it being
 *      configured, same pattern as the Etsy/GSA/Discogs pricing adapters.
 *   2. Real shape mismatch, confirmed against PriceCharting's own live API docs
 *      (pricecharting.com/api-documentation, fetched 2026-09-13): /api/products list items
 *      only ever carry `console-name` / `id` / `product-name` -- there is no `name` key (the
 *      old code read `product.name`, which is always undefined, silently zeroing every title-
 *      similarity comparison) and NO price fields at all on the list endpoint. `loose-price` /
 *      `cib-price` / `new-price` only exist on the single-product `/api/product?id=` response.
 *      Fixed by using `/api/products` purely to resolve the best-match id, then following up
 *      with `/api/product?id=` for the actual price data, and reading `product-name` for the
 *      title.
 * Not live-tested end-to-end with a real token (none exists in any .env* file in this repo --
 * see PRICECHARTING_API_TOKEN in packages/backend/.env.example) -- CODE-ONLY per the same
 * honesty standard etsy.ts's adapter comment already uses for this project.
 */

export interface PriceChartingResult {
  name: string;
  loosePrice: number | null; // cents
  cibPrice: number | null; // complete-in-box, cents
  newPrice: number | null; // cents
  pcId: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

// Category mapping: FindA.Sale categories -> PriceCharting-relevant categories
const PRICECHARTING_CATEGORIES = {
  'toys': true,
  'electronics': true, // only if game-related keywords
  'books': true, // only if "comic" or "manga"
  'sports memorabilia': true,
  'collectibles': true,
};

// Game-related keywords for electronics category
const GAME_KEYWORDS = ['nintendo', 'sega', 'playstation', 'xbox', 'gameboy', 'atari', 'n64', 'snes', 'nes', 'game boy', 'ps1', 'ps2', 'ps3', 'ps4', 'ps5'];

// Comic-related keywords for books category
const COMIC_KEYWORDS = ['comic', 'manga', 'graphic novel'];

/**
 * Check if a category is relevant for PriceCharting lookup
 */
function isPriceChartingRelevant(category: string | null | undefined, title: string | null | undefined): boolean {
  if (!category) return false;

  const catLower = category.toLowerCase();

  // Toys, sports memorabilia, collectibles always relevant
  if (catLower === 'toys' || catLower === 'sports memorabilia' || catLower === 'collectibles') {
    return true;
  }

  // Electronics only if title contains game keywords
  if (catLower === 'electronics' && title) {
    const titleLower = title.toLowerCase();
    return GAME_KEYWORDS.some((kw) => titleLower.includes(kw));
  }

  // Books only if title contains comic keywords
  if (catLower === 'books' && title) {
    const titleLower = title.toLowerCase();
    return COMIC_KEYWORDS.some((kw) => titleLower.includes(kw));
  }

  return false;
}

/**
 * Calculate string similarity for quick matching
 * Returns 0-100 percentage
 */
function calculateTitleSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase().trim();
  const bLower = b.toLowerCase().trim();

  if (aLower === bLower) return 100;

  // Simple substring check
  if (aLower.includes(bLower) || bLower.includes(aLower)) {
    return 85;
  }

  // Word overlap scoring
  const aWords = aLower.split(/\s+/);
  const bWords = new Set(bLower.split(/\s+/));

  let overlap = 0;
  for (const word of aWords) {
    if (bWords.has(word)) overlap++;
  }

  const maxWords = Math.max(aWords.length, bWords.size);
  return maxWords > 0 ? Math.round((overlap / maxWords) * 100) : 0;
}

let missingTokenWarned = false;

/**
 * True if PRICECHARTING_API_TOKEN is set. PriceCharting's API returns a hard HTTP 400
 * ("Must provide an access token") on every request without it -- there is no anonymous
 * tier -- so callers should treat an unconfigured token the same as "integration disabled",
 * not attempt the request. Mirrors the isConfigured() pattern used by the Etsy/GSA/Discogs
 * pricing adapters elsewhere in this codebase.
 */
function isPriceChartingConfigured(): boolean {
  return Boolean(process.env.PRICECHARTING_API_TOKEN);
}

/**
 * Resolve the best-matching product id + name via PriceCharting's /api/products search.
 * This endpoint does NOT return price data (confirmed against PriceCharting's own live API
 * docs, 2026-09-13) -- only `console-name` / `id` / `product-name` -- so this is a lookup
 * step only, not the final result.
 */
async function fetchFromPriceChartingAPI(query: string): Promise<any | null> {
  if (!isPriceChartingConfigured()) {
    if (!missingTokenWarned) {
      console.warn('[PriceCharting] PRICECHARTING_API_TOKEN is not set -- PriceCharting lookups are disabled (every request would get HTTP 400 "Must provide an access token"). Set it in the backend env to enable.');
      missingTokenWarned = true;
    }
    return null;
  }

  const token = process.env.PRICECHARTING_API_TOKEN as string;

  try {
    const searchUrl = `https://www.pricecharting.com/api/products?t=${encodeURIComponent(token)}&q=${encodeURIComponent(query)}`;

    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'FindA.Sale/1.0',
      },
    });

    if (!searchResponse.ok) {
      console.warn(`[PriceCharting] /api/products error: ${searchResponse.status} for query: ${query}`);
      return null;
    }

    const searchData = (await searchResponse.json()) as any;
    const match = searchData.products && searchData.products.length > 0 ? searchData.products[0] : null;
    if (!match || !match.id) {
      return null;
    }

    // /api/products has no price fields -- fetch the real prices via /api/product?id=.
    const productUrl = `https://www.pricecharting.com/api/product?t=${encodeURIComponent(token)}&id=${encodeURIComponent(match.id)}`;

    const productResponse = await fetch(productUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'FindA.Sale/1.0',
      },
    });

    if (!productResponse.ok) {
      console.warn(`[PriceCharting] /api/product error: ${productResponse.status} for id: ${match.id} (query: ${query})`);
      return null;
    }

    const product = (await productResponse.json()) as any;
    return product && product.status !== 'error' ? product : null;
  } catch (error) {
    console.error(`[PriceCharting] Fetch failed for query "${query}":`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Main: Search PriceCharting for a title and category
 * Returns PriceChartingResult with confidence score or null
 */
export async function searchPriceCharting(title: string | null | undefined, category: string | null | undefined): Promise<PriceChartingResult | null> {
  // Guard: skip if no title or category, or category not relevant
  if (!title || !isPriceChartingRelevant(category, title)) {
    return null;
  }

  try {
    // Rate limiting: 1 req/second
    await new Promise((resolve) => setTimeout(resolve, 100));

    const product = await fetchFromPriceChartingAPI(title);

    if (!product) {
      console.log(`[PriceCharting] No results for: ${title}`);
      return null;
    }

    // Calculate title similarity. Real field is `product-name`, not `name` -- confirmed
    // against PriceCharting's live API docs 2026-09-13 (see file header).
    const similarity = calculateTitleSimilarity(title, product['product-name'] || '');

    // Map similarity to confidence
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (similarity >= 85) confidence = 'HIGH';
    else if (similarity >= 60) confidence = 'MEDIUM';

    // loose-price/cib-price/new-price come back as integer CENTS already on /api/product
    // (PriceCharting's own doc example: "loose-price": 17244, // $172.44) -- NOT dollar
    // strings needing parseFloat*100. The old code's parseFloat(...)*100 would have
    // inflated any real price 100x had a token ever been configured; fixed to use the
    // integer value directly.
    const result: PriceChartingResult = {
      name: product['product-name'] || title,
      loosePrice: typeof product['loose-price'] === 'number' ? product['loose-price'] : null,
      cibPrice: typeof product['cib-price'] === 'number' ? product['cib-price'] : null,
      newPrice: typeof product['new-price'] === 'number' ? product['new-price'] : null,
      pcId: product.id || '',
      confidence,
    };

    console.log(
      `[PriceCharting] Found: ${result.name} -- loose: $${result.loosePrice ? (result.loosePrice / 100).toFixed(2) : 'N/A'}, cib: $${result.cibPrice ? (result.cibPrice / 100).toFixed(2) : 'N/A'}, confidence: ${result.confidence}`
    );

    return result;
  } catch (error) {
    console.error(`[PriceCharting] Unexpected error searching "${title}":`, error instanceof Error ? error.message : String(error));
    return null;
  }
}
