/**
 * NYC Open Data — Secondary Sale Business Scraper (Phase 2)
 * ADR-073: Directory Scraper Phase 2 — City/state business licensing data
 *
 * Ingests TWO dedicated NYC Open Data datasets via Socrata JSON API:
 *
 *   Dataset 1 — NYC Secondhand Dealer General Licenses
 *     https://data.cityofnewyork.us/resource/9jmq-ziz9.json
 *     All records are secondhand dealers — ingest all active ones.
 *     mapCategory: AUCTION_HOUSE if license_type includes 'AUCTION', else RESALE_SHOP
 *
 *   Dataset 2 — NYC Active Pawnbroker Licenses
 *     https://data.cityofnewyork.us/resource/u7z4-p9uq.json
 *     All records are pawnbrokers — ingest all as RESALE_SHOP.
 *
 * Both APIs are paginated with $limit=2000&$offset until response.length < limit.
 * isStateLicensed = true for all records (official NYC license registries).
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

const NYC_DOMAIN = 'data.cityofnewyork.us';

const SECONDHAND_URL =
  'https://data.cityofnewyork.us/resource/9jmq-ziz9.json';

const PAWNBROKER_URL =
  'https://data.cityofnewyork.us/resource/u7z4-p9uq.json';

const PAGE_LIMIT = 2000;

/** Inactive license statuses to skip */
const INACTIVE_STATUSES = new Set(['EXPIRED', 'INACTIVE', 'REVOKED', 'CANCELLED', 'SUSPENDED']);

/**
 * Resolve a business name from a Socrata record — checks several common field variants.
 */
function resolveName(record: Record<string, string>): string {
  return (
    record['business_name'] ||
    record['licensee_name'] ||
    record['dba_name'] ||
    record['name'] ||
    ''
  ).trim();
}

/**
 * Resolve a license number from a Socrata record.
 */
function resolveLicenseNumber(record: Record<string, string>): string {
  return (
    record['license_nbr'] ||
    record['license_number'] ||
    record['license_no'] ||
    ''
  ).trim();
}

/**
 * Resolve the license status from a Socrata record.
 */
function resolveStatus(record: Record<string, string>): string {
  return (
    record['status'] ||
    record['license_status'] ||
    record['lic_status'] ||
    'ACTIVE'
  ).trim().toUpperCase();
}

/**
 * Slugify a business name for use in a dedupeKey fallback.
 */
function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}

/**
 * Map a secondhand dealer license type to a FindA.Sale business category.
 */
function mapSecondhandCategory(licenseType: string): string {
  const upper = (licenseType || '').toUpperCase();
  if (upper.includes('AUCTION')) return 'AUCTION_HOUSE';
  return 'RESALE_SHOP';
}

/**
 * Fetch one page from a Socrata JSON endpoint.
 */
async function fetchPage(
  baseUrl: string,
  offset: number
): Promise<Record<string, string>[]> {
  const url = `${baseUrl}?$limit=${PAGE_LIMIT}&$offset=${offset}`;
  await defaultRateLimiter.waitBeforeRequest(NYC_DOMAIN);

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }

  return (await response.json()) as Record<string, string>[];
}

/**
 * Ingest all records from a single NYC Open Data Socrata dataset.
 *
 * @param label           - Short label for log messages (e.g. 'secondhand', 'pawnbroker')
 * @param baseUrl         - Socrata resource URL without query params
 * @param defaultCategory - FindA.Sale category for all records in this dataset
 * @param dedupePrefix    - Prefix for dedupeKey (e.g. 'NY-SECONDARY', 'NY-SECONDARY-PAWN')
 * @param categoryFn      - Optional per-record category override (used for secondhand dealers)
 */
async function ingestNycDataset(
  label: string,
  baseUrl: string,
  defaultCategory: string,
  dedupePrefix: string,
  categoryFn?: (record: Record<string, string>) => string
): Promise<void> {
  let offset = 0;
  let totalFetched = 0;
  let totalSkipped = 0;
  let totalUpserted = 0;

  console.log(`[NewYork Phase2] Starting ${label} dataset ingestion`);
  console.log(`[NewYork Phase2] Source: ${baseUrl}`);

  while (true) {
    let page: Record<string, string>[];

    try {
      page = await fetchPage(baseUrl, offset);
    } catch (fetchErr) {
      console.error(
        `[NewYork Phase2] ${label}: fetch error at offset ${offset}:`,
        fetchErr
      );
      break;
    }

    if (!page || page.length === 0) break;

    totalFetched += page.length;

    for (const record of page) {
      try {
        const name = resolveName(record);
        if (!name) continue;

        // Filter inactive licenses
        const status = resolveStatus(record);
        if (INACTIVE_STATUSES.has(status)) {
          totalSkipped++;
          continue;
        }

        const licenseNumber = resolveLicenseNumber(record);
        const dedupeKey = `${dedupePrefix}-${licenseNumber || slugifyName(name)}`;
        const category = categoryFn ? categoryFn(record) : defaultCategory;
        const city = (record['city'] || 'New York').trim();

        const orgId = await getOrCreateScrapedOrganizer(
          name,              // businessName
          'NewYorkPhase2',   // sourceName
          city,              // city
          'NY',              // state
          undefined,         // esnOrgId
          undefined,         // googlePlaceId
          undefined,         // foursquareVenueId
          undefined,         // hereBusinessId
          category,          // businessCategory
          undefined,         // contactEmail
          undefined,         // phone
          undefined          // website
        );

        if (orgId) {
          totalUpserted++;
        }
      } catch (rowErr) {
        console.error(`[NewYork Phase2] ${label}: error on record:`, rowErr);
      }
    }

    console.log(
      `[NewYork Phase2] ${label}: processed offset ${offset}\u2013${offset + page.length - 1} (page size: ${page.length})`
    );

    if (page.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }

  console.log(
    `[NewYork Phase2] ${label} done — fetched: ${totalFetched}, skipped (inactive): ${totalSkipped}, upserted: ${totalUpserted}`
  );
}

/**
 * New York Phase 2 scraper — ingests both NYC Open Data license datasets.
 */
export async function runNewYorkPhase2Scraper(): Promise<void> {
  console.log('[NewYork Phase2] === Starting New York Phase 2 Scraper ===');

  // Dataset 1: NYC Secondhand Dealer General Licenses
  await ingestNycDataset(
    'secondhand',
    SECONDHAND_URL,
    'RESALE_SHOP',
    'NY-SECONDARY',
    (record) => mapSecondhandCategory(record['license_type'] || '')
  );

  // Dataset 2: NYC Active Pawnbroker Licenses
  await ingestNycDataset(
    'pawnbroker',
    PAWNBROKER_URL,
    'RESALE_SHOP',
    'NY-SECONDARY-PAWN'
  );

  console.log('[NewYork Phase2] === New York Phase 2 Scraper Complete ===');
}
