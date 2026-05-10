/**
 * Florida DBPR Board 48 Auctioneer License — Secondary Sale Business Scraper (Phase 2)
 * Primary source: Florida DBPR Board 48 license extract CSV
 *   https://www2.myfloridalicense.com/sto/file_download/extracts/lic48auc.csv
 *
 * CSV format: NO HEADER ROW — purely positional (22 columns, 0-indexed):
 *   col 0  — board_id (always "48")
 *   col 1  — license_type_code: AB=Auction Business, AU=Individual Auctioneer,
 *                               AE=Apprentice Auctioneer, OR=Out-of-state Registrant
 *   col 2  — licensee_name (business name for AB; "LAST, FIRST" for individuals)
 *   col 3  — (blank)
 *   col 4  — (blank)
 *   col 5  — address line 1
 *   col 6  — address line 2
 *   col 7  — (blank)
 *   col 8  — city
 *   col 9  — state (FL or out-of-state for OR)
 *   col 10 — zip
 *   col 11 — county_code
 *   col 12 — license_seq_number
 *   col 13 — status_code: C=Current/Active, S=Suspended
 *   col 14 — sub_status: A=Active, I=Inactive, blank for OR
 *   col 15 — original_issue_date
 *   col 16 — status_date
 *   col 17 — expiration_date
 *   col 18 — (blank)
 *   col 19 — (blank)
 *   col 20 — formatted license number (e.g. AB1389, AU920)
 *   col 21 — (blank)
 *
 * License types included:
 *   AB — Auction Business (firm — always included when active, non-excluded)
 *   AU — Individual Auctioneer (keyword filter applied)
 *   AE — Apprentice Auctioneer (keyword filter applied)
 *   OR — Out-of-state registrants (skipped — non-FL businesses)
 *
 * Active status: col 13 = "C" (Current) AND col 14 = "A"
 *
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

const CSV_URL = 'https://www2.myfloridalicense.com/sto/file_download/extracts/lic48auc.csv';
const CSV_DOMAIN = 'www2.myfloridalicense.com';

// Positional column indices (CSV has no header row)
const COL = {
  LICENSE_TYPE: 1,
  LICENSEE_NAME: 2,
  CITY: 8,
  STATE: 9,
  STATUS_CODE: 13,   // "C" = Current/Active
  SUB_STATUS: 14,    // "A" = Active
  LICENSE_NUMBER: 20,
} as const;

// Keywords that indicate a secondary-sale business
const SALE_TYPE_KEYWORDS = [
  'auction',
  'estate sale',
  'estate auction',
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
  'secondhand',
  'second hand',
  'pre-owned',
  'preowned',
  'surplus',
  'rummage',
  'pawn',
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

/**
 * Return true if the business name contains a false-positive fragment.
 */
function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Return true if the business name matches at least one sale-type keyword.
 */
function nameMatchesKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return SALE_TYPE_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Map a business name to a valid scraper category.
 */
function mapCategory(businessName: string): string {
  const lower = businessName.toLowerCase();
  if (lower.includes('auction')) return 'AUCTION_HOUSE';
  return 'RESALE_SHOP';
}

// ---------------------------------------------------------------------------
// CSV parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse a single CSV line, handling quoted fields with embedded commas.
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

// ---------------------------------------------------------------------------
// CSV download
// ---------------------------------------------------------------------------

async function fetchCsv(): Promise<string | null> {
  try {
    await defaultRateLimiter.waitBeforeRequest(CSV_DOMAIN);
    const response = await fetch(CSV_URL, {
      method: 'GET',
      headers: { Accept: 'text/csv,text/plain,*/*' },
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      console.warn(`[Florida Phase2] CSV HTTP ${response.status}`);
      return null;
    }

    return await response.text();
  } catch (err) {
    console.warn('[Florida Phase2] CSV fetch failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Florida DBPR Board 48 Auctioneer license secondary sale scraper.
 * Downloads the state CSV extract (no header row — positional columns),
 * filters to active licenses (status_code="C", sub_status="A"),
 * and upserts matching organizers into the FindA.Sale directory.
 *
 * AB (Auction Business / firm) records are always included when active and
 * not excluded by false-positive fragments.
 * AU/AE (individual licensees) require a keyword match in the name.
 * OR (out-of-state registrants) are skipped.
 */
export async function runFloridaPhase2Scraper(): Promise<void> {
  console.log('[Florida Phase2] Starting secondary sale scraper — Florida DBPR Board 48');
  console.log(`[Florida Phase2] Source: ${CSV_URL}`);

  const csvText = await fetchCsv();
  if (!csvText) {
    console.error('[Florida Phase2] Failed to download CSV — aborting');
    return;
  }

  // CSV has NO header row — every line is a data record
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    console.error('[Florida Phase2] CSV is empty — aborting');
    return;
  }

  console.log(`[Florida Phase2] Total rows: ${lines.length}`);

  let totalProcessed = 0;
  let totalActive = 0;
  let totalMatched = 0;
  let totalUpserted = 0;

  for (let i = 0; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 15) continue;

    totalProcessed++;

    const licenseType  = (fields[COL.LICENSE_TYPE]   ?? '').trim().toUpperCase();
    const statusCode   = (fields[COL.STATUS_CODE]     ?? '').trim().toUpperCase();
    const subStatus    = (fields[COL.SUB_STATUS]      ?? '').trim().toUpperCase();
    const name         = (fields[COL.LICENSEE_NAME]   ?? '').trim();
    const city         = (fields[COL.CITY]            ?? '').trim() || 'Florida';
    const licenseNumber = (fields[COL.LICENSE_NUMBER] ?? '').trim();

    // Skip out-of-state registrants
    if (licenseType === 'OR') continue;

    // Active = status_code "C" (Current) AND sub_status "A" (Active)
    // Note: some OR records have blank sub_status — already excluded above
    if (statusCode !== 'C' || subStatus !== 'A') continue;
    totalActive++;

    if (!name) continue;

    // AB (Auction Business / firm) — always include if active and not excluded
    // AU/AE (individual licensees) — require keyword match in name
    if (licenseType === 'AB') {
      if (nameIsExcluded(name)) continue;
    } else if (licenseType === 'AU' || licenseType === 'AE') {
      if (!nameMatchesKeyword(name) || nameIsExcluded(name)) continue;
    } else {
      // Unknown license type — apply keyword filter
      if (!nameMatchesKeyword(name) || nameIsExcluded(name)) continue;
    }

    totalMatched++;

    const slugifiedName = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 40);
    const dedupeKey = `FL-SECONDARY-${licenseNumber || slugifiedName}`;
    const category = mapCategory(name);

    console.log(`[Florida Phase2] Matched: ${dedupeKey} — ${name} (${licenseType})`);

    try {
      const orgId = await getOrCreateScrapedOrganizer(
        name,                       // businessName
        'FloridaPhase2',            // sourceName
        city,                       // city
        'FL',                       // state
        undefined,                  // esnOrgId
        undefined,                  // googlePlaceId
        undefined,                  // foursquareVenueId
        undefined,                  // hereBusinessId
        category,                   // businessCategory
        undefined,                  // contactEmail
        undefined,                  // phone
        undefined,                  // website
        undefined,                  // lat
        undefined,                  // lng
        true,                       // isStateLicensed
        'FL',                       // licenseState
        licenseNumber || undefined, // licenseNumber
        undefined                   // sourceLabel
      );
      if (orgId) totalUpserted++;
    } catch (upsertErr) {
      console.error(`[Florida Phase2] Upsert error for "${name}":`, upsertErr);
    }
  }

  console.log('[Florida Phase2] ─── Summary ───────────────────────────');
  console.log(`[Florida Phase2]  Rows processed : ${totalProcessed}`);
  console.log(`[Florida Phase2]  Active licenses: ${totalActive}`);
  console.log(`[Florida Phase2]  Keyword matched: ${totalMatched}`);
  console.log(`[Florida Phase2]  Upserted       : ${totalUpserted}`);
  console.log('[Florida Phase2] ────────────────────────────────────────');
}
