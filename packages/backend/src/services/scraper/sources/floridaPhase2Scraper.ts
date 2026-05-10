/**
 * Florida DBPR Board 48 Auctioneer License — Secondary Sale Business Scraper (Phase 2)
 * Primary source: Florida DBPR Board 48 license extract CSV
 *   https://www2.myfloridalicense.com/sto/file_download/extracts/lic48auc.csv
 * Fields: LicenseType, LicenseNumber, Rank, LicenseeDetails, MainAddress,
 *         CityStateZip, CountyCode, LicenseExpDate, LicenseStatusDate,
 *         LicenseInd, PrimaryStatusType, SecondaryStatusType
 *
 * License types included:
 *   AB — Auction Business (always included)
 *   AU — Individual Auctioneer (keyword filter applied)
 *   AE — Apprentice Auctioneer (keyword filter applied)
 *
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

const CSV_URL = 'https://www2.myfloridalicense.com/sto/file_download/extracts/lic48auc.csv';
const CSV_DOMAIN = 'www2.myfloridalicense.com';

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

interface FlRecord {
  licenseType: string;
  licenseNumber: string;
  rank: string;
  licenseeName: string;
  mainAddress: string;
  cityStateZip: string;
  countyCode: string;
  licenseExpDate: string;
  licenseStatusDate: string;
  licenseInd: string;
  primaryStatusType: string;
  secondaryStatusType: string;
}

/**
 * Map CSV header names to field indices.
 */
function buildHeaderMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    map[h.trim().toLowerCase()] = i;
  });
  return map;
}

function extractRecord(fields: string[], idx: Record<string, number>): FlRecord {
  const get = (key: string) => (fields[idx[key]] ?? '').trim();
  return {
    licenseType: get('licensetype'),
    licenseNumber: get('licensenumber'),
    rank: get('rank'),
    licenseeName: get('licenseedetails'),
    mainAddress: get('mainaddress'),
    cityStateZip: get('citystatezid') !== undefined ? get('citystatezid') : get('citystatezidp') !== undefined ? get('citystatezidp') : (fields[idx['citystatezid'] ?? idx['citystatezidp'] ?? 5] ?? '').trim(),
    countyCode: get('countycode'),
    licenseExpDate: get('licenseexpdate'),
    licenseStatusDate: get('licensestatusdate'),
    licenseInd: get('licenseind'),
    primaryStatusType: get('primarystatustype'),
    secondaryStatusType: get('secondarystatustype'),
  };
}

/**
 * Parse city from "City, ST  ZIP" format.
 */
function parseCity(cityStateZip: string): string {
  const match = cityStateZip.match(/^([^,]+)/);
  return match ? match[1].trim() : '';
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
 * Downloads the state CSV extract, filters to active licenses, and upserts
 * matching organizers into the FindA.Sale directory.
 */
export async function runFloridaPhase2Scraper(): Promise<void> {
  console.log('[Florida Phase2] Starting secondary sale scraper — Florida DBPR Board 48');
  console.log(`[Florida Phase2] Source: ${CSV_URL}`);

  const csvText = await fetchCsv();
  if (!csvText) {
    console.error('[Florida Phase2] Failed to download CSV — aborting');
    return;
  }

  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    console.error('[Florida Phase2] CSV has no data rows — aborting');
    return;
  }

  const headers = parseCsvLine(lines[0]);
  const idx = buildHeaderMap(headers);

  console.log(`[Florida Phase2] CSV headers: ${headers.join(', ')}`);
  console.log(`[Florida Phase2] Total rows: ${lines.length - 1}`);

  let totalProcessed = 0;
  let totalActive = 0;
  let totalMatched = 0;
  let totalUpserted = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 6) continue;

    totalProcessed++;

    const rec = extractRecord(fields, idx);

    // Filter: active licenses only
    const status = rec.primaryStatusType.toLowerCase();
    if (!status.includes('active')) continue;
    totalActive++;

    const licenseType = rec.licenseType.toUpperCase();
    const name = rec.licenseeName;

    if (!name) continue;

    // AB (Auction Business) — always include if active and not excluded
    // AU/AE — require keyword match
    if (licenseType === 'AB') {
      if (nameIsExcluded(name)) continue;
    } else if (licenseType === 'AU' || licenseType === 'AE') {
      if (!nameMatchesKeyword(name) || nameIsExcluded(name)) continue;
    } else {
      // Unknown license type — apply keyword filter
      if (!nameMatchesKeyword(name) || nameIsExcluded(name)) continue;
    }

    totalMatched++;

    // Determine city from CityStateZip field
    // Try both possible header spellings
    let cityStateZip = '';
    const cszKey = Object.keys(idx).find((k) => k.startsWith('citystatez'));
    if (cszKey !== undefined) {
      cityStateZip = (fields[idx[cszKey]] ?? '').trim();
    }
    const city = parseCity(cityStateZip) || 'Florida';

    const licenseNumber = rec.licenseNumber;
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
