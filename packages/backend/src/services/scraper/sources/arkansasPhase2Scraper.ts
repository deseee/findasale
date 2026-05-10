/**
 * Arkansas Secretary of State — Corporate Entities Secondary Sale Scraper (Phase 2)
 * Source: https://www.sos.arkansas.gov/corps/search_all.php
 * Searches registered business names for secondary-sale keywords (auction, estate sale, consignment, etc.)
 * Parses HTML results — no authenticated API required.
 *
 * Phase 1 (arkansasLicensingScraper.ts) covers auctioneers from the AR auctioneer roster.
 * Phase 2 adds breadth via SOS keyword search for secondhand dealers, pawnbrokers, consignment,
 * antique shops, thrift stores, and related resale businesses that don't require an auctioneer license.
 *
 * ADR-073: Directory Scraper Phase 2 — State business registry data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

const AR_SOS_SEARCH_URL = 'https://www.sos.arkansas.gov/corps/search_all.php';
const AR_SOS_DOMAIN = 'www.sos.arkansas.gov';

// Keywords to search one at a time — each produces a paginated result set
const SALE_TYPE_KEYWORDS = [
  'auction',
  'estate sale',
  'pawn',
  'consignment',
  'thrift',
  'resale',
  'antique',
  'vintage',
  'collectible',
  'flea market',
  'liquidat',
  'salvage',
  'secondhand',
  'second hand',
  'surplus',
  'rummage',
  'used goods',
  'pre-owned',
];

// False-positive name fragments — exclude if business name contains any of these
const EXCLUDE_FRAGMENTS = [
  'real estate',
  'realty',
  'realtor',
  'restaurant',
  'petroleum',
  'dental',
  'medical',
  'pharmacy',
  'funeral',
  'insurance',
  'tax service',
  'accounting',
  'attorney',
  'law office',
  'landscaping',
  'construction',
  'plumbing',
  'electrical',
  'roofing',
  'automotive repair',
  'car wash',
  'dry clean',
  'laundry',
  'hair salon',
  'nail salon',
  'tattoo',
  'massage',
  'yoga',
  'daycare',
];

/**
 * Return true if the business name contains a false-positive fragment.
 */
function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Map a business name to a valid scraper category.
 */
function mapCategory(businessName: string): string {
  const lower = businessName.toLowerCase();
  if (lower.includes('auction')) return 'AUCTION_HOUSE';
  if (lower.includes('pawn')) return 'PAWN_SHOP';
  if (lower.includes('antique')) return 'ANTIQUE_DEALER';
  if (lower.includes('consign')) return 'CONSIGNMENT';
  if (lower.includes('thrift')) return 'THRIFT_STORE';
  if (lower.includes('vintage') || lower.includes('collectible')) return 'VINTAGE';
  if (lower.includes('flea market')) return 'FLEA_MARKET';
  if (lower.includes('liquidat')) return 'LIQUIDATION';
  return 'RESALE_SHOP';
}

interface ParsedBusiness {
  name: string;
  entityNumber: string;
  city: string;
  status: string;
}

/**
 * Extract plain text from an HTML string (strips tags, decodes entities).
 */
function extractText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Parse business rows from the AR SOS search results HTML.
 * The AR SOS results table typically has: Filing Date, Name, Agent, City, State, Status, Entity Type
 */
function parseSearchResults(html: string): ParsedBusiness[] {
  const results: ParsedBusiness[] = [];

  // Find the results table body
  const tableMatch =
    html.match(/<table[^>]*class="[^"]*listingTable[^"]*"[^>]*>([\s\S]*?)<\/table>/i) ||
    html.match(/<table[^>]*id="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/table>/i) ||
    html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);

  const tableBody = tableMatch ? tableMatch[1] : html;

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(tableBody)) !== null) {
    const row = rowMatch[1];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(row)) !== null) {
      cells.push(extractText(cellMatch[1]));
    }

    // AR SOS typically returns: Filing Date | Name | Agent | City | State | Status | Entity Type
    // Or a simpler layout: Name | File Number | Status | City
    if (cells.length < 2) continue;

    // Try to detect which column layout we have
    let name = '';
    let entityNumber = '';
    let city = '';
    let status = '';

    if (cells.length >= 6) {
      // Full layout: FilingDate | Name | Agent | City | State | Status
      name = cells[1];
      city = cells[3];
      status = cells[5];
      entityNumber = cells[0]; // filing date doubles as unique ref
    } else if (cells.length >= 4) {
      // Simplified: Name | FileNumber | Status | City
      name = cells[0];
      entityNumber = cells[1] || '';
      status = cells[2] || '';
      city = cells[3] || '';
    } else {
      name = cells[0];
      city = cells[1] || '';
    }

    if (!name || name.toLowerCase() === 'name' || name.toLowerCase() === 'business name') continue;

    results.push({ name, entityNumber, city, status });
  }

  return results;
}

/**
 * Fetch one page of AR SOS search results for a given keyword.
 * AR SOS uses a GET-based search with ?name= parameter and pagination via &pg=N.
 */
async function fetchSearchPage(
  keyword: string,
  page: number
): Promise<{ businesses: ParsedBusiness[]; hasMore: boolean } | null> {
  try {
    await defaultRateLimiter.waitBeforeRequest(AR_SOS_DOMAIN);

    // AR SOS search_all.php uses GET with these parameters
    const params = new URLSearchParams({
      name: keyword,
      Search: 'Search',
      type: '',
      status: 'Active',
      pg: String(page),
    });

    const url = `${AR_SOS_SEARCH_URL}?${params.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; FindASaleBot/1.0; +https://finda.sale)',
      },
      signal: AbortSignal.timeout(45000),
    });

    if (!response.ok) {
      console.warn(
        `[ArkansasPhase2] HTTP ${response.status} for keyword "${keyword}" page ${page}`
      );
      return null;
    }

    const html = await response.text();

    // Detect Cloudflare or access denial
    if (html.includes('cf-browser-verification') || html.includes('Access Denied')) {
      console.warn(
        `[ArkansasPhase2] Access blocked for keyword "${keyword}" — skipping`
      );
      return null;
    }

    const businesses = parseSearchResults(html);

    // Detect "next page" or full page indicating more results
    const hasMore =
      html.toLowerCase().includes('next') ||
      html.toLowerCase().includes('next page') ||
      businesses.length >= 25;

    return { businesses, hasMore };
  } catch (err) {
    console.warn(
      `[ArkansasPhase2] Fetch failed for keyword "${keyword}" page ${page}:`,
      err
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Arkansas SOS Corporate Entities secondary sale scraper.
 * Iterates SALE_TYPE_KEYWORDS, querying AR SOS business name search for each.
 * Parses HTML result tables, deduplicates by entity number or name, upserts via
 * getOrCreateScrapedOrganizer.
 *
 * isStateLicensed is false — SOS registration data, not a professional license.
 */
export async function runArkansasPhase2Scraper(): Promise<void> {
  console.log('[ArkansasPhase2] Starting secondary sale scraper — AR SOS business search');
  console.log(`[ArkansasPhase2] Source: ${AR_SOS_SEARCH_URL}`);

  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;

  // Track seen entity numbers / name keys to deduplicate across keyword searches
  const seenKeys = new Set<string>();

  try {
    for (const keyword of SALE_TYPE_KEYWORDS) {
      console.log(`[ArkansasPhase2] Searching keyword: "${keyword}"`);
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const result = await fetchSearchPage(keyword, page);

        if (!result) {
          break;
        }

        if (result.businesses.length === 0) {
          console.log(`[ArkansasPhase2] No results for "${keyword}" page ${page}`);
          break;
        }

        totalFetched += result.businesses.length;

        for (const biz of result.businesses) {
          const name = biz.name.trim();
          if (!name) continue;

          // Skip inactive / dissolved entities
          if (
            biz.status &&
            biz.status.toLowerCase() !== '' &&
            !biz.status.toLowerCase().includes('active') &&
            !biz.status.toLowerCase().includes('good standing')
          ) {
            continue;
          }

          // Client-side exclude-fragment filter
          if (nameIsExcluded(name)) continue;

          // Deduplicate across keyword searches
          const dedupKey = biz.entityNumber
            ? `EN-${biz.entityNumber}`
            : `NAME-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

          if (seenKeys.has(dedupKey)) continue;
          seenKeys.add(dedupKey);

          totalMatched++;

          const city = biz.city.trim() || 'Arkansas';
          const category = mapCategory(name);

          const slugifiedName = name
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .slice(0, 40);
          const scraperDedupeKey = `AR-SECONDARY-${biz.entityNumber || slugifiedName}`;

          console.log(`[ArkansasPhase2] Matched: ${scraperDedupeKey} — ${name}`);

          try {
            const orgId = await getOrCreateScrapedOrganizer(
              name,                           // businessName
              'ArkansasPhase2',               // sourceName
              city,                           // city
              'AR',                           // state
              undefined,                      // esnOrgId
              undefined,                      // googlePlaceId
              undefined,                      // foursquareVenueId
              undefined,                      // hereBusinessId
              category,                       // businessCategory
              undefined,                      // contactEmail
              undefined,                      // phone
              undefined,                      // website
              undefined,                      // lat
              undefined,                      // lng
              false,                          // isStateLicensed (SOS registration, not a license)
              'AR',                           // licenseState
              biz.entityNumber || undefined   // licenseNumber
            );
            if (orgId) totalUpserted++;
          } catch (upsertErr) {
            console.error(
              `[ArkansasPhase2] Upsert error for "${name}":`,
              upsertErr
            );
          }
        }

        hasMore = result.hasMore;
        page++;

        // Safety cap — max 10 pages per keyword (250–1000 results depending on page size)
        if (page > 10) {
          console.warn(
            `[ArkansasPhase2] Page cap reached for keyword "${keyword}" — moving on`
          );
          break;
        }
      }
    }

    console.log(
      `[ArkansasPhase2] Complete — fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );
  } catch (err) {
    console.error('[ArkansasPhase2] Fatal error:', err);
    throw err;
  }
}
