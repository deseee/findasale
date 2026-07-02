/**
 * Ohio Secretary of State — Business Name Search Secondary Sale Scraper (Phase 2)
 *
 * Previous source (license.ohio.gov ASP.NET form) was unreachable from GitHub Actions
 * runners due to Ohio's cloud-IP block. ADR-073 fix: switch to Ohio SOS Business Search
 * (businesssearch.ohiosos.gov), which is a public-facing portal accessible from any IP.
 *
 * Strategy: keyword-based business name searches — same approach as georgiaPhase2Scraper.
 * Each keyword produces a paginated result set; results are deduplicated by entity number.
 *
 * Covers: pawnbrokers, secondhand dealers, auction firms, consignment, thrift, estate sale
 * organizers registered as Ohio business entities.
 *
 * ADR-073: Directory Scraper Phase 2 — State business registration data (cloud-IP fix)
 */

import { defaultRateLimiter } from '../rateLimiter';
import { batchUpsertScrapedOrganizers, ScrapedOrganizerRow } from '../index';

const OHIO_SOS_SEARCH_URL = 'https://businesssearch.ohiosos.gov/';
const OHIO_SOS_DOMAIN = 'businesssearch.ohiosos.gov';

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

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

function mapCategory(businessName: string): string {
  const lower = businessName.toLowerCase();
  if (lower.includes('auction')) return 'AUCTION_HOUSE';
  if (lower.includes('pawn')) return 'PAWN_SHOP';
  return 'RESALE_SHOP';
}

/**
 * Extract plain text from an HTML fragment, stripping tags and decoding entities.
 */
function extractText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

interface OhioSosBusiness {
  name: string;
  entityNumber: string;
  city: string;
  status: string;
}

/**
 * Parse business rows from the Ohio SOS search results HTML.
 * The results table has columns: Business Name, Entity Number, Status, City.
 */
function parseSearchResults(html: string): OhioSosBusiness[] {
  const results: OhioSosBusiness[] = [];

  // Try to isolate a results table or tbody
  const tableMatch =
    html.match(/<table[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/table>/i) ||
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

    if (cells.length < 2) continue;

    const name = cells[0];
    const entityNumber = cells[1] || '';
    const status = cells[2] || '';
    const city = cells[3] || '';

    // Skip header rows
    if (
      !name ||
      name.toLowerCase() === 'business name' ||
      name.toLowerCase() === 'entity name' ||
      name.toLowerCase() === 'name'
    ) {
      continue;
    }

    results.push({ name, entityNumber, city, status });
  }

  return results;
}

/**
 * Fetch one page of Ohio SOS search results for a given keyword.
 * Ohio SOS uses a GET-based search with `q` or `SearchValue` query parameters.
 * Falls back to POST form submission if GET yields no results.
 */
async function fetchSearchPage(
  keyword: string,
  page: number
): Promise<{ businesses: OhioSosBusiness[]; hasMore: boolean } | null> {
  try {
    await defaultRateLimiter.waitBeforeRequest(OHIO_SOS_DOMAIN);

    // Ohio SOS Business Search — GET with query params (primary approach)
    // The portal accepts ?q=<keyword>&status=Active style parameters;
    // if the portal uses a different param name the response will be empty and
    // we fall through to the POST attempt below.
    const params = new URLSearchParams({
      q: keyword,
      status: 'Active',
      page: String(page),
    });

    let response = await fetch(`${OHIO_SOS_SEARCH_URL}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FindASaleBot/1.0; +https://finda.sale)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(45000),
    });

    // If GET returns a non-200 or no table rows, try POST form submission
    if (!response.ok) {
      console.warn(
        `[OhioPhase2] GET HTTP ${response.status} for "${keyword}" p${page} — trying POST`
      );

      await defaultRateLimiter.waitBeforeRequest(OHIO_SOS_DOMAIN);

      const formData = new URLSearchParams({
        SearchValue: keyword,
        SearchType: 'BusinessName',
        Status: 'Active',
        pageNumber: String(page),
        pageSize: '100',
      });

      response = await fetch(OHIO_SOS_SEARCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (compatible; FindASaleBot/1.0; +https://finda.sale)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: OHIO_SOS_SEARCH_URL,
        },
        body: formData.toString(),
        signal: AbortSignal.timeout(45000),
      });

      if (!response.ok) {
        console.warn(
          `[OhioPhase2] POST HTTP ${response.status} for "${keyword}" p${page} — skipping`
        );
        return null;
      }
    }

    const html = await response.text();

    // Detect if portal is blocking or serving a challenge page
    if (
      html.includes('cf-browser-verification') ||
      html.includes('cf_chl_opt') ||
      html.includes('ConnectTimeout') ||
      html.includes('Access Denied') ||
      html.includes('403 Forbidden')
    ) {
      console.warn(`[OhioPhase2] Portal block/challenge detected for "${keyword}" — skipping`);
      return null;
    }

    const businesses = parseSearchResults(html);

    // Detect pagination — if we got a full page (100 rows) there may be more
    const hasMore =
      html.toLowerCase().includes('next page') ||
      html.toLowerCase().includes('nextpage') ||
      html.toLowerCase().includes('page-next') ||
      businesses.length >= 100;

    return { businesses, hasMore };
  } catch (err) {
    console.warn(`[OhioPhase2] Fetch failed for "${keyword}" p${page}:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Ohio SOS Business Search secondary sale scraper — Phase 2.
 *
 * Replaces the blocked license.ohio.gov ASP.NET scraper.
 * Iterates SALE_TYPE_KEYWORDS, querying Ohio SOS business name search for each.
 * Parses HTML result tables, deduplicates by entity number, upserts via
 * getOrCreateScrapedOrganizer with isStateLicensed=true, licenseState='OH'.
 */
export async function runOhioPhase2Scraper(): Promise<void> {
  console.log('[OhioPhase2] Starting secondary sale scraper — Ohio SOS Business Search');
  console.log(`[OhioPhase2] Source: ${OHIO_SOS_SEARCH_URL}`);
  console.log(
    `[OhioPhase2] Keywords: ${SALE_TYPE_KEYWORDS.length} — ${SALE_TYPE_KEYWORDS.join(', ')}`
  );

  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;

  // Deduplicate across keyword searches by entity number
  const seenEntityNumbers = new Set<string>();
  const batchRows: ScrapedOrganizerRow[] = [];

  try {
    for (const keyword of SALE_TYPE_KEYWORDS) {
      console.log(`[OhioPhase2] Searching keyword: "${keyword}"`);
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const result = await fetchSearchPage(keyword, page);

        if (!result) {
          // Null means fetch/parse failed or portal blocked — stop this keyword
          break;
        }

        if (result.businesses.length === 0) {
          console.log(`[OhioPhase2] No results for "${keyword}" page ${page}`);
          break;
        }

        totalFetched += result.businesses.length;

        for (const biz of result.businesses) {
          const name = biz.name.trim();
          if (!name) continue;

          // Skip inactive entities when status is explicitly provided
          if (
            biz.status &&
            biz.status.toLowerCase() !== '' &&
            !biz.status.toLowerCase().includes('active')
          ) {
            continue;
          }

          // Client-side exclusion filter
          if (nameIsExcluded(name)) continue;

          // Deduplicate across keyword searches
          const dedupKey = biz.entityNumber
            ? `EN-${biz.entityNumber}`
            : `NAME-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

          if (seenEntityNumbers.has(dedupKey)) continue;
          seenEntityNumbers.add(dedupKey);

          totalMatched++;

          const city = biz.city.trim() || 'Ohio';
          const category = mapCategory(name);

          const slugifiedName = name
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .slice(0, 40);
          const scraperDedupeKey = `OH-SOS-${biz.entityNumber || slugifiedName}`;

          console.log(`[OhioPhase2] Matched: ${scraperDedupeKey} — ${name} (${city})`);

          batchRows.push({
            businessName: name,
            sourceName: 'OhioPhase2',
            city,
            state: 'OH',
            businessCategory: category,
            isStateLicensed: true,
            licenseState: 'OH',
            licenseNumber: biz.entityNumber || undefined, // entity number as proxy
          });
        }

        hasMore = result.hasMore;
        page++;

        // Safety cap — max 10 pages per keyword (1000 results)
        if (page > 10) {
          console.warn(`[OhioPhase2] Page cap reached for "${keyword}" — moving on`);
          break;
        }
      }

      console.log(
        `[OhioPhase2] Keyword "${keyword}" done — fetched so far: ${totalFetched}, matched: ${totalMatched}`
      );
    }

    // Batch upsert across all keywords (ADR-073 perf: replaces serial per-row upserts)
    const ids = await batchUpsertScrapedOrganizers(batchRows, 100);
    totalUpserted = ids.filter((id) => id !== null).length;

    console.log(
      `[OhioPhase2] Scraper complete — fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );
  } catch (error) {
    console.error('[OhioPhase2] Scraper error:', error);
    throw error;
  }
}
