/**
 * Honolulu Open Data (Socrata) — Secondary Sale Business Scraper (Phase 2)
 * Source: https://data.honolulu.gov/resource/9k54-ztb8.json
 * Dataset: City and County of Honolulu business registrations
 * ADR-073: Directory Scraper Phase 2 — State/city business licensing data
 *
 * Honolulu county covers the main Hawaii market. This scraper fetches the
 * business registration dataset and filters by license type and keyword.
 *
 * Always-include license types: PAWNBROKER, SECONDHAND DEALER, AUCTIONEER,
 *   JUNK DEALER, CONSIGNMENT
 * Broader + keyword match: RETAIL, DEALER, MERCHANDISE
 *
 * Paginated Socrata JSON API with $limit/$offset until response < limit.
 *
 * Graceful fallback: if the Honolulu endpoint returns 404 or 0 records, logs a
 * note about the DCCA PVL dataset on opendata.hawaii.gov and returns.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

const HI_API_BASE = 'https://data.honolulu.gov/resource/9k54-ztb8.json';
const HI_DOMAIN = 'data.honolulu.gov';
const PAGE_LIMIT = 5000;

// License types that always indicate a secondhand-sale business
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

// Broader license types requiring keyword match on business name
const BROADER_TYPES = new Set([
  'RETAIL',
  'DEALER',
  'MERCHANDISE',
]);

// Keywords — any match includes the row when paired with a broader type
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

// False-positive name fragments
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

function licenseTypeAlwaysInclude(licenseType: string): boolean {
  const upper = licenseType.toUpperCase();
  return Array.from(ALWAYS_INCLUDE_TYPES).some((t) => upper.includes(t));
}

function licenseTypeIsBroader(licenseType: string): boolean {
  const upper = licenseType.toUpperCase();
  return Array.from(BROADER_TYPES).some((t) => upper.includes(t));
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
 * Honolulu Open Data secondary sale scraper.
 * Fetches all business registrations via paginated Socrata JSON API and
 * filters to secondhand-sale matches.
 *
 * If the endpoint returns 404 or no data, logs gracefully with a note
 * about the DCCA PVL dataset on opendata.hawaii.gov.
 */
export async function runHawaiiPhase2Scraper(): Promise<void> {
  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;
  let offset = 0;
  let endpointAvailable = false;

  console.log('[HawaiiPhase2] Starting secondary sale scraper via Honolulu Open Data');
  console.log(`[HawaiiPhase2] Source: ${HI_API_BASE}`);

  try {
    while (true) {
      // Server-side full-text filter — reduces egress vs. fetching all business registrations.
      // Client-side ALWAYS_INCLUDE_TYPES / keyword checks remain as secondary filters.
      const hiQ = encodeURIComponent('pawnbroker secondhand auctioneer consignment junk dealer vintage antique thrift auction');
      const url = `${HI_API_BASE}?$limit=${PAGE_LIMIT}&$offset=${offset}&$q=${hiQ}`;
      await defaultRateLimiter.waitBeforeRequest(HI_DOMAIN);

      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(
            '[HawaiiPhase2] Honolulu endpoint returned 404. ' +
            'The dataset may have been removed or relocated. ' +
            'TODO: Switch to the DCCA PVL dataset on opendata.hawaii.gov — ' +
            'search for "Professional and Vocational Licensing" at ' +
            'https://opendata.hawaii.gov/dataset?q=license&sort=score+desc for ' +
            'auctioneer, pawnbroker, and secondhand dealer license records statewide.'
          );
        } else {
          console.error(
            `[HawaiiPhase2] API fetch failed: HTTP ${response.status} at offset ${offset}`
          );
        }
        break;
      }

      const records: Record<string, string>[] = await response.json();

      if (!Array.isArray(records) || records.length === 0) {
        if (offset === 0 && !endpointAvailable) {
          console.warn(
            '[HawaiiPhase2] Honolulu endpoint returned 0 records on first page. ' +
            'Dataset may be empty or require a different query. ' +
            'TODO: Try the DCCA PVL dataset on opendata.hawaii.gov for statewide ' +
            'auctioneer, pawnbroker, and secondhand dealer license data.'
          );
        } else {
          console.log(`[HawaiiPhase2] No more records at offset ${offset}`);
        }
        break;
      }

      endpointAvailable = true;
      totalFetched += records.length;
      console.log(`[HawaiiPhase2] Page offset ${offset}: ${records.length} records`);

      for (const record of records) {
        try {
          // Status filter — active only
          const status = (
            record['status'] ||
            record['license_status'] ||
            record['business_status'] ||
            ''
          ).trim().toUpperCase();
          if (status && status !== 'ACTIVE' && status !== 'ISSUED' && status !== 'CURRENT') continue;

          // Resolve license type from common field variants
          const licenseTypeRaw = (
            record['license_type'] ||
            record['license_description'] ||
            record['business_type'] ||
            record['type'] ||
            ''
          ).trim();

          // Resolve business name
          const businessName = (
            record['business_name'] ||
            record['dba_name'] ||
            record['licensee_name'] ||
            record['name'] ||
            ''
          ).trim();

          if (!businessName) continue;

          // Determine inclusion
          const alwaysInclude = licenseTypeAlwaysInclude(licenseTypeRaw);
          const broaderMatch = licenseTypeIsBroader(licenseTypeRaw) && nameMatchesKeyword(businessName);
          const keywordFallback = !licenseTypeRaw && nameMatchesKeyword(businessName);

          if (!alwaysInclude && !broaderMatch && !keywordFallback) continue;
          if (nameIsExcluded(businessName)) continue;

          totalMatched++;

          const licenseNumber = (
            record['license_number'] ||
            record['license_no'] ||
            record['business_license'] ||
            ''
          ).trim();

          const city = (
            record['city'] ||
            record['location_city'] ||
            'Honolulu'
          ).trim();

          const zip = (record['zip'] || record['zip_code'] || '').trim();

          const address = (
            record['address'] ||
            record['location_address'] ||
            record['street_address'] ||
            ''
          ).trim();

          const dedupeKey = `HI-SECONDARY-${licenseNumber || businessName.toLowerCase().replace(/\s+/g, '-')}`;
          const businessCategory = mapCategory(licenseTypeRaw);

          const orgId = await getOrCreateScrapedOrganizer(
            businessName,
            'HawaiiPhase2',
            city || 'Honolulu',
            'HI',
            undefined,
            undefined,
            undefined,
            undefined,
            businessCategory,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            true,
            'HI',
            licenseNumber || undefined
          );

          if (orgId) {
            totalUpserted++;
          }
        } catch (rowErr) {
          console.error('[HawaiiPhase2] Error processing record:', rowErr);
        }
      }

      if (records.length < PAGE_LIMIT) break;
      offset += PAGE_LIMIT;
    }

    console.log(
      `[HawaiiPhase2] Done — fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );
  } catch (error) {
    console.error('[HawaiiPhase2] Scraper fatal error:', error);
    throw error;
  }
}
