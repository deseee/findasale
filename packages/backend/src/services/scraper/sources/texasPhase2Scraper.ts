/**
 * Texas TDLR All Licenses Scraper (Phase 2)
 * Data source: Texas.gov TDLR All Licenses Socrata API
 * URL: https://data.texas.gov/resource/7358-krk7.json
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 *
 * Covers auctioneers, secondhand dealers, and all 14 secondhand sale types.
 *
 * Note: OCCC pawnshops are separate (occc.texas.gov) — Phase 3 source
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

const TX_SOCRATA_BASE_URL = 'https://data.texas.gov/resource/7358-krk7.json';
const TX_SOCRATA_DOMAIN = 'data.texas.gov';
const PAGE_LIMIT = 10000;

// License types that always indicate a secondhand-sale business — include regardless of name
const ALWAYS_INCLUDE_TYPES = new Set([
  'AUC',
  'AUCTIONEER',
  'AUCTION COMPANY',
  'AUCTION HOUSE',
  'SECONDHAND',
  'SECOND HAND',
  'SHD',
  'JUNK',
  'JDL',
  'JUNK DEALER',
  'CONSIGNMENT',
  'ESTATE SALE',
  'PAWNSHOP',
  'PSH',
  'PAWNBROKER',
]);

// Broader license types that require a keyword match on business name to include
const BROADER_TYPES = new Set([
  'RETAIL',
  'RTL',
  'MERCHANT',
  'MER',
  'DEALER',
  'GENERAL MERCHANDISE',
]);

// Case-insensitive keywords — any match includes the row (when paired with a broader type)
// Covers all 14 required sale-type categories
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
  'yard sale',
  'garage sale',
  'charity sale',
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
 * Return true if the license type matches any always-include type.
 */
function isAlwaysInclude(licenseType: string): boolean {
  const upper = licenseType.toUpperCase();
  return [...ALWAYS_INCLUDE_TYPES].some((t) => upper.includes(t));
}

/**
 * Return true if the license type matches any broader type.
 */
function isBroaderType(licenseType: string): boolean {
  const upper = licenseType.toUpperCase();
  return [...BROADER_TYPES].some((t) => upper.includes(t));
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
 * Map a TX license type to a valid getOrCreateScrapedOrganizer category.
 */
function mapCategory(licenseType: string): string {
  const upper = licenseType.toUpperCase();
  if (upper.includes('AUC')) return 'AUCTION_HOUSE';
  return 'RESALE_SHOP';
}

/**
 * Texas TDLR All Licenses secondary sale scraper.
 * Paginates through the Socrata JSON API and filters to secondhand-sale businesses.
 */
export async function runTexasPhase2Scraper(): Promise<void> {
  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;
  let offset = 0;
  let pageNum = 0;

  console.log('[Texas Phase2] Starting secondary sale scraper via TX TDLR Socrata API');
  console.log(`[Texas Phase2] Source: ${TX_SOCRATA_BASE_URL}`);

  try {
    while (true) {
      pageNum++;
      // Server-side license_type filter — only fetch TDLR records for auctioneers, secondhand
      // dealers, and pawnshops. Eliminates 99%+ of irrelevant TDLR license types.
      // Client-side ALWAYS_INCLUDE_TYPES / BROADER_TYPES checks remain as secondary filters.
      const TX_WHERE = encodeURIComponent(
        `license_type IN ('AUC','AUCTIONEER','AUCTION COMPANY','AUCTION HOUSE','SECONDHAND','SECOND HAND','SHD','JUNK','JDL','JUNK DEALER','CONSIGNMENT','ESTATE SALE','PAWNSHOP','PSH','PAWNBROKER','RETAIL','RTL','MERCHANT','MER','DEALER','GENERAL MERCHANDISE')`
      );
      const url = `${TX_SOCRATA_BASE_URL}?$limit=${PAGE_LIMIT}&$offset=${offset}&$where=${TX_WHERE}`;

      console.log(`[Texas Phase2] Fetching page ${pageNum} (offset ${offset})...`);

      await defaultRateLimiter.waitBeforeRequest(TX_SOCRATA_DOMAIN);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        console.error(
          `[Texas Phase2] API fetch failed: HTTP ${response.status} from ${url}`
        );
        break;
      }

      let records: Record<string, string>[];
      try {
        records = (await response.json()) as Record<string, string>[];
      } catch (parseErr) {
        console.error('[Texas Phase2] Failed to parse JSON response:', parseErr);
        break;
      }

      if (!Array.isArray(records) || records.length === 0) {
        console.log(`[Texas Phase2] No more records returned at offset ${offset} — pagination complete`);
        break;
      }

      totalFetched += records.length;
      console.log(`[Texas Phase2] Page ${pageNum}: ${records.length} records (total so far: ${totalFetched})`);

      // Log all field names and a sample record on first page for diagnostics
      if (pageNum === 1 && records.length > 0) {
        console.log('[Texas Phase2] Sample record fields:', Object.keys(records[0]).join(', '));
        console.log('[Texas Phase2] Sample record:', JSON.stringify(records[0]));
      }

      for (const record of records) {
        try {
          // Normalise field access — TDLR Socrata fields may vary; check common names
          const businessName = (
            record.licensee_name ||
            record.name ||
            record.business_name ||
            record.dba_name ||
            ''
          ).trim();

          if (!businessName) continue;

          // Determine license type — check multiple possible field names
          const licenseTypeRaw = (
            record.license_type ||
            record.license_type_name ||
            record.licensetype ||
            record.type ||
            ''
          ).trim();

          // Status filter — only process active licenses when a status field is present
          const statusRaw = (
            record.status ||
            record.license_status ||
            record.licensestatus ||
            ''
          ).trim().toUpperCase();

          if (statusRaw && statusRaw !== 'ACTIVE' && statusRaw !== 'OPEN' && statusRaw !== 'CURRENT') {
            continue;
          }

          // Determine whether this row qualifies
          const alwaysInclude = licenseTypeRaw ? isAlwaysInclude(licenseTypeRaw) : false;
          const broaderMatch = licenseTypeRaw
            ? isBroaderType(licenseTypeRaw) && nameMatchesKeyword(businessName)
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
            record.license_no ||
            record.id ||
            ''
          ).trim();

          const slugifiedName = businessName.slice(0, 40).replace(/\s+/g, '-');
          const dedupeKey = `TX-SECONDARY-${licenseNumber || slugifiedName}`;
          const businessCategory = mapCategory(licenseTypeRaw);

          const orgId = await getOrCreateScrapedOrganizer(
            businessName,            // businessName
            'TexasPhase2',           // sourceName
            city || 'Texas',         // city
            'TX',                    // state
            undefined,               // esnOrgId
            undefined,               // googlePlaceId
            undefined,               // foursquareVenueId
            undefined,               // hereBusinessId
            businessCategory,        // businessCategory
            undefined,               // contactEmail
            undefined,               // phone
            undefined,               // website
            undefined,               // lat
            undefined,               // lng
            true,                    // isStateLicensed
            'TX',                    // licenseState
            licenseNumber || undefined // licenseNumber
          );

          if (orgId) {
            totalUpserted++;
          }
        } catch (rowErr) {
          console.error('[Texas Phase2] Error processing record:', rowErr);
        }
      }

      // If we got fewer records than the page limit, we've reached the end
      if (records.length < PAGE_LIMIT) {
        console.log('[Texas Phase2] Last page reached — pagination complete');
        break;
      }

      offset += PAGE_LIMIT;
    }

    console.log(
      `[Texas Phase2] Done — fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );
  } catch (error) {
    console.error('[Texas Phase2] Scraper fatal error:', error);
    throw error;
  }
}
