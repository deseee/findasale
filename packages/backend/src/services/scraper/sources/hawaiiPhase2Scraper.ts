/**
 * Hawaii Open Data — Secondary Sale Business Scraper (Phase 2)
 * Sources:
 *   1. Honolulu Open Data (Socrata): https://data.honolulu.gov/resource/9k54-ztb8.json
 *   2. Hawaii DCCA Business Registration: https://opendata.hawaii.gov (Socrata)
 * ADR-073: Directory Scraper Phase 2 — State/city business licensing data
 *
 * Fetches business records from Hawaii open data portals and filters by
 * keyword for secondhand sale types. Paginates via Socrata $limit/$offset.
 *
 * MUST throw if zero results across all sources.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

// --- Sources ---
// Honolulu business registrations
const HONOLULU_API = 'https://data.honolulu.gov/resource/9k54-ztb8.json';
const HONOLULU_DOMAIN = 'data.honolulu.gov';

// Hawaii statewide datasets — DCCA Business Registration + HGBP Retail
// These are Socrata discovery endpoints; we try known dataset IDs
const HAWAII_OPENDATA_BASE = 'https://opendata.hawaii.gov/resource';
const HAWAII_DOMAIN = 'opendata.hawaii.gov';

// Known Socrata dataset IDs to try on opendata.hawaii.gov
const HAWAII_DATASET_IDS = [
  'p36c-uh88', // DCCA PVL active licenses
  'hrt2-kxhp', // DCCA Business Registration
  'i7x8-bpwv', // General excise tax licenses (business registry)
  'nh3b-mca2', // Active business registrations
];

const PAGE_LIMIT = 5000;

// Keywords for secondhand sale businesses
const SALE_TYPE_KEYWORDS = [
  'auction',
  'estate sale',
  'consignment',
  'consign',
  'antique',
  'pawn',
  'thrift',
  'resale',
  'secondhand',
  'second hand',
  'flea market',
  'swap meet',
  'vintage',
  'collectible',
  'liquidat',
  'salvage',
  'junk dealer',
  'used goods',
  'pre-owned',
  'preowned',
  'surplus',
  'rummage',
];

// False-positive exclusions
const EXCLUDE_FRAGMENTS = [
  'real estate', 'realty', 'realtor', 'mortgage', 'bank', 'credit union',
  'financial', 'insurance', 'law office', 'attorney', 'lawyer',
  'dental', 'dentist', 'medical', 'clinic', 'pharmacy', 'hospital',
  'restaurant', 'hotel', 'motel',
];

// License types that always indicate secondhand sale
const ALWAYS_INCLUDE_TYPES = new Set([
  'PAWNBROKER',
  'SECONDHAND DEALER',
  'AUCTIONEER',
  'JUNK DEALER',
  'CONSIGNMENT',
  'AUCTION',
  'SECONDHAND',
  'PAWN',
]);

function nameMatchesKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return SALE_TYPE_KEYWORDS.some((kw) => lower.includes(kw));
}

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

function licenseTypeAlwaysInclude(licenseType: string): boolean {
  const upper = licenseType.toUpperCase();
  return Array.from(ALWAYS_INCLUDE_TYPES).some((t) => upper.includes(t));
}

function mapCategory(name: string, licenseType: string): string {
  const combined = `${name} ${licenseType}`.toUpperCase();
  if (combined.includes('AUCTION')) return 'AUCTION_HOUSE';
  if (combined.includes('PAWN')) return 'PAWN_SHOP';
  if (combined.includes('ANTIQUE') || combined.includes('VINTAGE')) return 'ANTIQUE_DEALER';
  if (combined.includes('CONSIGN')) return 'CONSIGNMENT';
  if (combined.includes('THRIFT')) return 'THRIFT_STORE';
  if (combined.includes('FLEA') || combined.includes('SWAP')) return 'FLEA_MARKET';
  if (combined.includes('LIQUIDAT')) return 'LIQUIDATION';
  return 'RESALE_SHOP';
}

/**
 * Process a single Socrata record — returns true if upserted.
 */
async function processRecord(record: Record<string, string>, source: string): Promise<boolean> {
  // Status filter — active only
  const status = (
    record['status'] ||
    record['license_status'] ||
    record['business_status'] ||
    record['reg_status'] ||
    ''
  ).trim().toUpperCase();

  if (status && !['ACTIVE', 'ISSUED', 'CURRENT', 'REGISTERED', ''].includes(status)) {
    return false;
  }

  // Resolve business name
  const businessName = (
    record['business_name'] ||
    record['dba_name'] ||
    record['licensee_name'] ||
    record['name'] ||
    record['trade_name'] ||
    record['owner_name'] ||
    ''
  ).trim();

  if (!businessName || businessName.length < 3) return false;

  // Resolve license type
  const licenseTypeRaw = (
    record['license_type'] ||
    record['license_description'] ||
    record['business_type'] ||
    record['type'] ||
    record['category'] ||
    ''
  ).trim();

  // Determine inclusion
  const alwaysInclude = licenseTypeRaw ? licenseTypeAlwaysInclude(licenseTypeRaw) : false;
  const keywordMatch = nameMatchesKeyword(businessName) || (licenseTypeRaw && nameMatchesKeyword(licenseTypeRaw));

  if (!alwaysInclude && !keywordMatch) return false;
  if (nameIsExcluded(businessName)) return false;

  const licenseNumber = (
    record['license_number'] ||
    record['license_no'] ||
    record['business_license'] ||
    record['reg_number'] ||
    ''
  ).trim();

  const city = (
    record['city'] ||
    record['location_city'] ||
    record['mailing_city'] ||
    record['physical_city'] ||
    ''
  ).trim() || 'Honolulu';

  const phone = (record['phone'] || record['telephone'] || '').trim() || undefined;
  const businessCategory = mapCategory(businessName, licenseTypeRaw);

  const orgId = await getOrCreateScrapedOrganizer(
    businessName,
    source,
    city,
    'HI',
    undefined,  // esnOrgId
    undefined,  // googlePlaceId
    undefined,  // foursquareVenueId
    undefined,  // hereBusinessId
    businessCategory,
    undefined,  // contactEmail
    phone,
    undefined,  // website
    undefined,  // lat
    undefined,  // lng
    licenseNumber ? true : undefined, // isStateLicensed
    licenseNumber ? 'Hawaii' : undefined, // licenseState
    licenseNumber || undefined,
  );

  return orgId !== null;
}

/**
 * Fetch paginated Socrata JSON records from a given endpoint.
 * Uses full-text search ($q) to reduce egress.
 */
async function fetchSocrataSource(
  baseUrl: string,
  domain: string,
  sourceName: string,
): Promise<{ fetched: number; matched: number; upserted: number }> {
  let fetched = 0;
  let matched = 0;
  let upserted = 0;
  let offset = 0;

  // Server-side full-text filter
  const searchTerms = 'pawnbroker secondhand auctioneer consignment thrift antique vintage auction pawn resale flea';
  const q = encodeURIComponent(searchTerms);

  console.log(`[HawaiiPhase2] Fetching from ${baseUrl}`);

  while (true) {
    const url = `${baseUrl}?$limit=${PAGE_LIMIT}&$offset=${offset}&$q=${q}`;
    await defaultRateLimiter.waitBeforeRequest(domain);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(60000),
      });
    } catch (fetchErr) {
      console.warn(`[HawaiiPhase2] Network error fetching ${domain}: ${fetchErr}`);
      break;
    }

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`[HawaiiPhase2] ${baseUrl} returned 404 — dataset may not exist`);
      } else {
        console.warn(`[HawaiiPhase2] ${baseUrl} returned HTTP ${response.status}`);
      }
      break;
    }

    let records: Record<string, string>[];
    try {
      records = await response.json();
    } catch {
      console.warn(`[HawaiiPhase2] Invalid JSON from ${domain} at offset ${offset}`);
      break;
    }

    if (!Array.isArray(records) || records.length === 0) {
      if (offset === 0) {
        console.log(`[HawaiiPhase2] ${baseUrl} returned 0 records on first page`);
      }
      break;
    }

    fetched += records.length;
    console.log(`[HawaiiPhase2] ${sourceName} offset ${offset}: ${records.length} records`);

    for (const record of records) {
      try {
        const didMatch = nameMatchesKeyword(
          (record['business_name'] || record['dba_name'] || record['name'] || '') +
          ' ' +
          (record['license_type'] || record['business_type'] || record['type'] || record['category'] || '')
        ) || licenseTypeAlwaysInclude(
          record['license_type'] || record['license_description'] || record['business_type'] || ''
        );

        if (!didMatch) continue;
        matched++;

        const wasUpserted = await processRecord(record, sourceName);
        if (wasUpserted) upserted++;
      } catch (rowErr) {
        console.error(`[HawaiiPhase2] Error processing record from ${sourceName}:`, rowErr);
      }
    }

    if (records.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }

  return { fetched, matched, upserted };
}

/**
 * Hawaii Open Data secondary sale scraper.
 * Fetches from Honolulu Open Data + Hawaii statewide Socrata datasets.
 * Keyword-filters for secondhand sale business types.
 *
 * Throws if zero results across all sources.
 */
export async function runHawaiiPhase2Scraper(): Promise<void> {
  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;

  console.log('[HawaiiPhase2] Starting secondary sale scraper');

  try {
    // Source 1: Honolulu Open Data
    console.log('[HawaiiPhase2] --- Source 1: Honolulu Open Data ---');
    const honolulu = await fetchSocrataSource(HONOLULU_API, HONOLULU_DOMAIN, 'HawaiiPhase2');
    totalFetched += honolulu.fetched;
    totalMatched += honolulu.matched;
    totalUpserted += honolulu.upserted;
    console.log(
      `[HawaiiPhase2] Honolulu: fetched=${honolulu.fetched}, matched=${honolulu.matched}, upserted=${honolulu.upserted}`
    );

    // Source 2: Hawaii statewide datasets
    for (const datasetId of HAWAII_DATASET_IDS) {
      const datasetUrl = `${HAWAII_OPENDATA_BASE}/${datasetId}.json`;
      console.log(`[HawaiiPhase2] --- Source: opendata.hawaii.gov dataset ${datasetId} ---`);

      const result = await fetchSocrataSource(datasetUrl, HAWAII_DOMAIN, 'HawaiiPhase2');
      totalFetched += result.fetched;
      totalMatched += result.matched;
      totalUpserted += result.upserted;

      console.log(
        `[HawaiiPhase2] Dataset ${datasetId}: fetched=${result.fetched}, matched=${result.matched}, upserted=${result.upserted}`
      );

      // If we got good results from one dataset, don't need to try all
      if (result.upserted >= 10) {
        console.log(`[HawaiiPhase2] Got ${result.upserted} upserts from ${datasetId}, skipping remaining datasets`);
        break;
      }
    }

    console.log(
      `[HawaiiPhase2] Completed — total fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );

    if (totalUpserted === 0 && totalMatched === 0) {
      throw new Error(
        '[HawaiiPhase2] Zero results found across all Hawaii open data sources. ' +
        'Endpoints may have changed. Check https://data.honolulu.gov and https://opendata.hawaii.gov manually.'
      );
    }
  } catch (error) {
    console.error('[HawaiiPhase2] Scraper fatal error:', error);
    throw error;
  }
}
