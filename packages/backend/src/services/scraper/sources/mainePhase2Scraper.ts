/**
 * Maine PFR (Professional and Financial Regulation) — Auctioneer License Scraper (Phase 2)
 * Scrapes licensed auctioneers from Maine PFR ALMSOnline system.
 *
 * New endpoint (confirmed working — returns 1,118 records):
 *   Base: https://www.pfr.maine.gov/ALMSOnline/ALMSQuery/
 *   Search page: SearchIndividual.aspx
 *   CSV export: ExportToCSV.aspx
 *   Parameters: regulator=4210 (Board of Licensing of Auctioneers), scOnlyActive=true
 *
 * The old hostname pfr.maine.gov is NXDOMAIN — do not use it.
 *
 * Flow:
 *   1. GET SearchIndividual.aspx to obtain ASP.NET hidden fields
 *      (__VIEWSTATE, __EVENTVALIDATION, etc.) and session cookie.
 *   2. POST to ExportToCSV.aspx with regulator=4210 + scOnlyActive=true
 *      plus the hidden fields from step 1.
 *   3. Parse the CSV response (Name, License Number, City, Status columns).
 *   4. Upsert Organizer records via getOrCreateScrapedOrganizer.
 *
 * Maine auctioneers are licensed under 32 M.R.S. § 281 et seq., regulated by
 * the Board of Licensing of Auctioneers under the Office of Professional &
 * Financial Regulation (PFR). Board/regulator ID 4210 in ALMS.
 *
 * ADR-073: Directory Scraper Phase 2 — State auctioneer licensing data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ALMS_DOMAIN = 'www.pfr.maine.gov';
const ALMS_BASE_URL = 'https://www.pfr.maine.gov/ALMSOnline/ALMSQuery/';
const ALMS_SEARCH_URL = `${ALMS_BASE_URL}SearchIndividual.aspx`;
const ALMS_EXPORT_URL = `${ALMS_BASE_URL}ExportToCSV.aspx`;

const REGULATOR_ID = '4210'; // Board of Licensing of Auctioneers
const SOURCE_NAME = 'MainePhase2';
const SOURCE_LABEL = 'ME-PFR-Auctioneer';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a single CSV line respecting quoted fields (RFC 4180).
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped double-quote inside a quoted field
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
 * Extract a hidden ASP.NET form field value from HTML.
 * Handles both single- and double-quoted attribute values.
 */
function extractHiddenField(html: string, fieldName: string): string {
  // Match: name="__VIEWSTATE" ... value="..." or name='__VIEWSTATE' ... value='...'
  const pattern = new RegExp(
    `name=["']{fieldName}["'"][^>]*value=["'"]([^"']*)["']`.replace('{fieldName}', fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'i'
  );
  const m = html.match(pattern);
  if (m) return m[1];

  // Alternate order: value first, then name
  const pattern2 = new RegExp(
    `value=["'"]([^"']*)["'][^>]*name=["']{fieldName}["']`.replace('{fieldName}', fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'i'
  );
  const m2 = html.match(pattern2);
  return m2 ? m2[1] : '';
}

/**
 * Extract all Set-Cookie values from a Headers object and return a
 * semicolon-joined Cookie header string suitable for the next request.
 */
function buildCookieHeader(headers: Headers): string {
  const raw = headers.get('set-cookie') || '';
  if (!raw) return '';
  // Each cookie pair is "name=value; path=..." — take just "name=value"
  return raw
    .split(',')
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

// ---------------------------------------------------------------------------
// Step 1: GET the search page — obtain ASP.NET tokens + session cookie
// ---------------------------------------------------------------------------

interface AspNetTokens {
  viewState: string;
  viewStateGenerator: string;
  eventValidation: string;
  cookie: string;
}

async function fetchSearchPage(): Promise<AspNetTokens | null> {
  console.log(`[${SOURCE_NAME}] GET ${ALMS_SEARCH_URL}`);

  try {
    await defaultRateLimiter.waitBeforeRequest(ALMS_DOMAIN);

    const response = await fetch(ALMS_SEARCH_URL, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(30000),
      redirect: 'follow',
    });

    if (!response.ok) {
      console.warn(`[${SOURCE_NAME}] Search page returned HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();
    const cookie = buildCookieHeader(response.headers);

    const viewState = extractHiddenField(html, '__VIEWSTATE');
    const viewStateGenerator = extractHiddenField(html, '__VIEWSTATEGENERATOR');
    const eventValidation = extractHiddenField(html, '__EVENTVALIDATION');

    if (!viewState) {
      console.warn(`[${SOURCE_NAME}] __VIEWSTATE not found in search page — ASP.NET session may have failed`);
      // Still continue — some ALMS endpoints work without tokens
    }

    console.log(
      `[${SOURCE_NAME}] Search page OK — __VIEWSTATE length: ${viewState.length}, cookie: ${cookie ? 'present' : 'absent'}`
    );

    return { viewState, viewStateGenerator, eventValidation, cookie };
  } catch (err) {
    console.error(`[${SOURCE_NAME}] Failed to fetch search page:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Step 2: POST to ExportToCSV.aspx — receive CSV data
// ---------------------------------------------------------------------------

async function fetchCsvExport(tokens: AspNetTokens): Promise<string | null> {
  console.log(`[${SOURCE_NAME}] POST ${ALMS_EXPORT_URL} (regulator=${REGULATOR_ID}, scOnlyActive=true)`);

  try {
    await defaultRateLimiter.waitBeforeRequest(ALMS_DOMAIN);

    const body = new URLSearchParams();
    body.set('__VIEWSTATE', tokens.viewState);
    body.set('__VIEWSTATEGENERATOR', tokens.viewStateGenerator);
    body.set('__EVENTVALIDATION', tokens.eventValidation);
    body.set('regulator', REGULATOR_ID);
    body.set('scOnlyActive', 'true');

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/csv,text/plain,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': USER_AGENT,
      Referer: ALMS_SEARCH_URL,
      Origin: 'https://www.pfr.maine.gov',
    };
    if (tokens.cookie) {
      headers['Cookie'] = tokens.cookie;
    }

    const response = await fetch(ALMS_EXPORT_URL, {
      method: 'POST',
      headers,
      body: body.toString(),
      signal: AbortSignal.timeout(60000),
      redirect: 'follow',
    });

    if (!response.ok) {
      console.warn(`[${SOURCE_NAME}] CSV export returned HTTP ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    if (!text || text.trim().length < 10) {
      console.warn(`[${SOURCE_NAME}] CSV export returned empty body (content-type: ${contentType})`);
      return null;
    }

    console.log(
      `[${SOURCE_NAME}] CSV export received — ${text.length.toLocaleString()} bytes, content-type: ${contentType}`
    );
    return text;
  } catch (err) {
    console.error(`[${SOURCE_NAME}] Failed to fetch CSV export:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Step 3: Parse CSV and upsert Organizer records
// ---------------------------------------------------------------------------

interface LicenseRecord {
  name: string;
  licenseNumber: string;
  city: string;
  status: string;
}

/**
 * Parse the ALMSOnline CSV export.
 * Expected columns (order may vary): Name, License Number, City, Status, etc.
 * We detect column positions from the header row.
 */
function parseLicenseCsv(csvText: string): LicenseRecord[] {
  const lines = csvText.split('\n').map((l) => l.replace(/\r$/, ''));
  if (lines.length < 2) {
    console.warn(`[${SOURCE_NAME}] CSV has fewer than 2 lines — cannot parse`);
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  console.log(`[${SOURCE_NAME}] CSV headers (${headers.length}): ${headers.join(' | ')}`);

  // Column index resolver — tries multiple candidate names
  const col = (...names: string[]): number => {
    for (const name of names) {
      const idx = headers.indexOf(name);
      if (idx !== -1) return idx;
    }
    // Partial match fallback
    for (const name of names) {
      const idx = headers.findIndex((h) => h.includes(name));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const iName = col('name', 'licensee name', 'full name', 'applicant name', 'business name');
  const iLicense = col('license number', 'license no', 'license #', 'lic number', 'lic no', 'license');
  const iCity = col('city', 'city/town', 'town', 'location', 'municipality');
  const iStatus = col('status', 'license status', 'active');

  if (iName === -1) {
    console.error(`[${SOURCE_NAME}] Cannot locate name column in CSV headers — headers were: ${headers.join(', ')}`);
    return [];
  }

  const records: LicenseRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const fields = parseCsvLine(line);

      const name = (iName >= 0 ? fields[iName] || '' : '').trim();
      if (!name || name.length < 2) continue;

      const licenseNumber = (iLicense >= 0 ? fields[iLicense] || '' : '').trim();
      const city = (iCity >= 0 ? fields[iCity] || '' : '').trim();
      const status = (iStatus >= 0 ? fields[iStatus] || '' : 'Active').trim();

      records.push({ name, licenseNumber, city, status });
    } catch (rowErr) {
      console.warn(`[${SOURCE_NAME}] Row ${i} parse error:`, rowErr);
    }
  }

  return records;
}

/**
 * Upsert parsed license records into the Organizer table.
 * Only processes records with an Active (or empty) status.
 */
async function upsertLicenseRecords(records: LicenseRecord[]): Promise<number> {
  let upserted = 0;

  for (const record of records) {
    // Skip non-active licenses
    const statusLower = record.status.toLowerCase();
    if (statusLower && !statusLower.includes('active') && statusLower !== '') {
      continue;
    }

    try {
      const orgId = await getOrCreateScrapedOrganizer(
        record.name,                        // businessName
        SOURCE_NAME,                        // sourceName
        record.city || 'Maine',             // city
        'ME',                               // state
        undefined,                          // esnOrgId
        undefined,                          // googlePlaceId
        undefined,                          // foursquareVenueId
        undefined,                          // hereBusinessId
        'AUCTION_HOUSE',                    // businessCategory — all are licensed auctioneers
        undefined,                          // contactEmail
        undefined,                          // phone
        undefined,                          // website
        undefined,                          // lat
        undefined,                          // lng
        true,                               // isStateLicensed
        'Maine',                            // licenseState
        record.licenseNumber || undefined,  // licenseNumber
        SOURCE_LABEL                        // sourceLabel
      );
      if (orgId) upserted++;
    } catch (upsertErr) {
      console.error(`[${SOURCE_NAME}] Upsert error for "${record.name}":`, upsertErr);
    }
  }

  return upserted;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Maine PFR auctioneer license scraper — ALMSOnline edition.
 *
 * Fetches active auctioneer licenses (regulator 4210) from the Maine PFR
 * ALMSOnline system via a two-step HTTP flow:
 *   1. GET SearchIndividual.aspx — capture ASP.NET hidden form tokens
 *   2. POST ExportToCSV.aspx — receive full CSV of active licensees
 *
 * Confirmed to return 1,118 records as of 2026-06.
 * Throws on zero results to prevent silent failure.
 */
export async function runMainePhase2Scraper(): Promise<void> {
  console.log(`[${SOURCE_NAME}] Starting — Maine PFR ALMSOnline auctioneer license export`);
  console.log(`[${SOURCE_NAME}] Search page: ${ALMS_SEARCH_URL}`);
  console.log(`[${SOURCE_NAME}] Export endpoint: ${ALMS_EXPORT_URL} (regulator=${REGULATOR_ID})`);

  // Step 1: Fetch search page for ASP.NET session tokens
  const tokens = await fetchSearchPage();
  if (!tokens) {
    throw new Error(
      `[${SOURCE_NAME}] Cannot reach Maine PFR ALMSOnline search page (${ALMS_SEARCH_URL}). ` +
      `Check that www.pfr.maine.gov is reachable from the runner.`
    );
  }

  // Step 2: POST to CSV export endpoint
  const csvText = await fetchCsvExport(tokens);
  if (!csvText) {
    throw new Error(
      `[${SOURCE_NAME}] CSV export returned no data from ${ALMS_EXPORT_URL}. ` +
      `ASP.NET tokens may have been rejected or the regulator parameter changed.`
    );
  }

  // Step 3: Parse CSV
  const records = parseLicenseCsv(csvText);
  console.log(`[${SOURCE_NAME}] Parsed ${records.length} license records from CSV`);

  if (records.length === 0) {
    throw new Error(
      `[${SOURCE_NAME}] CSV parsed successfully but returned 0 records. ` +
      `Verify CSV column headers and regulator=${REGULATOR_ID} parameter. ` +
      `Export URL: ${ALMS_EXPORT_URL}`
    );
  }

  // Step 4: Upsert
  const totalUpserted = await upsertLicenseRecords(records);

  console.log(
    `[${SOURCE_NAME}] Done — parsed: ${records.length}, upserted: ${totalUpserted}`
  );
}
