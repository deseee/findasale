/**
 * Pennsylvania Business Registry Scraper (Phase 2)
 * Data source: PA Registered Businesses by County (data.pa.gov)
 * CSV URL: https://data.pa.gov/api/views/xvd7-5r2c/rows.csv?accessType=DOWNLOAD
 * Covers all 14 secondhand sale types via keyword filter
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 *
 * Matches all secondary sale business types:
 *   - Always-include activities: AUCTIONEER, PAWNBROKER, JUNK DEALER,
 *     SECONDHAND DEALER, CONSIGNMENT
 *   - All other rows: keyword filter on business name
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

const PA_OPEN_DATA_CSV_URL =
  'https://data.pa.gov/api/views/xvd7-5r2c/rows.csv?accessType=DOWNLOAD';
const PA_OPEN_DATA_DOMAIN = 'data.pa.gov';

// Activities that always indicate a secondhand-sale business — include regardless of name
const ALWAYS_INCLUDE_ACTIVITIES = new Set([
  'AUCTIONEER',
  'PAWNBROKER',
  'JUNK DEALER',
  'SECONDHAND DEALER',
  'CONSIGNMENT',
]);

// Case-insensitive keywords — any match includes the row
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

/**
 * Return true if the business name matches at least one keyword (case-insensitive).
 */
function nameMatchesKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return SALE_TYPE_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Return true if the business name contains a false-positive fragment.
 */
function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Map a PA business activity to a valid getOrCreateScrapedOrganizer category.
 */
function mapCategory(activity: string): string {
  const upper = activity.toUpperCase();
  if (upper.includes('AUCTION')) return 'AUCTION_HOUSE';
  return 'RESALE_SHOP';
}

/**
 * Pennsylvania Business Registry secondary sale scraper.
 * Fetches all PA registered business records and filters to secondhand-sale
 * matches using activity codes and keyword matching on business name.
 */
export async function runPennsylvaniaPhase2Scraper(): Promise<void> {
  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;

  console.log('[PennsylvaniaPhase2] Starting secondary sale scraper via PA Open Data Portal');
  console.log(`[PennsylvaniaPhase2] Source: ${PA_OPEN_DATA_CSV_URL}`);

  try {
    await defaultRateLimiter.waitBeforeRequest(PA_OPEN_DATA_DOMAIN);

    const response = await fetch(PA_OPEN_DATA_CSV_URL, {
      method: 'GET',
      headers: {
        Accept: 'text/csv,*/*',
      },
      signal: AbortSignal.timeout(600000),
    });

    if (!response.ok) {
      console.error(
        `[PennsylvaniaPhase2] CSV fetch failed: HTTP ${response.status} from ${PA_OPEN_DATA_CSV_URL}`
      );
      return;
    }

    const csvText = await response.text();
    const lines = csvText.split('\n');

    if (lines.length < 2) {
      console.warn('[PennsylvaniaPhase2] CSV response appears empty or malformed');
      return;
    }

    // Parse header row — normalise to lowercase with single spaces
    const headers = parseCsvLine(lines[0]).map((h) =>
      h.toLowerCase().replace(/\s+/g, ' ').trim()
    );

    console.log('[PennsylvaniaPhase2] CSV headers found:', headers.join(', '));

    const col = (name: string): number => headers.indexOf(name);

    // PA Socrata column probe — try multiple common variations
    const iBusinessName =
      col('business name') !== -1 ? col('business name') :
      col('trade name') !== -1 ? col('trade name') :
      col('business_name') !== -1 ? col('business_name') :
      col('entity name') !== -1 ? col('entity name') :
      col('name') !== -1 ? col('name') : -1;

    const iTradeName =
      col('trade name') !== -1 ? col('trade name') :
      col('trade_name') !== -1 ? col('trade_name') :
      col('dba') !== -1 ? col('dba') : -1;

    const iCity =
      col('city') !== -1 ? col('city') :
      col('principal city') !== -1 ? col('principal city') :
      col('mailing city') !== -1 ? col('mailing city') :
      col('business city') !== -1 ? col('business city') : -1;

    const iState =
      col('state') !== -1 ? col('state') :
      col('principal state') !== -1 ? col('principal state') :
      col('business state') !== -1 ? col('business state') : -1;

    const iZip =
      col('zip') !== -1 ? col('zip') :
      col('zip code') !== -1 ? col('zip code') :
      col('zip_code') !== -1 ? col('zip_code') :
      col('postal code') !== -1 ? col('postal code') :
      col('principal zip') !== -1 ? col('principal zip') : -1;

    const iLicenseNumber =
      col('license number') !== -1 ? col('license number') :
      col('license_number') !== -1 ? col('license_number') :
      col('license no') !== -1 ? col('license no') :
      col('registration number') !== -1 ? col('registration number') :
      col('business id') !== -1 ? col('business id') : -1;

    const iActivity =
      col('business activity') !== -1 ? col('business activity') :
      col('activity') !== -1 ? col('activity') :
      col('type') !== -1 ? col('type') :
      col('license type') !== -1 ? col('license type') :
      col('business type') !== -1 ? col('business type') : -1;

    if (iBusinessName === -1) {
      console.error(
        '[PennsylvaniaPhase2] Could not find business name column in CSV header. Headers found:',
        headers.join(', ')
      );
      return;
    }

    totalFetched = lines.length - 1;
    console.log(`[PennsylvaniaPhase2] CSV fetched — ${totalFetched} data rows`);

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const fields = parseCsvLine(line);

        const businessNameRaw = iBusinessName >= 0 ? (fields[iBusinessName] || '').trim() : '';
        const tradeNameRaw    = iTradeName    >= 0 ? (fields[iTradeName]    || '').trim() : '';
        const activityRaw     = iActivity     >= 0 ? (fields[iActivity]     || '').trim() : '';
        const activity        = activityRaw.toUpperCase();

        // Composite name: prefer trade name; fall back to business name
        const displayName = tradeNameRaw || businessNameRaw;

        if (!displayName) continue;

        // Determine whether this row qualifies
        const alwaysInclude = ALWAYS_INCLUDE_ACTIVITIES.has(activity);
        const keywordMatch  = !alwaysInclude && nameMatchesKeyword(displayName);

        if (!alwaysInclude && !keywordMatch) continue;

        // Filter out false positives by name
        if (nameIsExcluded(displayName)) continue;

        totalMatched++;

        const licenseNumber = iLicenseNumber >= 0 ? (fields[iLicenseNumber] || '').trim() : '';
        const city          = iCity          >= 0 ? (fields[iCity]           || '').trim() : '';
        const zip           = iZip           >= 0 ? (fields[iZip]            || '').trim() : '';

        // dedupeKey: prefer license number, fall back to slugified name
        const slugifiedName = displayName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .slice(0, 40);
        const dedupeKey        = `PA-SECONDARY-${licenseNumber || slugifiedName}`;
        const businessCategory = mapCategory(activity);
        const isStateLicensed  = alwaysInclude;

        console.log(
          `[PennsylvaniaPhase2] Match #${totalMatched}: "${displayName}" (${city || 'PA'}) — activity: ${activity || 'keyword'} — dedupeKey: ${dedupeKey} — stateLicensed: ${isStateLicensed}`
        );

        const orgId = await getOrCreateScrapedOrganizer(
          displayName,              // businessName
          'PennsylvaniaPhase2',     // sourceName
          city || 'Pennsylvania',   // city
          'PA',                     // state
          undefined,                // esnOrgId
          undefined,                // googlePlaceId
          undefined,                // foursquareVenueId
          undefined,                // hereBusinessId
          businessCategory,         // businessCategory
          undefined,                // contactEmail
          undefined,                // phone
          undefined                 // website
        );

        if (orgId) {
          totalUpserted++;
        }
      } catch (rowErr) {
        console.error(`[PennsylvaniaPhase2] Error on row ${i}:`, rowErr);
      }
    }

    console.log(
      `[PennsylvaniaPhase2] Done — fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );
  } catch (error) {
    console.error('[PennsylvaniaPhase2] Scraper fatal error:', error);
    throw error;
  }
}
