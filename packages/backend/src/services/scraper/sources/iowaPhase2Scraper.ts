/**
 * Iowa Retail Sales & Retail Use Business Registrations — Secondary Sale Scraper (Phase 2)
 * Source: Iowa Department of Revenue — mydata.iowa.gov
 *   https://mydata.iowa.gov/resource/9k3w-7fwi.json  (Socrata JSON API, paginated)
 * Dataset ID: 9k3w-7fwi — "Retail Sales and Retail Use Business Registrations"
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 *
 * STATUS (2026-08-01): mydata.iowa.gov (Socrata tenant) is fully retired — the
 * domain now redirects to socrata.com and returns 404 "Cannot find domain" for
 * every dataset, not just 9k3w-7fwi. No equivalent dataset was found on Iowa's
 * replacement portal (data.iowa.gov, a different non-Socrata platform with no
 * public JSON/CSV API discovered). Scraper skips cleanly until a replacement
 * source is found — see runIowaPhase2Scraper() below.
 *
 * Strategy (legacy — inert while the source above is skipped):
 *   1. Always-include NAICS codes: 453310 (Used Merchandise Stores), 459510 (Used Merchandise Retailers)
 *   2. Broader NAICS codes: 453998, 459999 — require keyword match on business name
 *   3. Any NAICS code — if business name keyword-matches a sale-type keyword
 *   4. Apply nameIsExcluded() to filter false positives
 */

import { defaultRateLimiter } from '../rateLimiter';
import { batchUpsertScrapedOrganizers, ScrapedOrganizerRow } from '../index';

const IA_SOCRATA_BASE = 'https://mydata.iowa.gov/resource/9k3w-7fwi.json';
const IA_SOCRATA_DOMAIN = 'mydata.iowa.gov';
const PAGE_SIZE = 10000;

// NAICS codes that always indicate a secondhand-sale business
const ALWAYS_INCLUDE_NAICS = new Set([
  '453310', // Used Merchandise Stores
  '459510', // Used Merchandise Retailers (newer NAICS 2022)
]);

// Broader NAICS codes that require keyword match on business name
const BROADER_NAICS = new Set([
  '453998', // All Other Miscellaneous Store Retailers
  '459999', // All Other Miscellaneous Retailers
  '522298', // All Other Nondepository Credit Intermediation (pawnshops)
]);

const SALE_TYPE_KEYWORDS = [
  'pawn',
  'estate sale',
  'consign',
  'thrift',
  'resale',
  'antique',
  'vintage',
  'collectible',
  'flea market',
  'swap meet',
  'liquidat',
  'salvage',
  'junk dealer',
  'used goods',
  'auction',
  'secondhand',
  'second hand',
  'pre-owned',
  'preowned',
  'surplus',
  'rummage',
  'estate auction',
];

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
  'motor vehicle parts',
  'auto parts',
  'used car',
  'used auto',
];

function nameMatchesKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return SALE_TYPE_KEYWORDS.some((kw) => lower.includes(kw));
}

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

function mapCategory(naicsCode: string, name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('auction')) return 'AUCTION_HOUSE';
  if (lower.includes('pawn')) return 'PAWN_SHOP';
  if (lower.includes('antique')) return 'ANTIQUE_DEALER';
  if (lower.includes('consign')) return 'CONSIGNMENT';
  if (lower.includes('thrift')) return 'THRIFT_STORE';
  if (lower.includes('flea') || lower.includes('swap meet')) return 'FLEA_MARKET';
  if (lower.includes('vintage')) return 'VINTAGE';
  if (lower.includes('liquidat')) return 'LIQUIDATION';
  return 'RESALE_SHOP';
}

/**
 * Fetch all pages from Iowa Socrata JSON endpoint using $limit/$offset pagination.
 */
async function fetchSocrataAllPages(
  baseUrl: string,
  domain: string,
  whereClause: string,
  logPrefix: string
): Promise<any[]> {
  let offset = 0;
  const allRows: any[] = [];

  console.log(`${logPrefix} Fetching paginated JSON from ${domain}`);

  while (true) {
    const url = `${baseUrl}?$limit=${PAGE_SIZE}&$offset=${offset}&$where=${encodeURIComponent(whereClause)}`;
    await defaultRateLimiter.waitBeforeRequest(domain);

    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      console.error(`${logPrefix} JSON fetch failed: HTTP ${response.status} from ${url}`);
      break;
    }

    const rows: any[] = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) break;

    allRows.push(...rows);
    console.log(`${logPrefix} offset=${offset}: ${rows.length} rows (total so far: ${allRows.length})`);

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allRows;
}

/**
 * Iowa secondary sale scraper — Phase 2.
 * Source: Iowa DOR Retail Sales & Retail Use Business Registrations (mydata.iowa.gov)
 */
export async function runIowaPhase2Scraper(): Promise<void> {
  // mydata.iowa.gov (Socrata) is fully retired as of 2026-08-01 — the domain
  // redirects to socrata.com and 404s on every dataset, not just this one.
  // No replacement dataset was found on data.iowa.gov (new, non-Socrata portal;
  // no public JSON/CSV API discovered). Exit cleanly so the batch stays green.
  console.log('[IowaPhase2] Skipping — mydata.iowa.gov (Socrata tenant) is retired (all datasets 404, domain redirects to socrata.com)');
  console.log('[IowaPhase2] No replacement Iowa open data portal found. To unblock: check https://data.iowa.gov for a JSON/CSV API covering retail sales tax permits.');
  return;
}
