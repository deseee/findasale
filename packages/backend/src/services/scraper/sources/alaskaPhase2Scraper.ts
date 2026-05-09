/**
 * Alaska DCCED Active Business License — Secondary Sale Business Scraper (Phase 2)
 * Primary source: ArcGIS Feature Service (NAICS-based filtering)
 *   https://services1.arcgis.com/WzFsmainVTuD5KML/arcgis/rest/services/Alaska_DCCED_CBPL_Active_Business_License/FeatureServer/0/query
 * Fallback: ArcGIS Hub CSV download page (parse HTML for direct CSV link)
 *
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 *
 * Uses NAICS codes for high-accuracy filtering across all secondhand sale types.
 * Falls back to business name keyword matching when NAICS data is unavailable.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

const ARCGIS_SERVICE_BASE =
  'https://services1.arcgis.com/WzFsmainVTuD5KML/arcgis/rest/services/Alaska_DCCED_CBPL_Active_Business_License/FeatureServer/0/query';
const ARCGIS_HUB_PAGE =
  'https://gis.data.alaska.gov/datasets/DCCED::alaska-dcced-cbpl-active-business-license-csv-file-download';
const ARCGIS_DOMAIN = 'services1.arcgis.com';
const AK_HUB_DOMAIN = 'gis.data.alaska.gov';

const PAGE_SIZE = 1000;

// NAICS codes that always indicate a secondhand-sale business — include regardless of name
const ALWAYS_INCLUDE_NAICS = new Set([
  '453310', // Used merchandise stores
  '459510', // Used merchandise stores (updated code)
  '522298', // All other nondepository credit intermediation (pawnbrokers)
  '453920', // Art dealers (antique dealers)
  '453998', // All other miscellaneous store retailers
  '561990', // All other support services (auction services)
  '812990', // All other personal services (estate sale organizers)
]);

// Case-insensitive keywords — any match includes the row when NAICS is absent
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
        // Escaped quote inside a quoted field
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
 * Map an AK NAICS code / license type to a valid scraper category.
 */
function mapCategory(naicsCode: string, licenseType: string): string {
  const naics = (naicsCode || '').trim();
  const lt = (licenseType || '').toUpperCase();
  if (naics === '561990' || lt.includes('AUCTION')) return 'AUCTION_HOUSE';
  return 'RESALE_SHOP';
}

// ---------------------------------------------------------------------------
// ArcGIS Feature Service approach
// ---------------------------------------------------------------------------

interface ArcGISFeature {
  attributes: Record<string, string | number | null>;
}

interface ArcGISResponse {
  features?: ArcGISFeature[];
  error?: { code: number; message: string };
  exceededTransferLimit?: boolean;
}

interface ProcessedRecord {
  name: string;
  naics: string;
  licenseType: string;
  city: string;
  zip: string;
  licenseNumber: string;
}

/**
 * Resolve the field name from a list of candidates (case-insensitive, first match wins).
 */
function resolveField(
  attributes: Record<string, string | number | null>,
  candidates: string[]
): string {
  const keys = Object.keys(attributes);
  for (const candidate of candidates) {
    const match = keys.find((k) => k.toLowerCase() === candidate.toLowerCase());
    if (match !== undefined) return match;
  }
  return '';
}

function getString(
  attributes: Record<string, string | number | null>,
  fieldName: string
): string {
  if (!fieldName) return '';
  const val = attributes[fieldName];
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

async function fetchArcGISPage(offset: number): Promise<ArcGISResponse | null> {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    resultRecordCount: String(PAGE_SIZE),
    resultOffset: String(offset),
    f: 'json',
  });

  const url = `${ARCGIS_SERVICE_BASE}?${params.toString()}`;

  try {
    await defaultRateLimiter.waitBeforeRequest(ARCGIS_DOMAIN);
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      console.warn(`[Alaska Phase2] ArcGIS API HTTP ${response.status} at offset ${offset}`);
      return null;
    }

    const json = (await response.json()) as ArcGISResponse;
    if (json.error) {
      console.warn(
        `[Alaska Phase2] ArcGIS API error at offset ${offset}: ${json.error.message}`
      );
      return null;
    }
    return json;
  } catch (err) {
    console.warn(`[Alaska Phase2] ArcGIS fetch failed at offset ${offset}:`, err);
    return null;
  }
}

async function runArcGISApproach(): Promise<
  { success: true; records: ProcessedRecord[] } | { success: false }
> {
  console.log('[Alaska Phase2] Attempting ArcGIS Feature Service approach...');

  const records: ProcessedRecord[] = [];
  let offset = 0;
  let hasMore = true;
  let firstPageFields: Record<string, string> | null = null;

  while (hasMore) {
    const page = await fetchArcGISPage(offset);

    if (!page || !page.features || page.features.length === 0) {
      if (offset === 0) {
        console.warn('[Alaska Phase2] ArcGIS API returned no features on first page — failing over');
        return { success: false };
      }
      break;
    }

    // Resolve field names from first page
    if (firstPageFields === null) {
      const attrs = page.features[0].attributes;
      firstPageFields = {
        businessName: resolveField(attrs, [
          'Business_Name',
          'LicenseeName',
          'BusinessName',
          'business_name',
          'licenseename',
        ]),
        city: resolveField(attrs, [
          'Mailing_City',
          'City',
          'city',
          'mailing_city',
          'MailingCity',
        ]),
        state: resolveField(attrs, ['State', 'state', 'Mailing_State', 'MailingState']),
        zip: resolveField(attrs, ['Zip', 'ZIP', 'zip', 'Mailing_Zip', 'ZipCode', 'PostalCode']),
        licenseNumber: resolveField(attrs, [
          'License_Number',
          'LicenseNumber',
          'license_number',
          'CBPL_Number',
          'CbplNumber',
        ]),
        naicsCode: resolveField(attrs, [
          'NAICS_Code',
          'NAICSCode',
          'naics_code',
          'NAICS',
          'naics',
        ]),
        licenseType: resolveField(attrs, [
          'License_Type',
          'LicenseType',
          'license_type',
          'PrimaryBusinessActivity',
          'BusinessType',
        ]),
      };
      console.log(
        `[Alaska Phase2] ArcGIS field mapping: businessName="${firstPageFields.businessName}", ` +
          `naicsCode="${firstPageFields.naicsCode}", licenseType="${firstPageFields.licenseType}"`
      );
    }

    for (const feature of page.features) {
      const attrs = feature.attributes;
      const name = getString(attrs, firstPageFields.businessName);
      if (!name) continue;

      const naics = getString(attrs, firstPageFields.naicsCode);
      const licenseType = getString(attrs, firstPageFields.licenseType);
      const city = getString(attrs, firstPageFields.city);
      const zip = getString(attrs, firstPageFields.zip);
      const licenseNumber = getString(attrs, firstPageFields.licenseNumber);

      const alwaysInclude = naics && ALWAYS_INCLUDE_NAICS.has(naics);
      const keywordMatch = !naics && nameMatchesKeyword(name);

      if (!alwaysInclude && !keywordMatch) continue;
      if (nameIsExcluded(name)) continue;

      records.push({ name, naics, licenseType, city, zip, licenseNumber });
    }

    hasMore = page.exceededTransferLimit === true;
    offset += page.features.length;

    if (page.features.length < PAGE_SIZE) hasMore = false;
  }

  if (records.length === 0 && offset === 0) {
    return { success: false };
  }

  console.log(
    `[Alaska Phase2] ArcGIS approach succeeded — fetched ${offset} total records, ${records.length} matched`
  );
  return { success: true, records };
}

// ---------------------------------------------------------------------------
// CSV fallback approach
// ---------------------------------------------------------------------------

async function findCsvDownloadUrl(): Promise<string | null> {
  console.log('[Alaska Phase2] Attempting to find CSV download URL from ArcGIS Hub page...');

  try {
    await defaultRateLimiter.waitBeforeRequest(AK_HUB_DOMAIN);
    const response = await fetch(ARCGIS_HUB_PAGE, {
      method: 'GET',
      headers: { Accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(30000),
      redirect: 'follow',
    });

    if (!response.ok) {
      console.warn(`[Alaska Phase2] Hub page fetch failed: HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Try to find a direct CSV download link in the page HTML
    const patterns = [
      /href="(https?:\/\/[^"]+\.csv[^"]*)"/gi,
      /href="(https?:\/\/opendata\.arcgis\.com[^"]*\.csv[^"]*)"/gi,
      /"downloadUrl"\s*:\s*"(https?:\/\/[^"]+\.csv[^"]*)"/gi,
      /data-url="(https?:\/\/[^"]+\.csv[^"]*)"/gi,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(html);
      if (match && match[1]) {
        const url = match[1].replace(/&amp;/g, '&');
        console.log(`[Alaska Phase2] Found CSV URL: ${url}`);
        return url;
      }
    }

    // Try opendata.arcgis.com pattern using dataset layerId from the page HTML
    const layerIdMatch = html.match(/"layerId"\s*:\s*"([a-f0-9]{32})"/i);
    if (layerIdMatch) {
      const layerId = layerIdMatch[1];
      const csvUrl = `https://opendata.arcgis.com/datasets/${layerId}_0.csv`;
      console.log(`[Alaska Phase2] Constructed CSV URL from layerId: ${csvUrl}`);
      return csvUrl;
    }

    console.warn('[Alaska Phase2] Could not extract CSV URL from Hub page');
    return null;
  } catch (err) {
    console.warn('[Alaska Phase2] Hub page fetch error:', err);
    return null;
  }
}

async function runCsvApproach(): Promise<
  { success: true; records: ProcessedRecord[] } | { success: false }
> {
  console.log('[Alaska Phase2] Attempting CSV download fallback...');

  const csvUrl = await findCsvDownloadUrl();
  if (!csvUrl) return { success: false };

  const csvDomain = new URL(csvUrl).hostname;

  try {
    await defaultRateLimiter.waitBeforeRequest(csvDomain);
    const response = await fetch(csvUrl, {
      method: 'GET',
      headers: { Accept: 'text/csv,*/*' },
      signal: AbortSignal.timeout(120000),
      redirect: 'follow',
    });

    if (!response.ok) {
      console.warn(`[Alaska Phase2] CSV download failed: HTTP ${response.status}`);
      return { success: false };
    }

    const csvText = await response.text();
    const lines = csvText.split('\n');

    if (lines.length < 2) {
      console.warn('[Alaska Phase2] CSV response appears empty or malformed');
      return { success: false };
    }

    const headers = parseCsvLine(lines[0]).map((h) =>
      h.toLowerCase().replace(/\s+/g, ' ').trim()
    );

    const col = (candidates: string[]): number => {
      for (const candidate of candidates) {
        const idx = headers.indexOf(candidate.toLowerCase());
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const iName = col(['business_name', 'licenseename', 'business name', 'name']);
    const iCity = col(['mailing_city', 'city', 'mailingcity']);
    const iZip = col(['zip', 'zipcode', 'mailing_zip', 'postalcode']);
    const iLicense = col(['license_number', 'licensenumber', 'cbpl_number']);
    const iNaics = col(['naics_code', 'naicscode', 'naics']);
    const iLicenseType = col(['license_type', 'licensetype', 'primarybusinessactivity']);

    if (iName === -1) {
      console.warn('[Alaska Phase2] CSV missing business name column. Headers:', headers.join(', '));
      return { success: false };
    }

    const records: ProcessedRecord[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const fields = parseCsvLine(line);
        const name = iName >= 0 ? (fields[iName] || '').trim() : '';
        if (!name) continue;

        const naics = iNaics >= 0 ? (fields[iNaics] || '').trim() : '';
        const licenseType = iLicenseType >= 0 ? (fields[iLicenseType] || '').trim() : '';
        const city = iCity >= 0 ? (fields[iCity] || '').trim() : '';
        const zip = iZip >= 0 ? (fields[iZip] || '').trim() : '';
        const licenseNumber = iLicense >= 0 ? (fields[iLicense] || '').trim() : '';

        const alwaysInclude = naics && ALWAYS_INCLUDE_NAICS.has(naics);
        const keywordMatch = !naics && nameMatchesKeyword(name);

        if (!alwaysInclude && !keywordMatch) continue;
        if (nameIsExcluded(name)) continue;

        records.push({ name, naics, licenseType, city, zip, licenseNumber });
      } catch (rowErr) {
        console.error(`[Alaska Phase2] CSV row ${i} parse error:`, rowErr);
      }
    }

    console.log(
      `[Alaska Phase2] CSV approach succeeded — ${lines.length - 1} rows parsed, ${records.length} matched`
    );
    return { success: true, records };
  } catch (err) {
    console.warn('[Alaska Phase2] CSV fetch error:', err);
    return { success: false };
  }
}

// ---------------------------------------------------------------------------
// Shared upsert loop
// ---------------------------------------------------------------------------

async function upsertRecords(records: ProcessedRecord[]): Promise<number> {
  let totalUpserted = 0;

  for (const record of records) {
    try {
      const dedupeKey = `AK-SECONDARY-${record.licenseNumber || record.name.replace(/\s+/g, '-').toUpperCase()}`;
      const category = mapCategory(record.naics, record.licenseType);

      const orgId = await getOrCreateScrapedOrganizer(
        record.name,              // businessName
        'AlaskaPhase2',           // sourceName
        record.city || 'Alaska',  // city
        'AK',                     // state
        undefined,                // esnOrgId
        undefined,                // googlePlaceId
        undefined,                // foursquareVenueId
        undefined,                // hereBusinessId
        category,                 // businessCategory
        undefined,                // contactEmail
        undefined,                // phone
        undefined                 // website
      );

      if (orgId) {
        totalUpserted++;
      }
    } catch (recordErr) {
      console.error(`[Alaska Phase2] Upsert error for "${record.name}":`, recordErr);
    }
  }

  return totalUpserted;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Alaska DCCED Active Business License secondary sale scraper.
 * Tries ArcGIS Feature Service first (NAICS-filtered), falls back to CSV download.
 * If both fail, logs clearly and returns without crashing.
 */
export async function runAlaskaPhase2Scraper(): Promise<void> {
  console.log('[Alaska Phase2] Starting secondary sale scraper — Alaska DCCED Active Business Licenses');
  console.log(`[Alaska Phase2] Primary source: ${ARCGIS_SERVICE_BASE}`);

  let result: { success: true; records: ProcessedRecord[] } | { success: false };

  // Attempt 1: ArcGIS Feature Service (NAICS-filtered pagination)
  result = await runArcGISApproach();

  // Attempt 2: CSV download fallback via ArcGIS Hub page
  if (!result.success) {
    console.log('[Alaska Phase2] ArcGIS approach failed — trying CSV fallback');
    result = await runCsvApproach();
  }

  if (!result.success) {
    console.error(
      '[Alaska Phase2] All data fetch approaches failed. ' +
        'ArcGIS Feature Service and CSV download both unavailable. ' +
        'Verify the service ID and dataset URL are still valid.'
    );
    return;
  }

  const totalUpserted = await upsertRecords(result.records);

  console.log(
    `[Alaska Phase2] Done — matched: ${result.records.length}, upserted: ${totalUpserted}`
  );
}
