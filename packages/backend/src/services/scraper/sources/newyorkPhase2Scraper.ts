/**
 * NYC Open Data — Secondary Sale Business Scraper (Phase 2)
 * ADR-073: Directory Scraper Phase 2 — City/state business licensing data
 *
 * Ingests TWO dedicated NYC Open Data datasets via Socrata JSON API:
 *
 *   Dataset 1 — Secondhand Dealer General (9jmq-ziz9)
 *     All records are secondhand dealers — category: secondary_sale
 *
 *   Dataset 2 — Active Pawnbroker Licenses (u7z4-p9uq)
 *     All records are pawnbrokers — category: pawnbroker
 *
 * Both APIs paginated with $limit=5000&$offset.
 * Deduplicates across both datasets by normalized name+address.
 * isStateLicensed = true for all records (official NYC license registries).
 * Throws if BOTH datasets return zero total results.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

const NYC_DOMAIN = 'data.cityofnewyork.us';

const SECONDHAND_URL =
  'https://data.cityofnewyork.us/resource/9jmq-ziz9.json';

const PAWNBROKER_URL =
  'https://data.cityofnewyork.us/resource/u7z4-p9uq.json';

const PAGE_LIMIT = 5000;

const EXCLUDE_FRAGMENTS = [
  'real estate', 'realty', 'realtor', 'mortgage',
  'bank', 'credit union', 'financial', 'insurance',
  'law office', 'attorney', 'lawyer',
  'dental', 'dentist', 'medical', 'clinic', 'pharmacy', 'hospital',
  'restaurant', 'hotel', 'motel',
];

/** Returns true if the business name matches a known non-sale fragment. */
function isExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some(fragment => lower.includes(fragment));
}

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
 * Build an address string from Socrata record fields.
 */
function resolveAddress(record: Record<string, string>): string {
  const building = (record['address_building'] || '').trim();
  const street = (record['address_street'] || record['street'] || '').trim();
  return [building, street].filter(Boolean).join(' ');
}

/**
 * Resolve the city from a Socrata record, defaulting to 'New York'.
 */
function resolveCity(record: Record<string, string>): string {
  const city = (
    record['address_city'] ||
    record['city'] ||
    ''
  ).trim();
  return city || 'New York';
}

/**
 * Resolve phone from a Socrata record.
 */
function resolvePhone(record: Record<string, string>): string | undefined {
  const phone = (
    record['phone'] ||
    record['contact_phone'] ||
    record['telephone'] ||
    ''
  ).trim();
  return phone || undefined;
}

/**
 * Resolve zip from a Socrata record.
 */
function resolveZip(record: Record<string, string>): string {
  return (record['address_zip'] || record['zip'] || '').trim();
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
 * Build a dedup key from normalized name + address for cross-dataset dedup.
 */
function buildDedupeKey(name: string, address: string, zip: string): string {
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  return `${normalize(name)}|${normalize(address)}|${zip}`;
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
 * Fetch all pages from a Socrata dataset.
 */
async function fetchAllPages(
  label: string,
  baseUrl: string
): Promise<Record<string, string>[]> {
  const allRecords: Record<string, string>[] = [];
  let offset = 0;

  console.log(`[NewYork Phase2] Fetching ${label} from ${baseUrl}`);

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

    allRecords.push(...page);
    console.log(
      `[NewYork Phase2] ${label}: fetched offset ${offset}–${offset + page.length - 1} (${page.length} records)`
    );

    if (page.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }

  console.log(`[NewYork Phase2] ${label}: total fetched ${allRecords.length}`);
  return allRecords;
}

interface NormalizedRecord {
  name: string;
  city: string;
  phone?: string;
  licenseNumber: string;
  category: string;
  dedupeKey: string;
}

/**
 * New York Phase 2 scraper — ingests both NYC Open Data license datasets.
 * Deduplicates across datasets by name+address, then upserts via getOrCreateScrapedOrganizer.
 * Throws if both datasets return zero total results.
 */
export async function runNewYorkPhase2Scraper(): Promise<void> {
  console.log('[NewYork Phase2] === Starting New York Phase 2 Scraper ===');

  // Fetch both datasets
  const secondhandRaw = await fetchAllPages('secondhand', SECONDHAND_URL);
  const pawnbrokerRaw = await fetchAllPages('pawnbroker', PAWNBROKER_URL);

  const totalFetched = secondhandRaw.length + pawnbrokerRaw.length;
  if (totalFetched === 0) {
    throw new Error(
      '[NewYork Phase2] FATAL: Both datasets returned zero results. ' +
      'API may be down or endpoints changed.'
    );
  }

  // Normalize and deduplicate across both datasets
  const seen = new Set<string>();
  const records: NormalizedRecord[] = [];

  function processRecords(
    raw: Record<string, string>[],
    category: string,
    label: string
  ): void {
    let skippedExclude = 0;
    let skippedNoName = 0;
    let skippedDupe = 0;

    for (const record of raw) {
      const name = resolveName(record);
      if (!name) {
        skippedNoName++;
        continue;
      }

      if (isExcluded(name)) {
        skippedExclude++;
        continue;
      }

      const address = resolveAddress(record);
      const zip = resolveZip(record);
      const key = buildDedupeKey(name, address, zip);

      if (seen.has(key)) {
        skippedDupe++;
        continue;
      }
      seen.add(key);

      records.push({
        name,
        city: resolveCity(record),
        phone: resolvePhone(record),
        licenseNumber: resolveLicenseNumber(record),
        category,
        dedupeKey: key,
      });
    }

    console.log(
      `[NewYork Phase2] ${label}: ${raw.length} raw → ${raw.length - skippedNoName - skippedExclude - skippedDupe} kept ` +
      `(${skippedNoName} no-name, ${skippedExclude} excluded, ${skippedDupe} dupes)`
    );
  }

  processRecords(secondhandRaw, 'secondary_sale', 'secondhand');
  processRecords(pawnbrokerRaw, 'pawnbroker', 'pawnbroker');

  console.log(`[NewYork Phase2] ${records.length} unique records to upsert`);

  // Upsert all records
  let upserted = 0;
  let errors = 0;

  for (const rec of records) {
    try {
      const orgId = await getOrCreateScrapedOrganizer(
        rec.name,                    // businessName
        'NewYorkPhase2',             // sourceName
        rec.city,                    // city
        'New York',                  // state
        undefined,                   // esnOrgId
        undefined,                   // googlePlaceId
        undefined,                   // foursquareVenueId
        undefined,                   // hereBusinessId
        rec.category,                // businessCategory
        undefined,                   // contactEmail
        rec.phone,                   // phone
        undefined,                   // website
        undefined,                   // lat
        undefined,                   // lng
        true,                        // isStateLicensed
        'NY',                        // licenseState
        rec.licenseNumber || undefined, // licenseNumber
        'NYC Open Data'              // sourceLabel
      );

      if (orgId) upserted++;
    } catch (rowErr) {
      errors++;
      console.error(`[NewYork Phase2] Error upserting "${rec.name}":`, rowErr);
    }
  }

  console.log(
    `[NewYork Phase2] === Complete — upserted: ${upserted}, errors: ${errors}, total unique: ${records.length} ===`
  );
}
