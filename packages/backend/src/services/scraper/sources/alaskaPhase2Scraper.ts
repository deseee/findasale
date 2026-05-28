/**
 * Alaska DCCED Active Business License — Secondary Sale Business Scraper (Phase 2)
 *
 * PRIMARY source: ArcGIS Hub NAICS-filtered CSV
 *   Hub page: https://gis.data.alaska.gov/datasets/DCCED::alaska-dcced-cbpl-active-business-license-csv-file-download
 *   Direct CSV: https://opendata.arcgis.com/datasets/[layerId]/FeatureServer/0/query (GeoJSON/CSV)
 *   Socrata CSV endpoint (mirrors the Hub): https://data.alaska.gov/api/views/[dataset]/rows.csv
 *
 * The AK Hub CSV contains all active business licenses with NAICS codes.
 * We filter to secondary-sale NAICS codes:
 *   453310 — Used Merchandise Stores
 *   459510 — Consignment stores (under Miscellaneous Retailers)
 *   522298 — All other nondepository credit intermediation (pawnbrokers)
 *   453998 — All Other Miscellaneous Store Retailers
 *   561990 — All Other Support Services (estate sale companies)
 *   453920 — Art Dealers
 *   812990 — All Other Personal Services (incl. auction services)
 *   713990 — All Other Amusement / Recreation (swap meet venues)
 *
 * FALLBACK: AK DCCED MapServer (Business Licenses layer 2) — keyword-based
 *   https://maps.commerce.alaska.gov/server/rest/services/Economics_Related/Business_Licenses/MapServer/2/query
 *   Used when the Hub CSV download is unavailable (HTTP error or empty response).
 *
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// ArcGIS Hub — AK DCCED active business license CSV download
// The Hub page redirects to an OpenData FeatureServer. We use the direct CSV
// download endpoint which mirrors the DCCED data with NAICS codes.
// NOTE: The Hub page URL is the discovery URL; the actual data endpoint may shift.
// We try multiple known endpoint patterns in order.
const AK_HUB_CSV_URLS = [
  // ArcGIS FeatureServer CSV export (all records, NAICS field present)
  'https://opendata.arcgis.com/api/v3/datasets/DCCED-cbpl-active-business-license/downloads/data?format=csv&spatialRefId=4326',
  // Fallback: Socrata-style data.alaska.gov (if mirrored)
  'https://data.alaska.gov/api/views/cbpl-active-business-license/rows.csv?accessType=DOWNLOAD',
  // Second fallback: direct ArcGIS REST CSV via the known service URL pattern
  'https://services.arcgis.com/pGfbNJoYypmNq86F/arcgis/rest/services/DCCED_Active_Business_Licenses/FeatureServer/0/query?where=1%3D1&outFields=*&f=json',
];

const AK_HUB_DOMAIN = 'opendata.arcgis.com';
const AK_DATA_DOMAIN = 'data.alaska.gov';
const AK_SERVICES_DOMAIN = 'services.arcgis.com';

// ArcGIS MapServer fallback (keyword-based, no NAICS)
const MAPSERVER_QUERY_URL =
  'https://maps.commerce.alaska.gov/server/rest/services/Economics_Related/Business_Licenses/MapServer/2/query';
const MAPSERVER_DOMAIN = 'maps.commerce.alaska.gov';
const MAPSERVER_PAGE_SIZE = 2000;

// Subset of NAICS that are always secondary-sale (no keyword check required)
const ALWAYS_INCLUDE_NAICS = new Set([
  '453310', // Used Merchandise Stores
  '459510', // Consignment stores
  '522298', // Pawnbrokers
  '453920', // Art Dealers
  '812990', // Other Personal Services (auction)
  '713990', // Amusement/Recreation (swap meet)
]);

// NAICS that need a keyword check before including
const BROADER_NAICS = new Set([
  '453998', // All Other Misc. Store Retailers
  '561990', // All Other Support Services
]);

// Case-insensitive keywords — any match on business name includes a BROADER_NAICS row
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
  'charity sale',
  'yard sale',
  'garage sale',
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
  'fishing',
  'charter',
  'tour guide',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a single CSV line respecting quoted fields.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/** Return true if the business name contains a false-positive fragment. */
function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

/** Return true if the business name matches at least one sale-type keyword. */
function nameMatchesKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return SALE_TYPE_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Map NAICS code or business name to a scraper category string. */
function mapCategory(naics: string, businessName: string): string {
  const lower = businessName.toLowerCase();
  if (naics === '522298') return 'PAWN_SHOP';
  if (lower.includes('auction')) return 'AUCTION_HOUSE';
  if (lower.includes('consign')) return 'CONSIGNMENT';
  if (lower.includes('antique')) return 'ANTIQUE_DEALER';
  if (lower.includes('thrift')) return 'THRIFT_STORE';
  if (lower.includes('flea') || lower.includes('swap meet')) return 'FLEA_MARKET';
  return 'RESALE_SHOP';
}

// ---------------------------------------------------------------------------
// Primary path: ArcGIS Hub NAICS-filtered CSV
// ---------------------------------------------------------------------------

/**
 * Attempt to fetch the AK DCCED business license CSV from a given URL.
 * Returns the raw CSV text, or null on failure.
 */
async function tryFetchCsv(url: string, domain: string): Promise<string | null> {
  try {
    await defaultRateLimiter.waitBeforeRequest(domain);
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'text/csv,*/*' },
      signal: AbortSignal.timeout(90000), // CSV can be large — 90s
    });
    if (!response.ok) {
      console.log(`[Alaska Phase2] CSV fetch ${url} → HTTP ${response.status} (skipping)`);
      return null;
    }
    const text = await response.text();
    if (!text || text.trim().length < 100) {
      console.log(`[Alaska Phase2] CSV fetch ${url} → empty or trivially short response (skipping)`);
      return null;
    }
    return text;
  } catch (err) {
    console.log(`[Alaska Phase2] CSV fetch ${url} → error (skipping):`, err);
    return null;
  }
}

/**
 * Parse the AK DCCED CSV and upsert secondary-sale businesses.
 * Filters by NAICS code first, then by keyword (for BROADER_NAICS).
 */
async function processNaicsCsv(
  csvText: string
): Promise<{ matched: number; upserted: number }> {
  const lines = csvText.split('\n');
  if (lines.length < 2) {
    console.warn('[Alaska Phase2] CSV appears empty or has no data rows');
    return { matched: 0, upserted: 0 };
  }

  const headers = parseCsvLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/\s+/g, '_').trim()
  );
  console.log('[Alaska Phase2] CSV headers:', headers.join(', '));

  // Column index helper — tries multiple common field name variants
  const col = (...names: string[]): number => {
    for (const name of names) {
      const idx = headers.indexOf(name);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const iName = col('business_name', 'businessname', 'company_name', 'name');
  const iNaics = col('naics_code', 'naics', 'naicscode', 'primary_naics', 'naics_description');
  const iLicense = col('license_number', 'licensenumber', 'license_no', 'license_nbr', 'cbpl_number');
  const iCity = col('physical_city', 'city', 'business_city', 'mailing_city', 'location_city');
  const iStatus = col('status', 'license_status', 'active_status');

  if (iName === -1) {
    console.error('[Alaska Phase2] Cannot find business name column in CSV — aborting CSV parse');
    return { matched: 0, upserted: 0 };
  }

  let matched = 0;
  let upserted = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const fields = parseCsvLine(line);

      const businessName = (iName >= 0 ? fields[iName] || '' : '').trim();
      if (!businessName) continue;

      // Status filter (skip inactive if status column exists)
      const statusRaw = (iStatus >= 0 ? fields[iStatus] || '' : '').trim().toUpperCase();
      if (statusRaw && statusRaw !== 'ACTIVE' && statusRaw !== 'CURRENT' && statusRaw !== 'OPEN' && statusRaw !== 'A') {
        continue;
      }

      const naicsRaw = (iNaics >= 0 ? fields[iNaics] || '' : '').trim();
      // Normalize: extract numeric NAICS prefix (first 6 digits)
      const naicsCode = naicsRaw.replace(/\D/g, '').slice(0, 6);

      // Determine if this row qualifies
      const isAlways = ALWAYS_INCLUDE_NAICS.has(naicsCode);
      const isbroader = BROADER_NAICS.has(naicsCode);
      const nameMatch = nameMatchesKeyword(businessName);

      // No NAICS at all — fall back to keyword matching only
      const qualifies = isAlways || (isbroader && nameMatch) || (!naicsCode && nameMatch);

      if (!qualifies) continue;
      if (nameIsExcluded(businessName)) continue;

      matched++;

      const licenseNumber = (iLicense >= 0 ? fields[iLicense] || '' : '').trim();
      const city = (iCity >= 0 ? fields[iCity] || '' : '').trim();
      const businessCategory = mapCategory(naicsCode, businessName);

      try {
        const orgId = await getOrCreateScrapedOrganizer(
          businessName,
          'AlaskaPhase2',
          city || 'Alaska',
          'AK',
          undefined, // esnOrgId
          undefined, // googlePlaceId
          undefined, // foursquareVenueId
          undefined, // hereBusinessId
          businessCategory,
          undefined, // contactEmail
          undefined, // phone
          undefined, // website
          undefined, // lat
          undefined, // lng
          true,      // isStateLicensed
          'AK',      // licenseState
          licenseNumber || undefined // licenseNumber
        );
        if (orgId) upserted++;
      } catch (upsertErr) {
        console.error(`[Alaska Phase2] Upsert error for "${businessName}":`, upsertErr);
      }
    } catch (rowErr) {
      console.error(`[Alaska Phase2] Row ${i} parse error:`, rowErr);
    }
  }

  return { matched, upserted };
}

// ---------------------------------------------------------------------------
// Fallback: MapServer keyword-based scraper
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

function buildMapServerWhereClause(): string {
  const likeClauses = SALE_TYPE_KEYWORDS.map(
    (kw) => `BusinessName LIKE '%${kw}%'`
  ).join(' OR ');
  return `Status = 'Active' AND (${likeClauses})`;
}

async function fetchMapServerPage(offset: number): Promise<MapServerResponse | null> {
  const params = new URLSearchParams({
    where: buildMapServerWhereClause(),
    outFields: 'BusinessName,LicenseNumber,PhysicalCity,PhysicalState,PhysicalLine1,PhysicalZipOut,Status',
    resultRecordCount: String(MAPSERVER_PAGE_SIZE),
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
      console.warn(`[Alaska Phase2] MapServer error at offset ${offset}: ${json.error.message}`);
      return null;
    }
    return json;
  } catch (err) {
    console.warn(`[Alaska Phase2] MapServer fetch failed at offset ${offset}:`, err);
    return null;
  }
}

async function runMapServerFallback(): Promise<{ matched: number; upserted: number }> {
  console.log('[Alaska Phase2] Falling back to MapServer keyword search...');

  let totalFetched = 0;
  let matched = 0;
  let upserted = 0;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const page = await fetchMapServerPage(offset);

    if (!page) {
      if (offset === 0) {
        console.error('[Alaska Phase2] MapServer returned no response on first page — aborting fallback');
        return { matched: 0, upserted: 0 };
      }
      break;
    }

    if (!page.features || page.features.length === 0) {
      console.log(`[Alaska Phase2] MapServer: no more records at offset ${offset}`);
      break;
    }

    totalFetched += page.features.length;

    for (const feature of page.features) {
      const a = feature.attributes;
      const name = (a.BusinessName || '').trim();
      if (!name) continue;
      if (nameIsExcluded(name)) continue;

      matched++;

      const licenseNumber = (a.LicenseNumber || '').trim();
      const city = (a.PhysicalCity || '').trim();
      const businessCategory = mapCategory('', name);

      try {
        const orgId = await getOrCreateScrapedOrganizer(
          name,
          'AlaskaPhase2',
          city || 'Alaska',
          'AK',
          undefined, undefined, undefined, undefined,
          businessCategory,
          undefined, undefined, undefined, undefined, undefined,
          true,
          'AK',
          licenseNumber || undefined
        );
        if (orgId) upserted++;
      } catch (upsertErr) {
        console.error(`[Alaska Phase2] MapServer upsert error for "${name}":`, upsertErr);
      }
    }

    hasMore = page.exceededTransferLimit === true;
    offset += page.features.length;
    if (page.features.length < MAPSERVER_PAGE_SIZE) hasMore = false;
  }

  console.log(
    `[Alaska Phase2] MapServer fallback done — fetched: ${totalFetched}, matched: ${matched}, upserted: ${upserted}`
  );
  return { matched, upserted };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Alaska DCCED Active Business License secondary sale scraper.
 *
 * Strategy:
 *   1. Try ArcGIS Hub NAICS-filtered CSV download (multiple URL patterns)
 *   2. If CSV unavailable → fall back to MapServer keyword search
 *
 * NAICS codes covered: 453310, 459510, 522298, 453998, 561990, 453920, 812990, 713990
 * All 14 sale-type keywords are covered via keyword fallback and NAICS alignment.
 */
export async function runAlaskaPhase2Scraper(): Promise<void> {
  console.log('[Alaska Phase2] Starting secondary sale scraper — ArcGIS Hub NAICS CSV + MapServer fallback');

  let csvSucceeded = false;
  let totalMatched = 0;
  let totalUpserted = 0;

  // Try each Hub CSV URL in order
  const csvDomains = [AK_HUB_DOMAIN, AK_DATA_DOMAIN, AK_SERVICES_DOMAIN];
  for (let i = 0; i < AK_HUB_CSV_URLS.length; i++) {
    const url = AK_HUB_CSV_URLS[i];
    const domain = csvDomains[Math.min(i, csvDomains.length - 1)];
    console.log(`[Alaska Phase2] Trying Hub CSV URL [${i + 1}/${AK_HUB_CSV_URLS.length}]: ${url}`);

    const csvText = await tryFetchCsv(url, domain);
    if (!csvText) continue;

    console.log(`[Alaska Phase2] Hub CSV downloaded — ${csvText.length.toLocaleString()} bytes. Parsing...`);
    const { matched, upserted } = await processNaicsCsv(csvText);
    totalMatched += matched;
    totalUpserted += upserted;

    if (matched > 0 || upserted > 0) {
      csvSucceeded = true;
      console.log(
        `[Alaska Phase2] Hub CSV source [${i + 1}] — matched: ${matched}, upserted: ${upserted}`
      );
      break; // Stop on first successful source
    }

    // CSV fetched but zero matches — try next URL before falling back
    console.log(`[Alaska Phase2] Hub CSV URL [${i + 1}] returned 0 matches — trying next source`);
  }

  if (!csvSucceeded) {
    console.log('[Alaska Phase2] All Hub CSV sources failed or returned 0 matches — using MapServer fallback');
    const { matched, upserted } = await runMapServerFallback();
    totalMatched += matched;
    totalUpserted += upserted;
  }

  console.log(
    `[Alaska Phase2] Done — matched: ${totalMatched}, upserted: ${totalUpserted}`
  );
}
