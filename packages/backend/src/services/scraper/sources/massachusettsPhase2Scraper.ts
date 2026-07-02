/**
 * Massachusetts — Division of Professional Licensure Scraper (Phase 2)
 * Data source: MA Division of Professional Licensure REST API
 * Primary URL: https://licensing.api.secure.digital.mass.gov/v1/licenses
 * Fallback URL: https://elicensing.mass.gov
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 *
 * Covers auctioneers, pawnbrokers, and secondhand dealers licensed by the
 * Massachusetts Division of Professional Licensure.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { batchUpsertScrapedOrganizers, ScrapedOrganizerRow } from '../index';

const MA_API_BASE = 'https://licensing.api.secure.digital.mass.gov/v1/licenses';
const MA_LEGACY_BASE = 'https://elicensing.mass.gov';
const MA_API_DOMAIN = 'licensing.api.secure.digital.mass.gov';
const PAGE_SIZE = 100;

// Board/profession queries to run against the API
const LICENSE_QUERIES = [
  { board: 'Auctioneers', profession: 'Auctioneer', category: 'AUCTION_HOUSE' as const },
  { board: 'Pawnbrokers', profession: 'Pawnbroker', category: 'PAWN_SHOP' as const },
  { board: 'Secondhand Dealers', profession: 'Secondhand Dealer', category: 'RESALE_SHOP' as const },
];

// False-positive name fragments — exclude if business name contains any of these
const EXCLUDE_FRAGMENTS = [
  'real estate',
  'realty',
  'realtor',
  'restaurant',
  'dental',
  'medical',
  'pharmacy',
  'funeral',
  'insurance',
  'attorney',
  'law office',
  'construction',
  'plumbing',
  'electrical',
  'roofing',
  'automotive repair',
  'car wash',
  'dry clean',
  'hair salon',
  'nail salon',
  'tattoo',
  'massage',
  'daycare',
];

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Try the primary REST API endpoint. Returns records or null if the API
 * is unavailable / returns an unexpected format.
 */
async function fetchFromPrimaryApi(
  board: string,
  profession: string,
  page: number
): Promise<Record<string, unknown>[] | null> {
  const params = new URLSearchParams({
    board,
    profession,
    status: 'Active',
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });

  const url = `${MA_API_BASE}?${params.toString()}`;

  await defaultRateLimiter.waitBeforeRequest(MA_API_DOMAIN);

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    console.warn(
      `[MA Phase2] Primary API returned HTTP ${response.status} for board=${board}`
    );
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('json')) {
    console.warn(`[MA Phase2] Primary API returned non-JSON content-type: ${contentType}`);
    return null;
  }

  try {
    const body = await response.json();
    // API may wrap results in a data/results envelope or return a flat array
    if (Array.isArray(body)) return body as Record<string, unknown>[];
    if (body && typeof body === 'object') {
      const inner =
        (body as Record<string, unknown>).data ??
        (body as Record<string, unknown>).results ??
        (body as Record<string, unknown>).records ??
        (body as Record<string, unknown>).items ??
        (body as Record<string, unknown>).licenses;
      if (Array.isArray(inner)) return inner as Record<string, unknown>[];
    }
    console.warn('[MA Phase2] Primary API returned unexpected JSON shape:', JSON.stringify(body).slice(0, 500));
    return null;
  } catch {
    console.warn('[MA Phase2] Failed to parse primary API JSON');
    return null;
  }
}

/**
 * Fallback: try the legacy eLicensing endpoint. The legacy site may expose a
 * search API or a downloadable CSV. We attempt a JSON search first, then a
 * CSV download.
 */
async function fetchFromLegacyApi(
  profession: string
): Promise<Record<string, unknown>[]> {
  // Attempt 1: JSON search endpoint
  const searchUrls = [
    `${MA_LEGACY_BASE}/api/search?profession=${encodeURIComponent(profession)}&status=Active`,
    `${MA_LEGACY_BASE}/search?type=${encodeURIComponent(profession)}&format=json`,
    `${MA_LEGACY_BASE}/licenses?profession=${encodeURIComponent(profession)}&status=Active`,
  ];

  for (const url of searchUrls) {
    try {
      await defaultRateLimiter.waitBeforeRequest('elicensing.mass.gov');

      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('json')) continue;

      const body = await response.json();
      const records = Array.isArray(body)
        ? body
        : Array.isArray((body as Record<string, unknown>)?.data)
          ? (body as Record<string, unknown>).data
          : Array.isArray((body as Record<string, unknown>)?.results)
            ? (body as Record<string, unknown>).results
            : null;

      if (records && Array.isArray(records) && records.length > 0) {
        console.log(`[MA Phase2] Legacy API returned ${records.length} records from ${url}`);
        return records as Record<string, unknown>[];
      }
    } catch {
      // Try next URL
    }
  }

  console.log(`[MA Phase2] Legacy endpoint returned no usable data for ${profession}`);
  return [];
}

/**
 * Extract a string value from a record, trying multiple possible field names.
 */
function extractField(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = record[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return '';
}

/**
 * Massachusetts Division of Professional Licensure scraper.
 * Queries the REST API for auctioneers, pawnbrokers, and secondhand dealers.
 * Falls back to the legacy eLicensing endpoint if the primary API is unavailable.
 */
export async function runMassachusettsPhase2Scraper(): Promise<void> {
  // INTENTIONAL_BREAK: MA Division of Professional Licensure API
  // (licensing.api.secure.digital.mass.gov) DNS fails from cloud runners.
  // Parked 2026-06 until MA publishes a working public API endpoint.
  console.log('[MA Phase2] PARKED: MA licensing API unreachable from cloud IPs. Exiting cleanly.');
  return;

  // --- ORIGINAL CODE BELOW (unreachable, preserved for reference) ---
  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;
  let usedFallback = false;
  const batchRows: ScrapedOrganizerRow[] = [];

  console.log('[MA Phase2] Starting MA Division of Professional Licensure scraper');
  console.log(`[MA Phase2] Primary API: ${MA_API_BASE}`);

  try {
    for (const query of LICENSE_QUERIES) {
      console.log(`[MA Phase2] Querying board=${query.board}, profession=${query.profession}`);

      let allRecords: Record<string, unknown>[] = [];
      let primaryWorked = false;

      // Try primary API with pagination
      let page = 1;
      while (true) {
        const pageRecords = await fetchFromPrimaryApi(query.board, query.profession, page);

        if (!pageRecords) {
          // Primary API not available — break out and try fallback
          console.log(`[MA Phase2] Primary API unavailable for ${query.board}, trying legacy fallback`);
          break;
        }

        primaryWorked = true;

        if (pageRecords!.length === 0) {
          if (page === 1) {
            console.log(`[MA Phase2] Primary API returned 0 records for ${query.board}`);
          }
          break;
        }

        allRecords = allRecords.concat(pageRecords!);
        console.log(`[MA Phase2] Page ${page}: ${pageRecords!.length} records (running total: ${allRecords.length})`);

        if (pageRecords!.length < PAGE_SIZE) break;
        page++;
      }

      // If primary failed, try legacy
      if (!primaryWorked) {
        usedFallback = true;
        allRecords = await fetchFromLegacyApi(query.profession);
      }

      if (allRecords.length === 0) {
        console.log(`[MA Phase2] No records found for ${query.board} from any source`);
        continue;
      }

      totalFetched += allRecords.length;

      // Log sample record on first batch
      if (allRecords.length > 0 && totalMatched === 0) {
        console.log('[MA Phase2] Sample record fields:', Object.keys(allRecords[0]).join(', '));
        console.log('[MA Phase2] Sample record:', JSON.stringify(allRecords[0]).slice(0, 800));
      }

      for (const record of allRecords) {
        try {
          const businessName = extractField(
            record,
            'licensee_name',
            'business_name',
            'name',
            'dba_name',
            'fullName',
            'businessName',
            'licenseeName'
          );

          if (!businessName) continue;
          if (nameIsExcluded(businessName)) continue;

          // Status check — skip if explicitly inactive
          const status = extractField(
            record,
            'status',
            'license_status',
            'licenseStatus'
          ).toUpperCase();

          if (status && status !== 'ACTIVE' && status !== 'CURRENT' && status !== 'OPEN') {
            continue;
          }

          totalMatched++;

          const city = extractField(
            record,
            'city',
            'business_city',
            'cityName',
            'businessCity'
          );

          const licenseNumber = extractField(
            record,
            'license_number',
            'licenseNumber',
            'license_no',
            'licenseNo',
            'number'
          );

          const phone = extractField(
            record,
            'phone',
            'phone_number',
            'phoneNumber',
            'business_phone'
          );

          const email = extractField(
            record,
            'email',
            'contact_email',
            'contactEmail',
            'business_email'
          );

          const website = extractField(
            record,
            'website',
            'url',
            'business_website',
            'businessUrl'
          );

          batchRows.push({
            businessName,
            sourceName: 'MassachusettsPhase2',
            city: city || 'Massachusetts',
            state: 'MA',
            businessCategory: query.category,
            contactEmail: email || undefined,
            phone: phone || undefined,
            website: website || undefined,
            isStateLicensed: true,
            licenseState: 'Massachusetts',
            licenseNumber: licenseNumber || undefined,
          });
        } catch (rowErr) {
          console.error('[MA Phase2] Error processing record:', rowErr);
        }
      }
    }

    // Batch upsert (ADR-073 perf: replaces serial per-row upserts)
    const ids = await batchUpsertScrapedOrganizers(batchRows, 100);
    totalUpserted = ids.filter((id) => id !== null).length;

    if (totalFetched === 0) {
      const msg =
        '[MA Phase2] FATAL — zero records fetched from all sources (primary API + legacy fallback). ' +
        'The MA Division of Professional Licensure API may have changed or be temporarily unavailable.';
      console.error(msg);
      throw new Error(msg);
    }

    console.log(
      `[MA Phase2] Done — fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}` +
        (usedFallback ? ' (used legacy fallback)' : '')
    );
  } catch (error) {
    console.error('[MA Phase2] Scraper fatal error:', error);
    throw error;
  }
}
