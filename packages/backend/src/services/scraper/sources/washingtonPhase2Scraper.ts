/**
 * Washington State Business Lookup — Secondary Sale Business Scraper (Phase 2)
 * Source: WA Business Lookup Socrata bulk CSV download (dataset 4wur-kfnr)
 *   https://data.wa.gov/api/views/4wur-kfnr/rows.csv?accessType=DOWNLOAD
 * NOTE: JSON API endpoint returns 403 without a Socrata app token; bulk CSV
 *   download does not require auth for public datasets.
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 *
 * Matches all secondary sale business types:
 *   - Always-include license types: AUCTIONEER, AUCTION COMPANY, PAWNBROKER,
 *     SECONDHAND DEALER, CONSIGNMENT, JUNK DEALER
 *   - Broader types (RETAIL TRADE, GENERAL MERCHANDISE, DEALER, MERCHANT)
 *     require a keyword match on business name
 */

import { defaultRateLimiter } from '../rateLimiter';
import { batchUpsertScrapedOrganizers, ScrapedOrganizerRow } from '../index';

const WA_SOCRATA_CSV_URL = 'https://data.wa.gov/api/views/4wur-kfnr/rows.csv?accessType=DOWNLOAD';
const WA_SOCRATA_DOMAIN = 'data.wa.gov';

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
 * Downloads the bulk CSV from the Socrata dataset (no API token required).
 * JSON API endpoint returns 403 without auth — CSV bulk download is public.
 */
export async function runWashingtonPhase2Scraper(): Promise<void> {
  let totalFetched = 0;
  const batchRows: ScrapedOrganizerRow[] = [];
  let totalMatched = 0;
  let totalUpserted = 0;

  console.log('[Washington Phase2] Starting secondary sale scraper via WA Business Lookup bulk CSV');
  console.log(`[Washington Phase2] Source: ${WA_SOCRATA_CSV_URL}`);

  try {
    await defaultRateLimiter.waitBeforeRequest(WA_SOCRATA_DOMAIN);

    const response = await fetch(WA_SOCRATA_CSV_URL, {
      method: 'GET',
      headers: { Accept: 'text/csv,*/*' },
      signal: AbortSignal.timeout(600000),
    });

    if (!response.ok) {
      console.error(
        `[Washington Phase2] CSV fetch failed: HTTP ${response.status} from ${WA_SOCRATA_CSV_URL}`
      );
      return;
    }

    const csvText = await response.text();
    const lines = csvText.split('\n');

    if (lines.length < 2) {
      console.warn('[Washington Phase2] CSV response appears empty or malformed');
      return;
    }

    // Parse header row
    const headers = parseCsvLine(lines[0]).map((h) =>
      h.toLowerCase().replace(/\s+/g, ' ').trim()
    );
    console.log('[Washington Phase2] CSV headers found:', headers.join(', '));

    const col = (name: string): number => headers.indexOf(name);

    // Column probe — WA Socrata CSV field names
    const iBusinessName =
      col('business name') !== -1 ? col('business name') :
      col('business_name') !== -1 ? col('business_name') :
      col('legal name') !== -1 ? col('legal name') :
      col('name') !== -1 ? col('name') : -1;

    const iLicenseType =
      col('ownership type') !== -1 ? col('ownership type') :
      col('business type') !== -1 ? col('business type') :
      col('license type') !== -1 ? col('license type') :
      col('type') !== -1 ? col('type') : -1;

    const iStatus =
      col('status') !== -1 ? col('status') :
      col('license status') !== -1 ? col('license status') : -1;

    const iCity =
      col('city') !== -1 ? col('city') :
      col('business city') !== -1 ? col('business city') :
      col('city name') !== -1 ? col('city name') : -1;

    const iLicenseNumber =
      col('ubi') !== -1 ? col('ubi') :
      col('license number') !== -1 ? col('license number') :
      col('id') !== -1 ? col('id') : -1;

    if (iBusinessName === -1) {
      console.error(
        '[Washington Phase2] Could not find business name column. Headers:', headers.join(', ')
      );
      return;
    }

    totalFetched = lines.length - 1;
    console.log(`[Washington Phase2] CSV fetched — ${totalFetched} data rows`);

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const fields = parseCsvLine(line);

        const businessName = (fields[iBusinessName] || '').trim();
        if (!businessName) continue;

        const licenseTypeRaw = (iLicenseType >= 0 ? fields[iLicenseType] || '' : '').trim().toUpperCase();
        const statusRaw = (iStatus >= 0 ? fields[iStatus] || '' : '').trim().toUpperCase();

        if (statusRaw && statusRaw !== 'ACTIVE' && statusRaw !== 'OPEN' && statusRaw !== 'CURRENT') {
          continue;
        }

        const alwaysInclude = licenseTypeRaw
          ? [...ALWAYS_INCLUDE_TYPES].some((t) => licenseTypeRaw.includes(t))
          : false;

        const broaderMatch = licenseTypeRaw
          ? [...BROADER_TYPES].some((t) => licenseTypeRaw.includes(t)) && nameMatchesKeyword(businessName)
          : nameMatchesKeyword(businessName);

        if (!alwaysInclude && !broaderMatch) continue;
        if (nameIsExcluded(businessName)) continue;

        totalMatched++;

        const city = (iCity >= 0 ? fields[iCity] || '' : '').trim();
        const licenseNumber = (iLicenseNumber >= 0 ? fields[iLicenseNumber] || '' : '').trim();
        const businessCategory = mapCategory(licenseTypeRaw);

        const slugifiedName = businessName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .slice(0, 40);
        const dedupeKey = `WA-SECONDARY-${licenseNumber || slugifiedName}`;
        console.log(`[Washington Phase2] Matched: ${dedupeKey} — ${businessName} (${licenseTypeRaw})`);

        batchRows.push({
          businessName,
          sourceName: 'WashingtonPhase2',
          city: city || 'Washington',
          state: 'WA',
          businessCategory,
          isStateLicensed: true,
          licenseState: 'WA',
          licenseNumber: licenseNumber || undefined,
        });
      } catch (rowErr) {
        console.error(`[Washington Phase2] Error on row ${i}:`, rowErr);
      }
    }

    // Batch upsert (ADR-073 perf: replaces serial per-row upserts)
    const ids = await batchUpsertScrapedOrganizers(batchRows, 100);
    totalUpserted = ids.filter((id) => id !== null).length;

    console.log(
      `[Washington Phase2] Done — fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );
  } catch (error) {
    console.error('[Washington Phase2] Scraper fatal error:', error);
    throw error;
  }
}
