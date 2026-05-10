/**
 * Georgia Secretary of State — Corporate Entities Secondary Sale Scraper (Phase 2)
 * Source: GA SOS Corporations Division business name search (ecorp.sos.ga.gov)
 *   https://ecorp.sos.ga.gov/BusinessSearch
 * Searches registered business names for secondary-sale keywords (auction, pawn, consign, etc.)
 * Parses HTML results — no authenticated API required.
 *
 * NOTE: The GA SOS professional license portal (verify.sos.ga.gov) is Cloudflare-protected
 * and inaccessible without a browser. The corporate entity search (ecorp.sos.ga.gov) returns
 * standard HTML and is accessible programmatically.
 *
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

const ECORP_SEARCH_URL = 'https://ecorp.sos.ga.gov/BusinessSearch';
const ECORP_DOMAIN = 'ecorp.sos.ga.gov';

// Keywords to search one at a time — each produces a paginated result set
const SALE_TYPE_KEYWORDS = [
  'auction',
  'pawn',
  'estate sale',
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
  return 'RESALE_SHOP';
}

interface ParsedBusiness {
  name: string;
  entityNumber: string;
  city: string;
  status: string;
}

/**
 * Extract text content from an HTML tag, stripping all inner tags.
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
 * Parse business rows from the GA eCorp search results HTML.
 * The results table has columns: Entity Name, Control Number, Status, State, Date.
 */
function parseSearchResults(html: string): ParsedBusiness[] {
  const results: ParsedBusiness[] = [];

  // Match table rows in the results table
  const tableMatch = html.match(/<table[^>]*class="[^"]*businessNameSearch[^"]*"[^>]*>([\s\S]*?)<\/table>/i)
    || html.match(/<table[^>]*id="[^"]*searchResults[^"]*"[^>]*>([\s\S]*?)<\/table>/i)
    || html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);

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

    if (cells.length < 2) continue;

    const name = cells[0];
    const entityNumber = cells[1] || '';
    // Status is typically column 2 or 3; City may be in column 3 or 4
    const status = cells[2] || '';
    const city = cells[3] || '';

    if (!name || name.toLowerCase() === 'entity name') continue; // Skip header row

    results.push({ name, entityNumber, city, status });
  }

  return results;
}

/**
 * Fetch one page of GA eCorp search results for a given keyword.
 * Returns parsed businesses and a flag indicating whether more pages exist.
 */
async function fetchSearchPage(
  keyword: string,
  page: number
): Promise<{ businesses: ParsedBusiness[]; hasMore: boolean } | null> {
  try {
    await defaultRateLimiter.waitBeforeRequest(ECORP_DOMAIN);

    // GA eCorp uses a POST form search
    const formData = new URLSearchParams({
      businessName: keyword,
      businessType: '',
      businessStatus: 'Active',
      filingStatus: '',
      county: '',
      agent: '',
      pageNumber: String(page),
      pageSize: '100',
      sortBy: 'businessName',
      sortDirection: 'asc',
    });

    const response = await fetch(`${ECORP_SEARCH_URL}/BusinessInformation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (compatible; FindASaleBot/1.0; +https://finda.sale)',
        Referer: ECORP_SEARCH_URL,
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(45000),
    });

    if (!response.ok) {
      console.warn(
        `[Georgia Phase2] HTTP ${response.status} for keyword "${keyword}" page ${page}`
      );
      return null;
    }

    const html = await response.text();

    // Check if Cloudflare challenge was returned
    if (html.includes('cf-browser-verification') || html.includes('cf_chl_opt')) {
      console.warn(
        `[Georgia Phase2] Cloudflare challenge detected for keyword "${keyword}" — skipping`
      );
      return null;
    }

    const businesses = parseSearchResults(html);

    // Detect pagination — look for "next page" link or total count
    const hasMore =
      html.toLowerCase().includes('next page') ||
      html.toLowerCase().includes('nextpage') ||
      (businesses.length === 100);

    return { businesses, hasMore };
  } catch (err) {
    console.warn(
      `[Georgia Phase2] Fetch failed for keyword "${keyword}" page ${page}:`,
      err
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Georgia SOS Corporate Entities secondary sale scraper.
 * Iterates SALE_TYPE_KEYWORDS, querying GA eCorp business name search for each.
 * Parses HTML result tables, deduplicates by entity number, upserts via
 * getOrCreateScrapedOrganizer.
 */
export async function runGeorgiaPhase2Scraper(): Promise<void> {
  console.log('[Georgia Phase2] Starting secondary sale scraper — GA SOS eCorp');
  console.log(`[Georgia Phase2] Source: ${ECORP_SEARCH_URL}`);

  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;

  // Track seen entity numbers to deduplicate across keyword searches
  const seenEntityNumbers = new Set<string>();

  try {
    for (const keyword of SALE_TYPE_KEYWORDS) {
      console.log(`[Georgia Phase2] Searching keyword: "${keyword}"`);
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const result = await fetchSearchPage(keyword, page);

        if (!result) {
          // Null means fetch/parse failed — stop pagination for this keyword
          break;
        }

        if (result.businesses.length === 0) {
          console.log(
            `[Georgia Phase2] No results for "${keyword}" page ${page}`
          );
          break;
        }

        totalFetched += result.businesses.length;

        for (const biz of result.businesses) {
          const name = biz.name.trim();
          if (!name) continue;

          // Skip inactive entities
          if (
            biz.status &&
            !biz.status.toLowerCase().includes('active') &&
            biz.status.toLowerCase() !== ''
          ) {
            continue;
          }

          // Client-side exclude-fragment filter
          if (nameIsExcluded(name)) continue;

          // Deduplicate across keyword searches by entity number
          const dedupKey = biz.entityNumber
            ? `EN-${biz.entityNumber}`
            : `NAME-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

          if (seenEntityNumbers.has(dedupKey)) continue;
          seenEntityNumbers.add(dedupKey);

          totalMatched++;

          const city = biz.city.trim() || 'Georgia';
          const category = mapCategory(name);

          const slugifiedName = name
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .slice(0, 40);
          const scraperDedupeKey = `GA-SECONDARY-${biz.entityNumber || slugifiedName}`;

          console.log(`[Georgia Phase2] Matched: ${scraperDedupeKey} — ${name}`);

          try {
            const orgId = await getOrCreateScrapedOrganizer(
              name,                           // businessName
              'GeorgiaPhase2',                // sourceName
              city,                           // city
              'GA',                           // state
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
              true,                           // isStateLicensed
              'GA',                           // licenseState
              biz.entityNumber || undefined   // licenseNumber
            );
            if (orgId) totalUpserted++;
          } catch (upsertErr) {
            console.error(
              `[Georgia Phase2] Upsert error for "${name}":`,
              upsertErr
            );
          }
        }

        hasMore = result.hasMore;
        page++;

        // Safety cap — max 10 pages per keyword (1000 results)
        if (page > 10) {
          console.warn(
            `[Georgia Phase2] Page cap reached for keyword "${keyword}" — moving on`
          );
          break;
        }
      }
    }

    console.log(
      `[Georgia Phase2] Complete — fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );
  } catch (err) {
    console.error('[Georgia Phase2] Fatal error:', err);
    throw err;
  }
}
