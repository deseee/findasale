/**
 * Illinois IDFPR Professional Licensing + Chicago Business Licenses — Secondary Sale Scraper (Phase 2)
 * Sources:
 *   1. IDFPR Professional Licensing on data.illinois.gov
 *      https://data.illinois.gov/resource/pzzh-kp68.csv  (~paginated, $limit/$offset)
 *   2. Chicago Business Licenses on data.cityofchicago.org
 *      https://data.cityofchicago.org/resource/uupf-x98q.csv (~paginated, $limit/$offset)
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 *
 * Matches secondary sale business types:
 *   - Always-include license_type (substring match): AUCTIONEER, SECONDHAND DEALER,
 *     PAWNBROKER, JUNK DEALER, CONSIGNMENT STORE
 *   - Broader license_type (require keyword match on name): RETAIL MERCHANT,
 *     GENERAL MERCHANDISE, DEALER
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

const IL_IDFPR_CSV_BASE = 'https://data.illinois.gov/resource/pzzh-kp68.csv';
const IL_IDFPR_DOMAIN = 'data.illinois.gov';

const CHICAGO_BIZ_CSV_BASE = 'https://data.cityofchicago.org/resource/uupf-x98q.csv';
const CHICAGO_BIZ_DOMAIN = 'data.cityofchicago.org';

const PAGE_LIMIT = 50000;

// License type substrings that always indicate a secondhand-sale business
const ALWAYS_INCLUDE_SUBSTRINGS = [
  'AUCTIONEER',
  'SECONDHAND DEALER',
  'PAWNBROKER',
  'JUNK DEALER',
  'CONSIGNMENT STORE',
];

// Broader license types that require a keyword match on business name
const BROADER_LICENSE_TYPES = new Set([
  'RETAIL MERCHANT',
  'GENERAL MERCHANDISE',
  'DEALER',
]);

// Case-insensitive keywords — any match includes the row (when paired with a broader type)
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

// False-positive name fragments — exclude row if business name contains any
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
 * Parse a single CSV line respecting quoted fields (commas inside quotes are ignored).
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote inside a quoted field
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

function licenseTypeAlwaysInclude(licenseType: string): boolean {
  const upper = licenseType.toUpperCase();
  return ALWAYS_INCLUDE_SUBSTRINGS.some((sub) => upper.includes(sub));
}

function nameMatchesKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return SALE_TYPE_KEYWORDS.some((kw) => lower.includes(kw));
}

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

function mapCategory(licenseType: string): string {
  const upper = licenseType.toUpperCase();
  if (upper.includes('AUCTION')) return 'AUCTION_HOUSE';
  return 'RESALE_SHOP';
}

/**
 * Fetch all pages from a Socrata CSV endpoint using $limit/$offset pagination.
 * Returns all lines concatenated (header only on first page).
 */
async function fetchSocrataAllPages(baseUrl: string, domain: string): Promise<string[]> {
  let offset = 0;
  let allLines: string[] = [];
  let headerIncluded = false;

  console.log(`[IllinoisPhase2] Fetching paginated CSV from ${domain}`);

  while (true) {
    const url = `${baseUrl}?$limit=${PAGE_LIMIT}&$offset=${offset}`;
    await defaultRateLimiter.waitBeforeRequest(domain);

    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'text/csv,*/*' },
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      console.error(`[IllinoisPhase2] CSV fetch failed: HTTP ${response.status} from ${url}`);
      break;
    }

    const csvText = await response.text();
    const lines = csvText.split('\n').filter((l) => l.trim());

    if (lines.length < 2) break; // empty page

    if (!headerIncluded) {
      allLines = allLines.concat(lines);
      headerIncluded = true;
    } else {
      // Skip header row on subsequent pages
      allLines = allLines.concat(lines.slice(1));
    }

    const dataRowsThisPage = lines.length - 1;
    console.log(`[IllinoisPhase2] ${domain} offset=${offset}: ${dataRowsThisPage} rows`);

    if (dataRowsThisPage < PAGE_LIMIT) break; // last page
    offset += PAGE_LIMIT;
  }

  return allLines;
}

/**
 * Process IDFPR state licensing CSV.
 * Column probing (try variations): license_type, first_name, last_name, business_name,
 * city, state, zip, license_number
 */
async function processIdfprCsv(lines: string[]): Promise<{ matched: number; upserted: number }> {
  let matched = 0;
  let upserted = 0;

  if (lines.length < 2) return { matched, upserted };

  const rawHeaders = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_').trim());

  // Column probe helper — try multiple name variants
  const probe = (...names: string[]): number => {
    for (const name of names) {
      const idx = rawHeaders.indexOf(name);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const iLicenseType  = probe('license_type', 'licensetype', 'type');
  const iFirstName    = probe('first_name', 'firstname');
  const iLastName     = probe('last_name', 'lastname');
  const iBusinessName = probe('business_name', 'businessname', 'dba', 'doing_business_as');
  const iCity         = probe('city', 'business_city');
  const iState        = probe('state', 'business_state', 'license_state');
  const iLicenseNum   = probe('license_number', 'licensenumber', 'lic_no', 'license_no');

  if (iLicenseType === -1) {
    console.error('[IllinoisPhase2] IDFPR CSV: missing license_type column. Headers:', rawHeaders.join(', '));
    return { matched, upserted };
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const fields = parseCsvLine(line);

      const licenseTypeRaw = iLicenseType >= 0 ? (fields[iLicenseType] || '') : '';
      const licenseType    = licenseTypeRaw.trim().toUpperCase();

      const businessNameRaw = iBusinessName >= 0 ? (fields[iBusinessName] || '').trim() : '';
      const firstName       = iFirstName    >= 0 ? (fields[iFirstName]    || '').trim() : '';
      const lastName        = iLastName     >= 0 ? (fields[iLastName]     || '').trim() : '';

      // Prefer business_name; fall back to "First Last"
      const displayName = businessNameRaw || [firstName, lastName].filter(Boolean).join(' ');
      if (!displayName) continue;

      const alwaysInclude = licenseTypeAlwaysInclude(licenseType);
      const broaderMatch  = BROADER_LICENSE_TYPES.has(licenseType) && nameMatchesKeyword(displayName);

      if (!alwaysInclude && !broaderMatch) continue;
      if (nameIsExcluded(displayName)) continue;

      matched++;

      const licenseNumber = iLicenseNum >= 0 ? (fields[iLicenseNum] || '').trim() : '';
      const city          = iCity       >= 0 ? (fields[iCity]       || '').trim() : '';
      const state         = iState      >= 0 ? (fields[iState]      || '').trim() || 'IL' : 'IL';

      const dedupeKey = `IL-SECONDARY-${licenseNumber || displayName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30)}`;
      const businessCategory = mapCategory(licenseType);

      const orgId = await getOrCreateScrapedOrganizer(
        displayName,          // businessName
        'IllinoisPhase2',     // sourceName
        city || 'Illinois',   // city
        state,                // state
        undefined,            // esnOrgId
        undefined,            // googlePlaceId
        undefined,            // foursquareVenueId
        undefined,            // hereBusinessId
        businessCategory,     // businessCategory
        undefined,            // contactEmail
        undefined,            // phone
        undefined,            // website
        undefined,            // lat
        undefined,            // lng
        true,                 // isStateLicensed
        state || 'IL',        // licenseState
        licenseNumber || undefined // licenseNumber
      );

      if (orgId) upserted++;
    } catch (rowErr) {
      console.error(`[IllinoisPhase2] IDFPR row ${i} error:`, rowErr);
    }
  }

  return { matched, upserted };
}

/**
 * Process Chicago Business Licenses CSV.
 * Filter on license_description or business_activity + keyword match.
 * Columns vary — detected from header row.
 */
async function processChicagoCsv(lines: string[]): Promise<{ matched: number; upserted: number }> {
  let matched = 0;
  let upserted = 0;

  if (lines.length < 2) return { matched, upserted };

  const rawHeaders = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_').trim());

  const probe = (...names: string[]): number => {
    for (const name of names) {
      const idx = rawHeaders.indexOf(name);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  // Try multiple candidate column names for business name and activity
  const iBusinessName = probe('legal_name', 'doing_business_as_name', 'dba_name', 'business_name');
  const iActivity     = probe('license_description', 'business_activity', 'license_type');
  const iCity         = probe('city', 'address_city');
  const iState        = probe('state', 'address_state');
  const iLicenseNum   = probe('license_number', 'account_number', 'license_no');

  if (iBusinessName === -1) {
    console.warn('[IllinoisPhase2] Chicago CSV: could not identify business name column. Headers:', rawHeaders.join(', '));
    return { matched, upserted };
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const fields = parseCsvLine(line);

      const businessName = iBusinessName >= 0 ? (fields[iBusinessName] || '').trim() : '';
      if (!businessName) continue;

      const activityRaw = iActivity >= 0 ? (fields[iActivity] || '').trim() : '';
      const activity    = activityRaw.toUpperCase();

      // Always include known secondhand activity types, or keyword-match on name/activity
      const alwaysInclude = licenseTypeAlwaysInclude(activity);
      const keywordMatch  = nameMatchesKeyword(businessName) || nameMatchesKeyword(activityRaw.toLowerCase());

      if (!alwaysInclude && !keywordMatch) continue;
      if (nameIsExcluded(businessName)) continue;

      matched++;

      const licenseNumber = iLicenseNum >= 0 ? (fields[iLicenseNum] || '').trim() : '';
      const city          = iCity       >= 0 ? (fields[iCity]       || '').trim() : 'Chicago';
      const state         = iState      >= 0 ? (fields[iState]      || '').trim() || 'IL' : 'IL';

      const dedupeKey = `IL-SECONDARY-CHI-${licenseNumber || businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30)}`;
      const licenseType = activity || 'RETAIL MERCHANT';
      const businessCategory = mapCategory(licenseType);

      const orgId = await getOrCreateScrapedOrganizer(
        businessName,                  // businessName
        'IllinoisChicagoPhase2',       // sourceName
        city || 'Chicago',             // city
        state,                         // state
        undefined,                     // esnOrgId
        undefined,                     // googlePlaceId
        undefined,                     // foursquareVenueId
        undefined,                     // hereBusinessId
        businessCategory,              // businessCategory
        undefined,                     // contactEmail
        undefined,                     // phone
        undefined,                     // website
        undefined,                     // lat
        undefined,                     // lng
        true,                          // isStateLicensed
        state || 'IL',                 // licenseState
        licenseNumber || undefined     // licenseNumber
      );

      if (orgId) upserted++;
    } catch (rowErr) {
      console.error(`[IllinoisPhase2] Chicago row ${i} error:`, rowErr);
    }
  }

  return { matched, upserted };
}

/**
 * Illinois secondary sale scraper — Phase 2.
 * Source 1: IDFPR Professional Licensing (data.illinois.gov) — paginated Socrata CSV
 * Source 2: Chicago Business Licenses (data.cityofchicago.org) — paginated Socrata CSV
 */
export async function runIllinoisPhase2Scraper(): Promise<void> {
  console.log('[IllinoisPhase2] Starting secondary sale scraper');
  console.log(`[IllinoisPhase2] Primary source: ${IL_IDFPR_CSV_BASE}`);
  console.log(`[IllinoisPhase2] Secondary source: ${CHICAGO_BIZ_CSV_BASE}`);

  let totalMatched  = 0;
  let totalUpserted = 0;

  try {
    // --- Source 1: IDFPR state licensing ---
    console.log('[IllinoisPhase2] Fetching IDFPR state licensing data...');
    const idfprLines = await fetchSocrataAllPages(IL_IDFPR_CSV_BASE, IL_IDFPR_DOMAIN);
    console.log(`[IllinoisPhase2] IDFPR total rows fetched: ${idfprLines.length - 1}`);

    const idfprResult = await processIdfprCsv(idfprLines);
    totalMatched  += idfprResult.matched;
    totalUpserted += idfprResult.upserted;
    console.log(`[IllinoisPhase2] IDFPR done — matched: ${idfprResult.matched}, upserted: ${idfprResult.upserted}`);

    // --- Source 2: Chicago Business Licenses ---
    console.log('[IllinoisPhase2] Fetching Chicago Business Licenses data...');
    const chicagoLines = await fetchSocrataAllPages(CHICAGO_BIZ_CSV_BASE, CHICAGO_BIZ_DOMAIN);
    console.log(`[IllinoisPhase2] Chicago total rows fetched: ${chicagoLines.length - 1}`);

    const chicagoResult = await processChicagoCsv(chicagoLines);
    totalMatched  += chicagoResult.matched;
    totalUpserted += chicagoResult.upserted;
    console.log(`[IllinoisPhase2] Chicago done — matched: ${chicagoResult.matched}, upserted: ${chicagoResult.upserted}`);

    console.log(
      `[IllinoisPhase2] Scraper complete — total matched: ${totalMatched}, total upserted: ${totalUpserted}`
    );
  } catch (error) {
    console.error('[IllinoisPhase2] Scraper fatal error:', error);
    throw error;
  }
}
