/**
 * Alaska DCCED Active Business License — Secondary Sale Business Scraper (Phase 2)
 * Primary source: AK DCCED MapServer — Business Licenses layer (ID: 2)
 *   https://maps.commerce.alaska.gov/server/rest/services/Economics_Related/Business_Licenses/MapServer/2/query
 * Fields: BusinessName, LicenseNumber, PhysicalCity, PhysicalState, PhysicalLine1, PhysicalZipOut, Status
 * MaxRecordCount: 2000 per page; Supports Pagination: true; Supports SQL LIKE: true
 *
 * NOTE: MapServer covers ~88% of AK active licenses (only those with matchable
 * physical city). The 12% gap are licenses with unmatched city names — acceptable
 * for directory purposes. Status='Active' filter applied server-side.
 *
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 *
 * Uses SQL LIKE keyword WHERE clause for server-side filtering.
 * No NAICS codes available in this source — business name matching only.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

const MAPSERVER_QUERY_URL =
  'https://maps.commerce.alaska.gov/server/rest/services/Economics_Related/Business_Licenses/MapServer/2/query';
const MAPSERVER_DOMAIN = 'maps.commerce.alaska.gov';

const PAGE_SIZE = 2000;

// Case-insensitive keywords — matched server-side via SQL LIKE WHERE clause
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

/**
 * Return true if the business name contains a false-positive fragment.
 */
function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Map a business name to a valid scraper category (inferred — no license type in MapServer).
 */
function mapCategory(businessName: string): string {
  const lower = businessName.toLowerCase();
  if (lower.includes('auction')) return 'AUCTION_HOUSE';
  return 'RESALE_SHOP';
}

// ---------------------------------------------------------------------------
// MapServer paginated query approach
// ---------------------------------------------------------------------------

interface MapServerFeature {
  attributes: {
    BusinessName: string | null;
    LicenseNumber: string | null;
    PhysicalCity: string | null;
    PhysicalState: string | null;
    PhysicalLine1: string | null;
    PhysicalZipOut: string | null;
    Status: string | null;
  };
}

interface MapServerResponse {
  features?: MapServerFeature[];
  error?: { code: number; message: string };
  exceededTransferLimit?: boolean;
}

/**
 * Build the SQL WHERE clause — keyword LIKE conditions applied server-side.
 * ArcGIS MapServer supports standard SQL LIKE with % wildcards.
 * Status='Active' pre-filters to live licenses only.
 */
function buildWhereClause(): string {
  const likeClauses = SALE_TYPE_KEYWORDS.map(
    (kw) => `BusinessName LIKE '%${kw}%'`
  ).join(' OR ');
  return `Status = 'Active' AND (${likeClauses})`;
}

async function fetchMapServerPage(offset: number): Promise<MapServerResponse | null> {
  const params = new URLSearchParams({
    where: buildWhereClause(),
    outFields: 'BusinessName,LicenseNumber,PhysicalCity,PhysicalState,PhysicalLine1,PhysicalZipOut,Status',
    resultRecordCount: String(PAGE_SIZE),
    resultOffset: String(offset),
    f: 'json',
  });

  const url = `${MAPSERVER_QUERY_URL}?${params.toString()}`;

  try {
    await defaultRateLimiter.waitBeforeRequest(MAPSERVER_DOMAIN);
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      console.warn(`[Alaska Phase2] MapServer HTTP ${response.status} at offset ${offset}`);
      return null;
    }

    const json = (await response.json()) as MapServerResponse;
    if (json.error) {
      console.warn(
        `[Alaska Phase2] MapServer error at offset ${offset}: ${json.error.message}`
      );
      return null;
    }
    return json;
  } catch (err) {
    console.warn(`[Alaska Phase2] MapServer fetch failed at offset ${offset}:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Alaska DCCED Active Business License secondary sale scraper.
 * Queries the AK Commerce MapServer (Business Licenses layer 2) with SQL LIKE
 * keyword filtering. Paginated at 2000 records per page.
 * Covers ~88% of active AK licenses (those with matchable physical city).
 */
export async function runAlaskaPhase2Scraper(): Promise<void> {
  console.log('[Alaska Phase2] Starting secondary sale scraper — Alaska DCCED MapServer');
  console.log(`[Alaska Phase2] Source: ${MAPSERVER_QUERY_URL}`);

  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;
  let offset = 0;
  let hasMore = true;

  try {
    while (hasMore) {
      const page = await fetchMapServerPage(offset);

      if (!page) {
        if (offset === 0) {
          console.error('[Alaska Phase2] MapServer returned no response on first page — aborting');
          return;
        }
        break;
      }

      if (!page.features || page.features.length === 0) {
        console.log(`[Alaska Phase2] No more records at offset ${offset}`);
        break;
      }

      totalFetched += page.features.length;

      for (const feature of page.features) {
        const a = feature.attributes;
        const name = (a.BusinessName || '').trim();
        if (!name) continue;

        // Client-side exclude-fragment filter (can't do NOT LIKE efficiently server-side)
        if (nameIsExcluded(name)) continue;

        totalMatched++;

        const licenseNumber = (a.LicenseNumber || '').trim();
        const city = (a.PhysicalCity || '').trim();

        const slugifiedName = name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .slice(0, 40);
        const dedupeKey = `AK-SECONDARY-${licenseNumber || slugifiedName}`;
        const category = mapCategory(name);

        console.log(`[Alaska Phase2] Matched: ${dedupeKey} — ${name}`);

        try {
          const orgId = await getOrCreateScrapedOrganizer(
            name,                     // businessName
            'AlaskaPhase2',           // sourceName
            city || 'Alaska',         // city
            'AK',                     // state
            undefined,                // esnOrgId
            undefined,                // googlePlaceId
            undefined,                // foursquareVenueId
            undefined,                // hereBusinessId
            category,                 // businessCategory
            undefined,                // contactEmail
            undefined,                // phone
            undefined                 // website
          );
          if (orgId) totalUpserted++;
        } catch (upsertErr) {
          console.error(`[Alaska Phase2] Upsert error for "${name}":`, upsertErr);
        }
      }

      hasMore = page.exceededTransferLimit === true;
      offset += page.features.length;
      if (page.features.length < PAGE_SIZE) hasMore = false;
    }

    console.log(
      `[Alaska Phase2] Done — fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );
  } catch (error) {
    console.error('[Alaska Phase2] Scraper fatal error:', error);
    throw error;
  }
}
