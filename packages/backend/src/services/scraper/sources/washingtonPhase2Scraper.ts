/**
 * Washington State Business Lookup — Secondary Sale Business Scraper (Phase 2)
 * Source: WA Business Lookup Socrata API (all active WA business licenses + endorsements)
 * API: https://data.wa.gov/resource/4wur-kfnr.json
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 *
 * Matches all secondary sale business types:
 *   - Always-include license types: AUCTIONEER, AUCTION COMPANY, PAWNBROKER,
 *     SECONDHAND DEALER, CONSIGNMENT, JUNK DEALER
 *   - Broader types (RETAIL TRADE, GENERAL MERCHANDISE, DEALER, MERCHANT)
 *     require a keyword match on business name
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

const WA_SOCRATA_BASE_URL = 'https://data.wa.gov/resource/4wur-kfnr.json';
const WA_SOCRATA_DOMAIN = 'data.wa.gov';
const PAGE_LIMIT = 10000;

// License/business types that always indicate a secondhand-sale business
const ALWAYS_INCLUDE_TYPES = new Set([
  'AUCTIONEER',
  'AUCTION COMPANY',
  'PAWNBROKER',
  'SECONDHAND DEALER',
  'SECOND HAND DEALER',
  'CONSIGNMENT',
  'JUNK DEALER',
]);

// Broader types that require a keyword match on business name
const BROADER_TYPES = new Set([
  'RETAIL TRADE',
  'GENERAL MERCHANDISE',
  'DEALER',
  'MERCHANT',
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
  'used furniture',
  'used appliance',
  'secondhand',
  'second hand',
  'pre-owned',
  'preowned',
  'surplus',
  'treasure',
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
  'heating',
  'air condition',
  'roofing',
  'automotive repair',
  'body shop',
  'car wash',
  'dry clean',
  'laundry',
  'hair salon',
  'nail salon',
  'barbershop',
  'tattoo',
  'massage',
  'yoga',
  'daycare',
  'preschool',
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
 * Map a WA business/license type to a valid getOrCreateScrapedOrganizer category.
 */
function mapCategory(licenseType: string): string {
  const upper = licenseType.toUpperCase();
  if (upper.includes('AUCTION')) return 'AUCTION_HOUSE';
  return 'RESALE_SHOP';
}

/**
 * Washington State Business Lookup secondary sale scraper.
 * Paginates through the Socrata JSON API and filters to secondhand-sale businesses.
 */
export async function runWashingtonPhase2Scraper(): Promise<void> {
  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;
  let offset = 0;
  let pageNum = 0;

  console.log('[Washington Phase2] Starting secondary sale scraper via WA Business Lookup Socrata API');
  console.log(`[Washington Phase2] Source: ${WA_SOCRATA_BASE_URL}`);

  try {
    while (true) {
      pageNum++;
      const url = `${WA_SOCRATA_BASE_URL}?$limit=${PAGE_LIMIT}&$offset=${offset}`;

      console.log(`[Washington Phase2] Fetching page ${pageNum} (offset ${offset})...`);

      await defaultRateLimiter.waitBeforeRequest(WA_SOCRATA_DOMAIN);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        console.error(
          `[Washington Phase2] API fetch failed: HTTP ${response.status} from ${url}`
        );
        break;
      }

      let records: Record<string, string>[];
      try {
        records = await response.json() as Record<string, string>[];
      } catch (parseErr) {
        console.error('[Washington Phase2] Failed to parse JSON response:', parseErr);
        break;
      }

      if (!Array.isArray(records) || records.length === 0) {
        console.log(`[Washington Phase2] No more records returned at offset ${offset} — pagination complete`);
        break;
      }

      totalFetched += records.length;
      console.log(`[Washington Phase2] Page ${pageNum}: ${records.length} records (total so far: ${totalFetched})`);

      // Log field names from first record on first page for diagnostics
      if (pageNum === 1 && records.length > 0) {
        console.log('[Washington Phase2] Sample record fields:', Object.keys(records[0]).join(', '));
      }

      for (const record of records) {
        try {
          // Normalise field access — WA Socrata fields may vary; check common names
          const businessName = (
            record.business_name ||
            record.businessname ||
            record.legal_name ||
            record.name ||
            ''
          ).trim();

          if (!businessName) continue;

          // Determine license/business type — check multiple possible field names
          const licenseTypeRaw = (
            record.business_type ||
            record.license_type ||
            record.businesstype ||
            record.type ||
            record.ownership_type ||
            ''
          ).trim().toUpperCase();

          // Status filter — only process active licenses when a status field is present
          const statusRaw = (
            record.status ||
            record.license_status ||
            record.businessstatus ||
            ''
          ).trim().toUpperCase();

          if (statusRaw && statusRaw !== 'ACTIVE' && statusRaw !== 'OPEN' && statusRaw !== 'CURRENT') {
            continue;
          }

          // Determine whether this row qualifies
          const alwaysInclude = licenseTypeRaw
            ? [...ALWAYS_INCLUDE_TYPES].some((t) => licenseTypeRaw.includes(t))
            : false;

          const broaderMatch = licenseTypeRaw
            ? [...BROADER_TYPES].some((t) => licenseTypeRaw.includes(t)) && nameMatchesKeyword(businessName)
            : nameMatchesKeyword(businessName);

          if (!alwaysInclude && !broaderMatch) continue;

          // Filter out false positives by name
          if (nameIsExcluded(businessName)) continue;

          totalMatched++;

          // Extract location fields
          const city = (
            record.city ||
            record.business_city ||
            record.city_name ||
            ''
          ).trim();

          const licenseNumber = (
            record.license_number ||
            record.licensenumber ||
            record.ubi ||
            record.id ||
            ''
          ).trim();

          const businessCategory = mapCategory(licenseTypeRaw);

          const orgId = await getOrCreateScrapedOrganizer(
            businessName,               // businessName
            'WashingtonPhase2',         // sourceName
            city || 'Washington',       // city
            'WA',                       // state
            undefined,                  // esnOrgId
            undefined,                  // googlePlaceId
            undefined,                  // foursquareVenueId
            undefined,                  // hereBusinessId
            businessCategory,           // businessCategory
            undefined,                  // contactEmail
            undefined,                  // phone
            undefined                   // website
          );

          if (orgId) {
            totalUpserted++;
          }
        } catch (rowErr) {
          console.error('[Washington Phase2] Error processing record:', rowErr);
        }
      }

      // If we got fewer records than the page limit, we've reached the end
      if (records.length < PAGE_LIMIT) {
        console.log('[Washington Phase2] Last page reached — pagination complete');
        break;
      }

      offset += PAGE_LIMIT;
    }

    console.log(
      `[Washington Phase2] Done — fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );
  } catch (error) {
    console.error('[Washington Phase2] Scraper fatal error:', error);
    throw error;
  }
}
