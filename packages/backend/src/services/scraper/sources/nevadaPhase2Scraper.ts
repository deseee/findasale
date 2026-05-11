/**
 * Las Vegas OpenData (Socrata) — Secondary Sale Business Scraper (Phase 2)
 * Source: https://opendata.lasvegasnevada.gov/resource/jv8a-mrfg.json
 * Dataset: City of Las Vegas business licenses (~70%+ of NV population)
 * ADR-073: Directory Scraper Phase 2 — State/city business licensing data
 *
 * Matches all secondary sale business types:
 *   - Always-include license types: SECONDHAND DEALER, PAWNBROKER, AUCTIONEER,
 *     JUNK DEALER, CONSIGNMENT
 *   - Broader license types + keyword match on business name: RETAIL,
 *     GENERAL MERCHANDISE, DEALER
 *
 * Paginated Socrata JSON API with $limit/$offset until response < limit.
 * Filters to ACTIVE licenses only.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

const NV_API_BASE = 'https://opendata.lasvegasnevada.gov/resource/jv8a-mrfg.json';
const NV_DOMAIN = 'opendata.lasvegasnevada.gov';
const PAGE_LIMIT = 5000;

// License types that always indicate a secondhand-sale business
const ALWAYS_INCLUDE_TYPES = new Set([
  'SECONDHAND DEALER',
  'PAWNBROKER',
  'AUCTIONEER',
  'JUNK DEALER',
  'CONSIGNMENT',
]);

// Broader license types that require a keyword match on business name
const BROADER_TYPES = new Set([
  'RETAIL',
  'GENERAL MERCHANDISE',
  'DEALER',
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

// False-positive name fragments — exclude if business name contains any of these
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

function mapCategory(licenseType: string): string {
  const upper = licenseType.toUpperCase();
  if (upper.includes('AUCTION')) return 'AUCTION_HOUSE';
  return 'RESALE_SHOP';
}

/**
 * Las Vegas OpenData secondary sale scraper.
 * Fetches all active business licenses via paginated Socrata JSON API and
 * filters to secondhand-sale matches using license type and keyword matching.
 */
export async function runNevadaPhase2Scraper(): Promise<void> {
  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;
  let offset = 0;

  console.log('[NevadaPhase2] Starting secondary sale scraper via Las Vegas OpenData');
  console.log(`[NevadaPhase2] Source: ${NV_API_BASE}`);

  try {
    while (true) {
      // Server-side full-text filter — reduces egress vs. fetching all ~70k Las Vegas licenses.
      // Client-side ALWAYS_INCLUDE_TYPES / keyword checks remain as secondary filters.
      const nvQ = encodeURIComponent('pawnbroker secondhand auctioneer consignment junk dealer vintage antique thrift auction');
      const url = `${NV_API_BASE}?$limit=${PAGE_LIMIT}&$offset=${offset}&$q=${nvQ}`;
      await defaultRateLimiter.waitBeforeRequest(NV_DOMAIN);

      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        console.error(`[NevadaPhase2] API fetch failed: HTTP ${response.status} at offset ${offset}`);
        break;
      }

      const records: Record<string, string>[] = await response.json();

      if (!Array.isArray(records) || records.length === 0) {
        console.log(`[NevadaPhase2] No more records at offset ${offset}`);
        break;
      }

      totalFetched += records.length;
      console.log(`[NevadaPhase2] Page offset ${offset}: ${records.length} records`);

      for (const record of records) {
        try {
          // Status filter — active only
          const status = (
            record['status'] ||
            record['license_status'] ||
            ''
          ).trim().toUpperCase();
          if (status && status !== 'ACTIVE') continue;

          // Resolve license type from common field variants
          const licenseTypeRaw = (
            record['license_type'] ||
            record['license_description'] ||
            record['business_type'] ||
            ''
          ).trim();
          const licenseTypeUpper = licenseTypeRaw.toUpperCase();

          // Resolve business name
          const businessName = (
            record['business_name'] ||
            record['dba_name'] ||
            record['name'] ||
            ''
          ).trim();

          if (!businessName) continue;

          // Determine inclusion
          const alwaysInclude = ALWAYS_INCLUDE_TYPES.has(licenseTypeUpper);
          const broaderMatch =
            BROADER_TYPES.has(licenseTypeUpper) && nameMatchesKeyword(businessName);

          // If no explicit license type match, fall back to keyword-only match
          const keywordFallback = !licenseTypeRaw && nameMatchesKeyword(businessName);

          if (!alwaysInclude && !broaderMatch && !keywordFallback) continue;
          if (nameIsExcluded(businessName)) continue;

          totalMatched++;

          const licenseNumber = (
            record['business_license'] ||
            record['license_number'] ||
            record['license_no'] ||
            ''
          ).trim();

          const address = (
            record['address'] ||
            record['location_address'] ||
            record['street_address'] ||
            ''
          ).trim();

          const city = (record['city'] || 'Las Vegas').trim();
          const zip = (record['zip'] || record['zip_code'] || '').trim();

          const dedupeKey = `NV-SECONDARY-${licenseNumber || businessName.toLowerCase().replace(/\s+/g, '-')}`;
          const businessCategory = mapCategory(licenseTypeRaw);

          const orgId = await getOrCreateScrapedOrganizer(
            businessName,
            'NevadaPhase2',
            city || 'Las Vegas',
            'NV',
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
            'NV',
            licenseNumber || undefined
          );

          if (orgId) {
            totalUpserted++;
          }
        } catch (rowErr) {
          console.error('[NevadaPhase2] Error processing record:', rowErr);
        }
      }

      if (records.length < PAGE_LIMIT) break;
      offset += PAGE_LIMIT;
    }

    console.log(
      `[NevadaPhase2] Done — fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );
  } catch (error) {
    console.error('[NevadaPhase2] Scraper fatal error:', error);
    throw error;
  }
}
