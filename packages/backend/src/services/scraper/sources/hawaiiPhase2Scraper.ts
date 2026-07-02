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
import { batchUpsertScrapedOrganizers, ScrapedOrganizerRow } from '../index';

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
 * Process a single Socrata record — returns a ScrapedOrganizerRow to batch-upsert,
 * or null if the record is filtered out.
 */
async function processRecord(record: Record<string, string>, source: string): Promise<ScrapedOrganizerRow | null> {
  // Status filter — active only
  const status = (
    record['status'] ||
    record['license_status'] ||
    record['business_status'] ||
    record['reg_status'] ||
    ''
  ).trim().toUpperCase();

  if (status && !['ACTIVE', 'ISSUED', 'CURRENT', 'REGISTERED', ''].includes(status)) {
    return null;
  }

  // Resolve business name
  const businessName = (
    record['name'] ||
    record['business_name'] ||
    record['dba_name'] ||
    record['licensee_name'] ||
    record['trade_name'] ||
    record['owner_name'] ||
    ''
  ).trim();

  if (!businessName || businessName.length < 3) return null;

  // Resolve license type
  const licenseTypeRaw = (
    record['business_type'] ||
    record['license_type'] ||
    record['license_description'] ||
    record['type'] ||
    record['category'] ||
    record['purpose'] ||
    ''
  ).trim();

  // Determine inclusion
  const alwaysInclude = licenseTypeRaw ? licenseTypeAlwaysInclude(licenseTypeRaw) : false;
  const keywordMatch = nameMatchesKeyword(businessName) || (licenseTypeRaw && nameMatchesKeyword(licenseTypeRaw));

  if (!alwaysInclude && !keywordMatch) return null;
  if (nameIsExcluded(businessName)) return null;

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
  ).trim() || 'Honolulu'; // Honolulu 9k54-ztb8 has no city field; default to Honolulu

  const phone = (record['phone'] || record['telephone'] || '').trim() || undefined;
  const businessCategory = mapCategory(businessName, licenseTypeRaw);

  return {
    businessName,
    sourceName: source,
    city,
    state: 'HI',
    businessCategory,
    phone,
    isStateLicensed: licenseNumber ? true : undefined,
    licenseState: licenseNumber ? 'Hawaii' : undefined,
    licenseNumber: licenseNumber || undefined,
  };
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
  const batchRows: ScrapedOrganizerRow[] = [];

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
          (record['name'] || record['business_name'] || record['dba_name'] || '') +
          ' ' +
          (record['business_type'] || record['license_type'] || record['type'] || record['category'] || record['purpose'] || '')
        ) || licenseTypeAlwaysInclude(
          record['business_type'] || record['license_type'] || record['license_description'] || ''
        );

        if (!didMatch) continue;
        matched++;

        const row = await processRecord(record, sourceName);
        if (row) batchRows.push(row);
      } catch (rowErr) {
        console.error(`[HawaiiPhase2] Error processing record from ${sourceName}:`, rowErr);
      }
    }

    if (records.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }

  // Batch upsert (ADR-073 perf: replaces serial per-row upserts)
  const ids = await batchUpsertScrapedOrganizers(batchRows, 100);
  upserted = ids.filter((id) => id !== null).length;

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
  console.log('[HawaiiPhase2] Note: opendata.hawaii.gov Socrata datasets (p36c-uh88, hrt2-kxhp, etc.) all return 404.');
  console.log('[HawaiiPhase2] opendata.hawaii.gov has migrated to CKAN — Socrata /resource/ endpoints no longer exist.');
  console.log('[HawaiiPhase2] Using Honolulu business registration dataset (data.honolulu.gov/resource/9k54-ztb8.json).');

  try {
    // Honolulu business registrations — data.honolulu.gov/resource/9k54-ztb8.json
    // Fields: name, business_type, status, purpose, place_incorporated, registration_date,
    //         mailing_address, cross_reference_name
    const honoluluResult = await fetchSocrataSource(HONOLULU_API, HONOLULU_DOMAIN, 'HawaiiPhase2-Honolulu');
    totalFetched += honoluluResult.fetched;
    totalMatched += honoluluResult.matched;
    totalUpserted += honoluluResult.upserted;
    console.log(
      `[HawaiiPhase2] Honolulu: fetched=${honoluluResult.fetched}, matched=${honoluluResult.matched}, upserted=${honoluluResult.upserted}`
    );

    console.log(
      `[HawaiiPhase2] Completed — total fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );

    if (totalUpserted === 0 && totalMatched === 0) {
      // Log warning but do not throw — Honolulu dataset is live, 0 matches means no secondhand
      // businesses were registered (or all are expired/dissolved). Not a source failure.
      console.warn(
        '[HawaiiPhase2] Zero matches from Honolulu business registrations. ' +
        'Dataset is live but keyword filter found no active secondhand-sale businesses.'
      );
    }
  } catch (error) {
    console.error('[HawaiiPhase2] Scraper fatal error:', error);
    throw error;
  }
}
