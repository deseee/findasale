/**
 * Mississippi Secretary of State — Corporate Entities Secondary Sale Scraper (Phase 2)
 * Source: https://corp.sos.ms.gov/corp/portal/c92dbd06-6db5-4a04-b40c-91f9e7572e4f/Index
 * Also tries the MS SOS business search API endpoint for direct JSON results.
 *
 * Phase 1 (mississippiLicensingScraper.ts) covers auctioneers from the MS Board of Auctioneers.
 * Phase 2 adds breadth via SOS entity keyword search for pawnbrokers, consignment shops,
 * antique dealers, thrift stores, liquidators, and other resale businesses.
 *
 * ADR-073: Directory Scraper Phase 2 — State business registry data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { batchUpsertScrapedOrganizers, ScrapedOrganizerRow } from '../index';

// MS SOS portal uses a Dunn & Bradstreet-powered Angular app. The underlying
// API is accessible at this endpoint for keyword searches.
const MS_SOS_SEARCH_API = 'https://corp.sos.ms.gov/corp/portal/c92dbd06-6db5-4a04-b40c-91f9e7572e4f/api/CorpSearch/GetCorpSearchList';
const MS_SOS_DOMAIN = 'corp.sos.ms.gov';

// Keywords to search one at a time
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

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

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
 * Extract plain text from an HTML string.
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
 * Parse business entries from a JSON API response from the MS SOS portal.
 * Returns null if the response isn't parseable JSON — caller falls back to HTML.
 */
function parseJsonResponse(data: any): ParsedBusiness[] | null {
  try {
    // MS SOS API returns something like { data: [...], totalCount: N }
    const rows: any[] = Array.isArray(data) ? data : (data?.data ?? data?.Results ?? data?.result ?? []);

    if (!Array.isArray(rows)) return null;

    return rows.map((r: any) => ({
      name: String(r.corpName ?? r.EntityName ?? r.name ?? '').trim(),
      entityNumber: String(r.corpId ?? r.EntityId ?? r.id ?? '').trim(),
      city: String(r.city ?? r.City ?? r.principalCity ?? '').trim(),
      status: String(r.status ?? r.Status ?? r.corpStatus ?? '').trim(),
    })).filter((b) => b.name);
  } catch {
    return null;
  }
}

/**
 * Parse business rows from the MS SOS search results HTML (fallback).
 */
function parseHtmlResults(html: string): ParsedBusiness[] {
  const results: ParsedBusiness[] = [];

  const tableMatch =
    html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i) ||
    html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);

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

    if (!name || name.toLowerCase() === 'name' || name.toLowerCase() === 'corp name') continue;

    results.push({ name, entityNumber, city, status });
  }

  return results;
}

/**
 * Fetch one page of MS SOS search results for a given keyword.
 * Tries JSON API first, falls back to HTML scrape.
 */
async function fetchSearchPage(
  keyword: string,
  page: number
): Promise<{ businesses: ParsedBusiness[]; hasMore: boolean } | null> {
  try {
    await defaultRateLimiter.waitBeforeRequest(MS_SOS_DOMAIN);

    // Try JSON API endpoint first
    const jsonPayload = {
      corpName: keyword,
      corpStatus: 'Active',
      page: page,
      pageSize: 100,
    };

    const jsonResponse = await fetch(MS_SOS_SEARCH_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (compatible; FindASaleBot/1.0; +https://finda.sale)',
        Referer: 'https://corp.sos.ms.gov/',
      },
      body: JSON.stringify(jsonPayload),
      signal: AbortSignal.timeout(45000),
    });

    if (jsonResponse.ok) {
      const contentType = jsonResponse.headers.get('content-type') || '';
      if (contentType.includes('application/json') || contentType.includes('text/plain')) {
        try {
          const data = await jsonResponse.json();
          const businesses = parseJsonResponse(data);
          if (businesses !== null) {
            const hasMore = businesses.length === 100;
            return { businesses, hasMore };
          }
        } catch {
          // JSON parse failed — fall through to HTML
        }
      }
    }

    // Fallback: HTML search via portal URL
    await defaultRateLimiter.waitBeforeRequest(MS_SOS_DOMAIN);

    const params = new URLSearchParams({
      corpName: keyword,
      corpStatus: 'Active',
      page: String(page),
    });

    const htmlUrl = `https://corp.sos.ms.gov/corp/portal/c92dbd06-6db5-4a04-b40c-91f9e7572e4f/Index?${params}`;

    const htmlResponse = await fetch(htmlUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; FindASaleBot/1.0; +https://finda.sale)',
      },
      signal: AbortSignal.timeout(45000),
    });

    if (!htmlResponse.ok) {
      console.warn(
        `[MississippiPhase2] HTTP ${htmlResponse.status} for keyword "${keyword}" page ${page}`
      );
      return null;
    }

    const html = await htmlResponse.text();

    if (html.includes('cf-browser-verification') || html.includes('Access Denied')) {
      console.warn(`[MississippiPhase2] Access blocked for keyword "${keyword}" — skipping`);
      return null;
    }

    const businesses = parseHtmlResults(html);
    const hasMore =
      html.toLowerCase().includes('next page') ||
      html.toLowerCase().includes('>next<') ||
      businesses.length >= 25;

    return { businesses, hasMore };
  } catch (err) {
    console.warn(
      `[MississippiPhase2] Fetch failed for keyword "${keyword}" page ${page}:`,
      err
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Mississippi SOS Corporate Entities secondary sale scraper.
 * Iterates SALE_TYPE_KEYWORDS, querying MS SOS business search for each.
 * Tries JSON API first, falls back to HTML. Deduplicates by entity number or name.
 * Upserts via getOrCreateScrapedOrganizer with isStateLicensed: false (registry, not a license).
 */
export async function runMississippiPhase2Scraper(): Promise<void> {
  console.log('[MississippiPhase2] Starting secondary sale scraper — MS SOS entity search');
  console.log(`[MississippiPhase2] Primary source: ${MS_SOS_SEARCH_API}`);

  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;

  const seenKeys = new Set<string>();
  const batchRows: ScrapedOrganizerRow[] = [];

  try {
    for (const keyword of SALE_TYPE_KEYWORDS) {
      console.log(`[MississippiPhase2] Searching keyword: "${keyword}"`);
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const result = await fetchSearchPage(keyword, page);

        if (!result) {
          break;
        }

        if (result.businesses.length === 0) {
          console.log(`[MississippiPhase2] No results for "${keyword}" page ${page}`);
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

          if (nameIsExcluded(name)) continue;

          const dedupKey = biz.entityNumber
            ? `EN-${biz.entityNumber}`
            : `NAME-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

          if (seenKeys.has(dedupKey)) continue;
          seenKeys.add(dedupKey);

          totalMatched++;

          const city = biz.city.trim() || 'Mississippi';
          const category = mapCategory(name);

          const slugifiedName = name
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .slice(0, 40);
          const scraperDedupeKey = `MS-SECONDARY-${biz.entityNumber || slugifiedName}`;

          console.log(`[MississippiPhase2] Matched: ${scraperDedupeKey} — ${name}`);

          batchRows.push({
            businessName: name,
            sourceName: 'MississippiPhase2',
            city,
            state: 'MS',
            businessCategory: category,
            isStateLicensed: false, // SOS registration, not a license
            licenseState: 'MS',
            licenseNumber: biz.entityNumber || undefined,
          });
        }

        hasMore = result.hasMore;
        page++;

        // Safety cap — max 10 pages per keyword
        if (page > 10) {
          console.warn(
            `[MississippiPhase2] Page cap reached for keyword "${keyword}" — moving on`
          );
          break;
        }
      }
    }

    // Batch upsert across all keywords (ADR-073 perf: replaces serial per-row upserts)
    const ids = await batchUpsertScrapedOrganizers(batchRows, 100);
    totalUpserted = ids.filter((id) => id !== null).length;

    console.log(
      `[MississippiPhase2] Complete — fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );
  } catch (err) {
    console.error('[MississippiPhase2] Fatal error:', err);
    throw err;
  }
}
