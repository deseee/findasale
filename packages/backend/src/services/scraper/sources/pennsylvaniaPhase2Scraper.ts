/**
 * Pennsylvania Business Registry Scraper (Phase 2)
 * Source: PA Open Data Portal Socrata JSON API (paginated) — dataset xvd7-5r2c
 *   https://data.pa.gov/resource/xvd7-5r2c.json
 * NOTE: Bulk CSV (rows.csv?accessType=DOWNLOAD) exceeds Node.js string limit
 *   (ERR_STRING_TOO_LONG). Socrata paginated JSON is memory-safe.
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 *
 * Matches all secondary sale business types:
 *   - Always-include activities: AUCTIONEER, PAWNBROKER, JUNK DEALER,
 *     SECONDHAND DEALER, CONSIGNMENT (substring match on activity field)
 *   - All other rows: keyword filter on business name
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

const PA_SOCRATA_URL = 'https://data.pa.gov/resource/xvd7-5r2c.json';
const PA_OPEN_DATA_DOMAIN = 'data.pa.gov';
const PAGE_SIZE = 5000;

// Activities that always indicate a secondhand-sale business — substring match
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
 * Uses Socrata paginated JSON API ($limit/$offset) — avoids OOM from bulk CSV.
 */
export async function runPennsylvaniaPhase2Scraper(): Promise<void> {
  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;
  let offset = 0;
  let hasMore = true;
  let columnsLogged = false;

  console.log('[PennsylvaniaPhase2] Starting secondary sale scraper via PA Socrata JSON API');
  console.log(`[PennsylvaniaPhase2] Source: ${PA_SOCRATA_URL}`);

  try {
    while (hasMore) {
      await defaultRateLimiter.waitBeforeRequest(PA_OPEN_DATA_DOMAIN);

      const params = new URLSearchParams({
        $limit: String(PAGE_SIZE),
        $offset: String(offset),
      });
      const url = `${PA_SOCRATA_URL}?${params.toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        console.error(`[PennsylvaniaPhase2] JSON fetch failed: HTTP ${response.status} at offset ${offset}`);
        break;
      }

      const rows = (await response.json()) as Record<string, string>[];

      if (!Array.isArray(rows) || rows.length === 0) {
        console.log(`[PennsylvaniaPhase2] No more records at offset ${offset}`);
        break;
      }

      if (!columnsLogged) {
        console.log('[PennsylvaniaPhase2] JSON columns found:', Object.keys(rows[0]).join(', '));
        columnsLogged = true;
      }

      totalFetched += rows.length;

      for (const row of rows) {
        try {
          // Column probe — PA Socrata JSON uses lowercase_underscore keys
          const businessNameRaw =
            row['name'] ?? row['business_name'] ??
            row['businessname'] ?? row['entity_name'] ?? '';

          const tradeNameRaw =
            row['trade_name'] ?? row['tradename'] ?? row['dba'] ?? '';

          const displayName = (tradeNameRaw || businessNameRaw).trim();
          if (!displayName) continue;

          const activityRaw =
            row['business_activity'] ?? row['businessactivity'] ??
            row['activity'] ?? row['license_type'] ??
            row['type'] ?? '';
          const activity = activityRaw.trim().toUpperCase();

          // Substring match on activity field (PA compound codes like "AUCTIONEER LICENSE")
          const alwaysInclude = [...ALWAYS_INCLUDE_ACTIVITIES].some((t) => activity.includes(t));
          const keywordMatch  = !alwaysInclude && nameMatchesKeyword(displayName);

          if (!alwaysInclude && !keywordMatch) continue;
          if (nameIsExcluded(displayName)) continue;

          totalMatched++;

          const licenseNumber =
            (row['license_number'] ?? row['licensenumber'] ??
             row['registration_number'] ?? row['business_id'] ?? '').trim();
          const city = (row['city'] ?? row['principal_city'] ?? '').trim();

          const slugifiedName = displayName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .slice(0, 40);
          const dedupeKey      = `PA-SECONDARY-${licenseNumber || slugifiedName}`;
          const businessCategory = mapCategory(activity);

          console.log(`[PennsylvaniaPhase2] Matched: ${dedupeKey} — ${displayName} (${activity || 'keyword'})`);

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
            undefined,                // website
            undefined,                // lat
            undefined,                // lng
            true,                     // isStateLicensed
            'PA',                     // licenseState
            licenseNumber || undefined // licenseNumber
          );

          if (orgId) totalUpserted++;
        } catch (rowErr) {
          console.error('[PennsylvaniaPhase2] Row error:', rowErr);
        }
      }

      offset += rows.length;
      if (rows.length < PAGE_SIZE) hasMore = false;
    }

    console.log(
      `[PennsylvaniaPhase2] Done — fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );
  } catch (error) {
    console.error('[PennsylvaniaPhase2] Scraper fatal error:', error);
    throw error;
  }
}
