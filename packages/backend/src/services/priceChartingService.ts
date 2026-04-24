/**
 * Task 2: PriceCharting API Integration
 *
 * Integrates with PriceCharting (pricecharting.com) public API for pricing comparables.
 * Handles video games, trading cards, sports cards, comics, and vintage toys.
 *
 * API: https://www.pricecharting.com/api/
 * Rate limit: 1 req/second max (enforced with delay)
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

/**
 * Fetch pricing from PriceCharting API
 */
async function fetchFromPriceChartingAPI(query: string): Promise<any | null> {
  try {
    const url = `https://www.pricecharting.com/api/products?q=${encodeURIComponent(query)}&status=price_guide_complete`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'FindA.Sale/1.0',
      },
    });

    if (!response.ok) {
      console.warn(`[PriceCharting] API error: ${response.status} for query: ${query}`);
      return null;
    }

    const data = (await response.json()) as any;
    return data.products && data.products.length > 0 ? data.products[0] : null;
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

    // Calculate title similarity
    const similarity = calculateTitleSimilarity(title, product.name || '');

    // Map similarity to confidence
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (similarity >= 85) confidence = 'HIGH';
    else if (similarity >= 60) confidence = 'MEDIUM';

    const result: PriceChartingResult = {
      name: product.name || title,
      loosePrice: product['loose-price'] ? Math.round(parseFloat(product['loose-price']) * 100) : null,
      cibPrice: product['cib-price'] ? Math.round(parseFloat(product['cib-price']) * 100) : null,
      newPrice: product['new-price'] ? Math.round(parseFloat(product['new-price']) * 100) : null,
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
