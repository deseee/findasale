/**
 * Louisiana Secondary Sale Business Scraper (Phase 2)
 * Sources:
 *   1. New Orleans Occupational Business Licenses — data.nola.gov
 *      https://data.nola.gov/resource/hjcd-grvu.json  (Socrata JSON API, paginated)
 *      Filter businesstype: Pawnshops, Flea Market, Art Dealers + keyword match on name
 *   2. Baton Rouge Business Registry — data.brla.gov
 *      https://data.brla.gov/resource/nx5f-3fxd.json  (Socrata JSON API)
 *      Filter NAICS: 453310 (Used Merchandise Stores), 522298 (Pawnshops)
 *      Plus keyword match on business_name for broader NAICS codes
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { batchUpsertScrapedOrganizers, ScrapedOrganizerRow } from '../index';

const NOLA_API_BASE = 'https://data.nola.gov/resource/hjcd-grvu.json';
const NOLA_DOMAIN = 'data.nola.gov';

const BATON_ROUGE_API_BASE = 'https://data.brla.gov/resource/nx5f-3fxd.json';
const BATON_ROUGE_DOMAIN = 'data.brla.gov';

const PAGE_SIZE = 10000;

// New Orleans business types that always indicate a secondhand-sale business
const NOLA_ALWAYS_INCLUDE_TYPES = new Set([
  'Pawnshops',
  'Flea Market',
]);

// New Orleans business types that require keyword match on business name
const NOLA_BROADER_TYPES = new Set([
  'Art Dealers',
  'Motor Vehicle Parts(Used) Wholesalers',
  'Gift, Novelty & Souvenir Stores',
  'General Merchandise Stores, All Other',
  'Hobby, Toy & Game Stores',
  'Jewelry Stores',
  'Book Stores',
  'Furniture Stores',
]);

// Baton Rouge NAICS codes that always include
const BR_ALWAYS_INCLUDE_NAICS = new Set([
  '453310', // Used Merchandise Stores
  '522298', // Pawnshops / All Other Nondepository Credit Intermediation
  '459510', // Used Merchandise Retailers
]);

// Baton Rouge NAICS codes requiring keyword match
const BR_BROADER_NAICS = new Set([
  '453998', // All Other Miscellaneous Store Retailers
  '459999', // All Other Miscellaneous Retailers
  '713990', // All Other Amusement and Recreation Industries (includes some auctioneers)
  '454390', // Other Direct Selling Establishments (some auctioneers)
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
];

function nameMatchesKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return SALE_TYPE_KEYWORDS.some((kw) => lower.includes(kw));
}

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

function mapCategoryFromNola(businessType: string, name: string): string {
  const lower = name.toLowerCase();
  if (businessType === 'Pawnshops' || lower.includes('pawn')) return 'PAWN_SHOP';
  if (lower.includes('auction')) return 'AUCTION_HOUSE';
  if (lower.includes('antique')) return 'ANTIQUE_DEALER';
  if (lower.includes('consign')) return 'CONSIGNMENT';
  if (lower.includes('thrift')) return 'THRIFT_STORE';
  if (businessType === 'Flea Market' || lower.includes('flea')) return 'FLEA_MARKET';
  if (lower.includes('vintage')) return 'VINTAGE';
  if (lower.includes('liquidat')) return 'LIQUIDATION';
  return 'RESALE_SHOP';
}

function mapCategoryFromNaics(naics: string, name: string): string {
  const lower = name.toLowerCase();
  if (naics === '522298' || lower.includes('pawn')) return 'PAWN_SHOP';
  if (lower.includes('auction')) return 'AUCTION_HOUSE';
  if (lower.includes('antique')) return 'ANTIQUE_DEALER';
  if (lower.includes('consign')) return 'CONSIGNMENT';
  if (lower.includes('thrift')) return 'THRIFT_STORE';
  if (lower.includes('flea') || lower.includes('swap meet')) return 'FLEA_MARKET';
  if (lower.includes('vintage')) return 'VINTAGE';
  if (lower.includes('liquidat')) return 'LIQUIDATION';
  return 'RESALE_SHOP';
}

/**
 * Fetch all pages from a Socrata JSON endpoint.
 */
async function fetchSocrataPages(
  baseUrl: string,
  domain: string,
  whereClause: string,
  logPrefix: string
): Promise<any[]> {
  let offset = 0;
  const allRows: any[] = [];

  console.log(`${logPrefix} Fetching from ${domain}`);

  while (true) {
    const url = `${baseUrl}?$limit=${PAGE_SIZE}&$offset=${offset}&$where=${encodeURIComponent(whereClause)}`;
    await defaultRateLimiter.waitBeforeRequest(domain);

    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      console.error(`${logPrefix} Fetch failed: HTTP ${response.status} from ${url}`);
      break;
    }

    const rows: any[] = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) break;

    allRows.push(...rows);
    console.log(`${logPrefix} offset=${offset}: ${rows.length} rows (total: ${allRows.length})`);

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allRows;
}

/**
 * Process New Orleans Occupational Business Licenses.
 */
async function processNolaData(): Promise<{ matched: number; upserted: number }> {
  let matched = 0;
  let upserted = 0;
  let batchRows: ScrapedOrganizerRow[] = [];

  // Always-include business types
  const alwaysTypes = [...NOLA_ALWAYS_INCLUDE_TYPES].map((t) => `'${t}'`).join(',');
  const alwaysWhere = `businesstype in(${alwaysTypes})`;

  console.log('[LouisianaPhase2] Fetching NOLA always-include business types...');
  const alwaysRows = await fetchSocrataPages(NOLA_API_BASE, NOLA_DOMAIN, alwaysWhere, '[LouisianaPhase2]');
  console.log(`[LouisianaPhase2] NOLA always-include rows: ${alwaysRows.length}`);

  for (const row of alwaysRows) {
    const businessName = (row.businessname || '').trim();
    if (!businessName) continue;
    if (nameIsExcluded(businessName)) continue;

    matched++;

    const city = (row.city || 'New Orleans').trim();
    const state = (row.state || 'LA').trim();
    const licenseNumber = (row.businesslicensenumber || '').trim();
    const businessType = (row.businesstype || '').trim();
    const phone = (row.phonenumber || '').trim();
    const lat = row.latitude ? parseFloat(row.latitude) : undefined;
    const lng = row.longitude ? parseFloat(row.longitude) : undefined;
    const businessCategory = mapCategoryFromNola(businessType, businessName);

    batchRows.push({
      businessName,
      sourceName: 'LouisianaPhase2',
      city,
      state,
      businessCategory,
      phone: phone || undefined,
      lat: lat && !isNaN(lat) ? lat : undefined,
      lng: lng && !isNaN(lng) ? lng : undefined,
      isStateLicensed: true,
      licenseState: 'LA',
      licenseNumber: licenseNumber || undefined,
    });
  }

  // Batch upsert (ADR-073 perf: replaces serial per-row upserts)
  const alwaysIds = await batchUpsertScrapedOrganizers(batchRows, 100);
  upserted = alwaysIds.filter((id) => id !== null).length;

  console.log(`[LouisianaPhase2] NOLA always-include done — matched: ${matched}, upserted: ${upserted}`);

  // Broader types — require keyword match
  const broaderTypes = [...NOLA_BROADER_TYPES].map((t) => `'${t}'`).join(',');
  const broaderWhere = `businesstype in(${broaderTypes})`;

  console.log('[LouisianaPhase2] Fetching NOLA broader business types...');
  const broaderRows = await fetchSocrataPages(NOLA_API_BASE, NOLA_DOMAIN, broaderWhere, '[LouisianaPhase2]');
  console.log(`[LouisianaPhase2] NOLA broader rows: ${broaderRows.length}`);

  let broaderMatched = 0;
  let broaderUpserted = 0;
  batchRows = [];

  for (const row of broaderRows) {
    const businessName = (row.businessname || '').trim();
    if (!businessName) continue;
    if (!nameMatchesKeyword(businessName)) continue;
    if (nameIsExcluded(businessName)) continue;

    broaderMatched++;

    const city = (row.city || 'New Orleans').trim();
    const state = (row.state || 'LA').trim();
    const licenseNumber = (row.businesslicensenumber || '').trim();
    const businessType = (row.businesstype || '').trim();
    const phone = (row.phonenumber || '').trim();
    const lat = row.latitude ? parseFloat(row.latitude) : undefined;
    const lng = row.longitude ? parseFloat(row.longitude) : undefined;
    const businessCategory = mapCategoryFromNola(businessType, businessName);

    batchRows.push({
      businessName,
      sourceName: 'LouisianaPhase2',
      city,
      state,
      businessCategory,
      phone: phone || undefined,
      lat: lat && !isNaN(lat) ? lat : undefined,
      lng: lng && !isNaN(lng) ? lng : undefined,
      isStateLicensed: true,
      licenseState: 'LA',
      licenseNumber: licenseNumber || undefined,
    });
  }

  // Batch upsert (ADR-073 perf: replaces serial per-row upserts)
  const broaderIds = await batchUpsertScrapedOrganizers(batchRows, 100);
  broaderUpserted = broaderIds.filter((id) => id !== null).length;

  matched += broaderMatched;
  upserted += broaderUpserted;
  console.log(`[LouisianaPhase2] NOLA broader done — matched: ${broaderMatched}, upserted: ${broaderUpserted}`);

  return { matched, upserted };
}

/**
 * Process Baton Rouge business registry (NAICS-filtered).
 */
async function processBatonRougeData(): Promise<{ matched: number; upserted: number }> {
  let matched = 0;
  let upserted = 0;
  let batchRows: ScrapedOrganizerRow[] = [];

  // Always-include NAICS
  const alwaysCodes = [...BR_ALWAYS_INCLUDE_NAICS].map((c) => `'${c}'`).join(',');
  const alwaysWhere = `business_naics_code in(${alwaysCodes})`;

  console.log('[LouisianaPhase2] Fetching Baton Rouge always-include NAICS rows...');
  const alwaysRows = await fetchSocrataPages(BATON_ROUGE_API_BASE, BATON_ROUGE_DOMAIN, alwaysWhere, '[LouisianaPhase2-BR]');
  console.log(`[LouisianaPhase2] BR always-include rows: ${alwaysRows.length}`);

  for (const row of alwaysRows) {
    const businessName = (row.business_name || '').trim();
    if (!businessName) continue;
    if (nameIsExcluded(businessName)) continue;

    matched++;

    const city = (row.city || 'Baton Rouge').trim();
    const phone = (row.phone_number || '').trim();
    const naics = (row.business_naics_code || '').trim();
    const businessCategory = mapCategoryFromNaics(naics, businessName);
    const lat = row.the_geom?.coordinates?.[1];
    const lng = row.the_geom?.coordinates?.[0];

    batchRows.push({
      businessName,
      sourceName: 'LouisianaPhase2',
      city,
      state: 'LA',
      businessCategory,
      phone: phone || undefined,
      lat: lat && lat !== 0 ? lat : undefined,
      lng: lng && lng !== 0 ? lng : undefined,
      isStateLicensed: true,
      licenseState: 'LA',
    });
  }

  // Batch upsert (ADR-073 perf: replaces serial per-row upserts)
  const alwaysIds = await batchUpsertScrapedOrganizers(batchRows, 100);
  upserted = alwaysIds.filter((id) => id !== null).length;

  console.log(`[LouisianaPhase2] BR always-include done — matched: ${matched}, upserted: ${upserted}`);

  // Broader NAICS — keyword match required
  const broaderCodes = [...BR_BROADER_NAICS].map((c) => `'${c}'`).join(',');
  const broaderWhere = `business_naics_code in(${broaderCodes})`;

  console.log('[LouisianaPhase2] Fetching Baton Rouge broader NAICS rows...');
  const broaderRows = await fetchSocrataPages(BATON_ROUGE_API_BASE, BATON_ROUGE_DOMAIN, broaderWhere, '[LouisianaPhase2-BR]');
  console.log(`[LouisianaPhase2] BR broader rows: ${broaderRows.length}`);

  let broaderMatched = 0;
  let broaderUpserted = 0;
  batchRows = [];

  for (const row of broaderRows) {
    const businessName = (row.business_name || '').trim();
    if (!businessName) continue;
    if (!nameMatchesKeyword(businessName)) continue;
    if (nameIsExcluded(businessName)) continue;

    broaderMatched++;

    const city = (row.city || 'Baton Rouge').trim();
    const phone = (row.phone_number || '').trim();
    const naics = (row.business_naics_code || '').trim();
    const businessCategory = mapCategoryFromNaics(naics, businessName);
    const lat = row.the_geom?.coordinates?.[1];
    const lng = row.the_geom?.coordinates?.[0];

    batchRows.push({
      businessName,
      sourceName: 'LouisianaPhase2',
      city,
      state: 'LA',
      businessCategory,
      phone: phone || undefined,
      lat: lat && lat !== 0 ? lat : undefined,
      lng: lng && lng !== 0 ? lng : undefined,
      isStateLicensed: true,
      licenseState: 'LA',
    });
  }

  // Batch upsert (ADR-073 perf: replaces serial per-row upserts)
  const broaderIds = await batchUpsertScrapedOrganizers(batchRows, 100);
  broaderUpserted = broaderIds.filter((id) => id !== null).length;

  matched += broaderMatched;
  upserted += broaderUpserted;
  console.log(`[LouisianaPhase2] BR broader done — matched: ${broaderMatched}, upserted: ${broaderUpserted}`);

  return { matched, upserted };
}

/**
 * Louisiana secondary sale scraper — Phase 2.
 * Source 1: New Orleans Occupational Business Licenses (data.nola.gov)
 * Source 2: Baton Rouge Business Registry (data.brla.gov)
 */
export async function runLouisianaPhase2Scraper(): Promise<void> {
  console.log('[LouisianaPhase2] Starting secondary sale scraper');
  console.log(`[LouisianaPhase2] NOLA source: ${NOLA_API_BASE}`);
  console.log(`[LouisianaPhase2] BR source: ${BATON_ROUGE_API_BASE}`);

  let totalMatched = 0;
  let totalUpserted = 0;

  try {
    // --- Source 1: New Orleans ---
    console.log('[LouisianaPhase2] Processing New Orleans business licenses...');
    const nolaResult = await processNolaData();
    totalMatched += nolaResult.matched;
    totalUpserted += nolaResult.upserted;
    console.log(`[LouisianaPhase2] NOLA done — matched: ${nolaResult.matched}, upserted: ${nolaResult.upserted}`);

    // --- Source 2: Baton Rouge ---
    console.log('[LouisianaPhase2] Processing Baton Rouge business registry...');
    const brResult = await processBatonRougeData();
    totalMatched += brResult.matched;
    totalUpserted += brResult.upserted;
    console.log(`[LouisianaPhase2] BR done — matched: ${brResult.matched}, upserted: ${brResult.upserted}`);

    console.log(`[LouisianaPhase2] Complete — total matched: ${totalMatched}, total upserted: ${totalUpserted}`);
  } catch (err) {
    console.error('[LouisianaPhase2] Fatal error:', err);
    throw err;
  }
}
