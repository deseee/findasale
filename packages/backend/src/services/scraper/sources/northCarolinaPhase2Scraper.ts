/**
 * North Carolina Secondary Sale Business Scraper (Phase 2)
 *
 * Dual-source approach:
 *
 * Source 1 — NCALB (ncalb.gov): NC Auctioneer Licensing Board public licensee list.
 *   Fetches the same HTML directory as Phase 1 but filters via SALE_TYPE_KEYWORDS
 *   rather than ingesting all auctioneers. isStateLicensed: true.
 *
 * Source 2 — NC SoS Socrata (data.nc.gov): NC Secretary of State business registry.
 *   Endpoint: https://data.nc.gov/resource/aqbk-hcxb.json (Business Registration dataset)
 *   SoQL LIKE filter on BusinessName. Paginated at 1000 records.
 *   isStateLicensed: false (business registration ≠ trade license).
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

const NCALB_SEARCH_URL = 'https://www.ncalb.gov/licensee-search';
const NCALB_DOMAIN = 'www.ncalb.gov';

const NC_SOS_API_URL = 'https://data.nc.gov/resource/aqbk-hcxb.json';
const NC_SOS_DOMAIN = 'data.nc.gov';

const PAGE_SIZE = 1000;

// Case-insensitive keywords — used for both server-side SoQL LIKE (SoS) and
// client-side name matching (NCALB).
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

// ---------------------------------------------------------------------------
// Source 1: NCALB — NC Auctioneer Licensing Board
// ---------------------------------------------------------------------------

interface NcalbRecord {
  name: string;
  licenseNumber: string;
  city: string;
}

async function fetchNcalbRecords(): Promise<NcalbRecord[]> {
  console.log('[NC Phase2] NCALB: fetching licensee search page');

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

    // Client-side keyword filter — only ingest secondary sale relevant businesses
    if (!nameMatchesKeyword(name)) continue;
    if (nameIsExcluded(name)) continue;

    records.push({ name, licenseNumber, city });
  }

  console.log(`[NC Phase2] NCALB: ${records.length} keyword-matched active records`);
  return records;
}

// ---------------------------------------------------------------------------
// Source 2: NC SoS Socrata (data.nc.gov)
// ---------------------------------------------------------------------------

interface NcSosRecord {
  BusinessName?: string;
  Status?: string;
  City?: string;
  Zip?: string;
  [key: string]: string | undefined;
}

/**
 * Build the SoQL $where clause with LIKE conditions for all SALE_TYPE_KEYWORDS.
 * NC SoS Socrata uses uppercase column names — match what the dataset exposes.
 */
function buildSoqlWhere(): string {
  return SALE_TYPE_KEYWORDS.map(
    (kw) => `upper(BusinessName) LIKE upper('%${kw}%')`
  ).join(' OR ');
}

async function fetchNcSosPage(offset: number): Promise<NcSosRecord[]> {
  const params = new URLSearchParams({
    $where: buildSoqlWhere(),
    $select: 'BusinessName,Status,City,Zip',
    $limit: String(PAGE_SIZE),
    $offset: String(offset),
  });

  const url = `${NC_SOS_API_URL}?${params.toString()}`;

  try {
    await defaultRateLimiter.waitBeforeRequest(NC_SOS_DOMAIN);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-App-Token': '', // public endpoint — no token required
      },
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      console.warn(`[NC Phase2] SoS API HTTP ${response.status} at offset ${offset}`);
      return [];
    }

    const json = (await response.json()) as NcSosRecord[];
    return Array.isArray(json) ? json : [];
  } catch (err) {
    console.warn(`[NC Phase2] SoS API fetch failed at offset ${offset}:`, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * North Carolina Phase 2 secondary sale scraper.
 * Runs NCALB (state auctioneer licenses) and NC SoS Socrata (business registry)
 * in sequence. Dedup is handled by getOrCreateScrapedOrganizer.
 */
export async function runNorthCarolinaPhase2Scraper(): Promise<void> {
  console.log('[NC Phase2] Starting North Carolina secondary sale scraper (Phase 2)');

  let totalUpserted = 0;

  // -------------------------------------------------------------------
  // Source 1: NCALB
  // -------------------------------------------------------------------
  console.log('[NC Phase2] === Source 1: NCALB Auctioneer Licensing Board ===');

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
  // Source 2: NC SoS Socrata
  // -------------------------------------------------------------------
  console.log('[NC Phase2] === Source 2: NC Secretary of State Business Registry ===');

  let sosOffset = 0;
  let sosTotalFetched = 0;
  let sosUpserted = 0;

  while (true) {
    const page = await fetchNcSosPage(sosOffset);

    if (page.length === 0) {
      console.log(`[NC Phase2] SoS: no more records at offset ${sosOffset}`);
      break;
    }

    sosTotalFetched += page.length;

    for (const record of page) {
      const name = (record.BusinessName || '').trim();
      if (!name) continue;
      if (nameIsExcluded(name)) continue;

      const city = (record.City || '').trim();
      const dedupeKey = `NC-SOS-${slugify(name)}`;
      const category = mapCategory(name);

      console.log(`[NC Phase2] SoS upsert: ${dedupeKey} — ${name}`);

      try {
        const orgId = await getOrCreateScrapedOrganizer(
          name,                     // businessName
          'NorthCarolinaPhase2',    // sourceName
          city || 'North Carolina', // city
          'NC',                     // state
          undefined,                // esnOrgId
          undefined,                // googlePlaceId
          undefined,                // foursquareVenueId
          undefined,                // hereBusinessId
          category,                 // businessCategory
          undefined,                // contactEmail
          undefined,                // phone
          undefined,                // website
          undefined,                // lat
          undefined,                // lng
          false,                    // isStateLicensed (SoS registration ≠ trade license)
          'NC',                     // licenseState
          undefined,                // licenseNumber
          'NC-SoS'                  // sourceLabel
        );
        if (orgId) {
          sosUpserted++;
          totalUpserted++;
        }
      } catch (err) {
        console.error(`[NC Phase2] SoS upsert error for "${name}":`, err);
      }
    }

    if (page.length < PAGE_SIZE) break;
    sosOffset += page.length;
  }

  console.log(`[NC Phase2] SoS source complete — ${sosTotalFetched} fetched, ${sosUpserted} upserted`);
  console.log(`[NC Phase2] North Carolina Phase 2 scraper complete — total upserted: ${totalUpserted}`);
}
