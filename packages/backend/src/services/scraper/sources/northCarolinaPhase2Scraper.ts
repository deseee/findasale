/**
 * North Carolina Secondary Sale Business Scraper (Phase 2)
 *
 * Dual-source approach:
 *
 * Source 1 — NCALB (ncalb.org): NC Auctioneer Licensing Board public licensee list.
 *   URL updated: www.ncalb.gov (NXDOMAIN as of 2025) → www.ncalb.org
 *   New path: /licensee-information/license-search
 *   The new site may be JS-rendered. If minimal HTML is detected, scraper logs a
 *   TODO with unblocking options and skips gracefully.
 *   isStateLicensed: true.
 *
 * Source 2 — NC SoS Socrata (data.nc.gov): DEAD as of 2025 (NXDOMAIN).
 *   data.nc.gov no longer resolves. The NC SoS bulk data is a paid subscription
 *   service (sosnc.gov/online_services/data_subscriptions) — no free API exists.
 *   Automated access to sosnc.gov search is explicitly prohibited by NC SoS.
 *   This source is stubbed with unblocking documentation.
 *
 * UNBLOCKING — Source 2 options (in priority order):
 *   1. NC SoS Data Subscription: https://www.sosnc.gov/online_services/data_subscriptions
 *      Contact: [email protected] — weekly CSV of all registered entities.
 *   2. NC OSBM open data portal: https://linc.osbm.nc.gov/pages/home/
 *      Check for a business license dataset with keyword-filterable business names.
 *   3. NC Commerce Business Information: https://www.commerce.nc.gov/data-tools-reports/business-information-reports
 *
 * ADR-073: Directory Scraper Phase 2 — State licensing + SoS business data
 *
 * Dedup is handled by getOrCreateScrapedOrganizer dedupeKey — both sources
 * can be run in sequence without manual dedup logic.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Updated: www.ncalb.gov (NXDOMAIN) → www.ncalb.org (verified 2025)
const NCALB_SEARCH_URL = 'https://www.ncalb.org/licensee-information/license-search';
const NCALB_DOMAIN = 'www.ncalb.org';

// data.nc.gov is NXDOMAIN as of 2025 — stub only, no live endpoint
const NC_SOS_DOMAIN = 'data.nc.gov';

const PAGE_SIZE = 1000;

// Case-insensitive keywords — used for client-side name matching (NCALB)
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
];

// False-positive name fragments — exclude row if business name contains any of these
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

function nameMatchesKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return SALE_TYPE_KEYWORDS.some((kw) => lower.includes(kw));
}

function mapCategory(businessName: string): string {
  const lower = businessName.toLowerCase();
  if (lower.includes('auction')) return 'AUCTION_HOUSE';
  return 'RESALE_SHOP';
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
}

function extractText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Detect if a page response is JS-rendered (minimal HTML, no real table content).
 * Returns true when the page requires a browser to render meaningful content.
 */
function isJsRendered(html: string): boolean {
  const tdCount = (html.match(/<td/gi) || []).length;
  const hasTable = html.includes('<table');
  const hasAppRoot =
    html.includes('<div id="app"') ||
    html.includes('<div id="root"') ||
    html.includes('ng-app') ||
    html.includes('data-react-root') ||
    html.includes('__NEXT_DATA__');

  if (!hasTable || tdCount < 5) return true;
  if (hasAppRoot && tdCount < 20) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Source 1: NCALB — NC Auctioneer Licensing Board (www.ncalb.org)
// ---------------------------------------------------------------------------

interface NcalbRecord {
  name: string;
  licenseNumber: string;
  city: string;
}

async function fetchNcalbRecords(): Promise<NcalbRecord[]> {
  console.log('[NC Phase2] NCALB: fetching licensee search page at ncalb.org');

  await defaultRateLimiter.waitBeforeRequest(NCALB_DOMAIN);

  let html: string;

  try {
    const response = await fetch(NCALB_SEARCH_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(45000),
    });

    if (!response.ok) {
      console.warn(`[NC Phase2] NCALB: HTTP ${response.status} — skipping source`);
      return [];
    }
    html = await response.text();
  } catch (err) {
    console.warn('[NC Phase2] NCALB: fetch failed — skipping source:', err);
    return [];
  }

  // Detect JS-rendered shell — the new ncalb.org site may require a browser
  if (isJsRendered(html)) {
    console.warn(
      '[NC Phase2] NCALB: page appears JS-rendered — no server-side licensee table detected. ' +
      'TODO: implement Playwright headless scrape of https://www.ncalb.org/licensee-information/license-search — ' +
      'set SHOW=ALL in the filter, then parse the resulting HTML table. ' +
      'Alternatively request a licensee roster CSV from the board: https://www.ncalb.org/agency-information/board-information'
    );
    return [];
  }

  const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
  const rows = html.match(rowRegex) || [];
  console.log(`[NC Phase2] NCALB: found ${rows.length} table rows`);

  const records: NcalbRecord[] = [];

  for (const row of rows) {
    const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
    const cells = row.match(cellRegex) || [];
    if (cells.length < 2) continue;

    const name = extractText(cells[0]);
    const licenseNumber = extractText(cells[1]);
    const city = cells.length > 3 ? extractText(cells[3]) : '';
    const statusRaw = cells.length > 2 ? extractText(cells[2]) : '';

    if (!name || !licenseNumber) continue;
    if (statusRaw && statusRaw.toLowerCase() !== 'active') continue;

    if (!nameMatchesKeyword(name)) continue;
    if (nameIsExcluded(name)) continue;

    records.push({ name, licenseNumber, city });
  }

  console.log(`[NC Phase2] NCALB: ${records.length} keyword-matched active records`);
  return records;
}

// ---------------------------------------------------------------------------
// Source 2: NC SoS — STUB (data.nc.gov is NXDOMAIN as of 2025)
// ---------------------------------------------------------------------------

/**
 * NC SoS Socrata source is no longer available.
 * data.nc.gov resolved NXDOMAIN as of 2025. The NC SoS bulk business registry
 * requires a paid data subscription — no free public API exists.
 *
 * Logs unblocking options and returns immediately.
 */
async function fetchNcSosRecords(): Promise<void> {
  console.warn(
    '[NC Phase2] SoS: data.nc.gov is NXDOMAIN — source unavailable. ' +
    'Unblocking options: ' +
    '(1) NC SoS paid data subscription: https://www.sosnc.gov/online_services/data_subscriptions — contact [email protected]; ' +
    '(2) NC OSBM open data portal: https://linc.osbm.nc.gov/pages/home/ — check for business license dataset; ' +
    '(3) NC Commerce business reports: https://www.commerce.nc.gov/data-tools-reports/business-information-reports'
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * North Carolina Phase 2 secondary sale scraper.
 *
 * Source 1: NCALB (ncalb.org) — state auctioneer licenses.
 *   URL updated from www.ncalb.gov (NXDOMAIN) to www.ncalb.org.
 *   Detects JS-rendered pages and degrades gracefully with TODO instructions.
 *
 * Source 2: data.nc.gov Socrata — DEAD (NXDOMAIN). Stubbed with unblocking docs.
 *
 * Dedup is handled by getOrCreateScrapedOrganizer.
 */
export async function runNorthCarolinaPhase2Scraper(): Promise<void> {
  console.log('[NC Phase2] Starting North Carolina secondary sale scraper (Phase 2)');

  let totalUpserted = 0;

  // -------------------------------------------------------------------
  // Source 1: NCALB (www.ncalb.org)
  // -------------------------------------------------------------------
  console.log('[NC Phase2] === Source 1: NCALB Auctioneer Licensing Board (ncalb.org) ===');

  const ncalbRecords = await fetchNcalbRecords();

  for (const record of ncalbRecords) {
    const { name, licenseNumber, city } = record;
    const dedupeKey = `NC-NCALB-${licenseNumber || slugify(name)}`;
    const category = mapCategory(name);

    console.log(`[NC Phase2] NCALB upsert: ${dedupeKey} — ${name}`);

    try {
      const orgId = await getOrCreateScrapedOrganizer(
        name,                       // businessName
        'NorthCarolinaPhase2',      // sourceName
        city || 'North Carolina',   // city
        'NC',                       // state
        undefined,                  // esnOrgId
        undefined,                  // googlePlaceId
        undefined,                  // foursquareVenueId
        undefined,                  // hereBusinessId
        category,                   // businessCategory
        undefined,                  // contactEmail
        undefined,                  // phone
        undefined,                  // website
        undefined,                  // lat
        undefined,                  // lng
        true,                       // isStateLicensed
        'NC',                       // licenseState
        licenseNumber || undefined, // licenseNumber
        'NCALB'                     // sourceLabel
      );
      if (orgId) totalUpserted++;
    } catch (err) {
      console.error(`[NC Phase2] NCALB upsert error for "${name}":`, err);
    }
  }

  console.log(`[NC Phase2] NCALB source complete — ${ncalbRecords.length} matched, ${totalUpserted} upserted so far`);

  // -------------------------------------------------------------------
  // Source 2: NC SoS Socrata — STUB (data.nc.gov dead)
  // -------------------------------------------------------------------
  console.log('[NC Phase2] === Source 2: NC SoS Socrata (STUB — data.nc.gov NXDOMAIN) ===');

  await fetchNcSosRecords();

  console.log(`[NC Phase2] North Carolina Phase 2 scraper complete — total upserted: ${totalUpserted}`);
}
