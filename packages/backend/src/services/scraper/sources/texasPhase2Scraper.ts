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
import { batchUpsertScrapedOrganizers, ScrapedOrganizerRow } from '../index';

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
  const batchRows: ScrapedOrganizerRow[] = [];
  let totalMatched = 0;
  let totalUpserted = 0;
  let offset = 0;
  let pageNum = 0;

  console.log('[Texas Phase2] Starting secondary sale scraper via TX TDLR Socrata API');
  console.log(`[Texas Phase2] Source: ${TX_SOCRATA_BASE_URL}`);

  try {
    while (true) {
      pageNum++;
      // ROOT-CAUSE FIX 2026-08-23 (roadmap #558 follow-up, tool-cited): the $where above used
      // an exact-match `IN (...)` list of uppercase abbreviation codes ('AUC', 'SHD', 'JDL',
      // 'PSH', 'AUCTIONEER', ...) that do not exist in the live TDLR data. Confirmed via curl
      // this session: data.texas.gov/resource/7358-krk7.json's real license_type values are
      // Title Case human-readable strings ("Auctioneer", "Associate Auctioneer", "Auctioneer
      // CE Provider") — the old IN-list matched zero of the 983,494 rows in the dataset every
      // single run (verified: the exact old $where returns []). There is also no PAWNSHOP/
      // SECONDHAND/JUNK/CONSIGNMENT/ESTATE SALE license_type in this dataset at all (OCCC
      // pawnshops are a separate source per the file header) — only Auctioneer variants exist.
      // This was the actual reason TexasPhase2 wrote 0 rows for 3+ months, not (only) the
      // timeout bug fixed here 2026-08-17 — that fix was correct but could never be exercised
      // because this $where already produced 0 records before any page could time out.
      // Replaced with a case-insensitive LIKE-OR clause matching the same target categories.
      // Live-verified count: 1,970 matching rows — matches the historical TexasPhase2 row
      // count (1,971) almost exactly, strong confirmation this is the right filter.
      const TX_WHERE = encodeURIComponent(
        "upper(license_type) like '%AUCTIONEER%' OR upper(license_type) like '%PAWN%' OR " +
        "upper(license_type) like '%SECONDHAND%' OR upper(license_type) like '%SECOND HAND%' OR " +
        "upper(license_type) like '%JUNK%' OR upper(license_type) like '%CONSIGNMENT%' OR " +
        "upper(license_type) like '%ESTATE SALE%' OR upper(license_type) like '%RETAIL%' OR " +
        "upper(license_type) like '%MERCHANT%' OR upper(license_type) like '%DEALER%' OR " +
        "upper(license_type) like '%GENERAL MERCHANDISE%'"
      );
      const url = `${TX_SOCRATA_BASE_URL}?$limit=${PAGE_LIMIT}&$offset=${offset}&$where=${TX_WHERE}`;

      console.log(`[Texas Phase2] Fetching page ${pageNum} (offset ${offset})...`);

      await defaultRateLimiter.waitBeforeRequest(TX_SOCRATA_DOMAIN);

      // ROOT-CAUSE FIX 2026-08-17 (roadmap #558 post-ship verification, tool-cited).
      // GitHub Actions run #9 (id 31998258067, 2026-08-17) annotated
      // "Phase2 scraper failed: Texas || TimeoutError: The operation was aborted due to
      // timeout" -- the ONLY hard failure in an otherwise-green 51-scraper batch. Two
      // separate defects combined here:
      //   1. 60s was too short for the TDLR Socrata endpoint. Illinois hit the identical
      //      TimeoutError and was raised 120s -> 240s on 2026-08-10; Texas was never given
      //      the same treatment. Matched to Illinois's value.
      //   2. Far worse: a page-level fetch rejection propagated straight to the function's
      //      outer catch, which RETHROWS -- so `batchRows` (every record already collected
      //      from every successful page) was discarded and
      //      batchUpsertScrapedOrganizers() below never ran at all. One slow page threw
      //      away the entire Texas scrape. That is consistent with the production data:
      //      TexasPhase2 has 1,971 organizer rows but max(directoryMostRecentAt) is
      //      2026-05-11 -- nothing written in 3+ months despite weekly runs.
      // Now a page-level fetch failure WARNS and breaks pagination, so whatever was already
      // fetched is still upserted. Same throw-to-warn discipline as the 2026-08-08
      // georgiaPhase2Scraper.ts fix. A genuinely broken source still surfaces: it produces
      // 0 records, which the batch runner reports and annotates.
      // Typed off `fetch` itself rather than the global `Response`: backend tsconfig sets
      // lib: ["ES2020"] with no DOM lib, so the bare `Response` type name is not
      // guaranteed to resolve here.
      let response: Awaited<ReturnType<typeof fetch>>;
      try {
        response = await fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(240000),
        });
      } catch (fetchErr) {
        console.warn(
          `[Texas Phase2] Page ${pageNum} fetch failed (${
            fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
          }) — stopping pagination and upserting the ${batchRows.length} rows collected so far`
        );
        break;
      }

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

          batchRows.push({
            businessName,
            sourceName: 'TexasPhase2',
            city: city || 'Texas',
            state: 'TX',
            businessCategory,
            isStateLicensed: true,
            licenseState: 'TX',
            licenseNumber: licenseNumber || undefined,
          });
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

    // Batch upsert (ADR-073 perf: replaces serial per-row upserts)
    const ids = await batchUpsertScrapedOrganizers(batchRows, 100);
    totalUpserted = ids.filter((id) => id !== null).length;

    console.log(
      `[Texas Phase2] Done — fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );
  } catch (error) {
    console.error('[Texas Phase2] Scraper fatal error:', error);
    throw error;
  }
}
