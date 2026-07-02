/**
 * Maine PFR (Professional and Financial Regulation) — Auctioneer License Scraper (Phase 2)
 * Scrapes licensed auctioneers from Maine PFR ALMSOnline system.
 *
 * Endpoint base: https://www.pfr.maine.gov/ALMSOnline/ALMSQuery/
 *   Search page:  SearchIndividual.aspx?Board=4210
 *   CSV export:   ExportToCSV.aspx
 *   Regulator:    4210 (Board of Licensing of Auctioneers)
 *
 * Confirmed 3-step flow (root causes fixed 2026-06-11):
 *
 *   Step 1 — GET SearchIndividual.aspx?Board=4210
 *     Header: Cookie: AspxAutoDetectCookieSupport=1
 *     Returns HTTP 200 (the cookie header bypasses the server's redirect loop).
 *     Response sets ASP.NET_SessionId cookie.
 *     Page contains __VIEWSTATEFIELDCOUNT=11 and fields __VIEWSTATE through __VIEWSTATE10.
 *
 *   Step 2 — POST SearchIndividual.aspx?Board=4210
 *     Cookie header: AspxAutoDetectCookieSupport=1; ASP.NET_SessionId=<id>
 *     Body: all 11 VIEWSTATE parts + __VIEWSTATEGENERATOR + __EVENTVALIDATION
 *           + all required form fields including btnSearch (establishes server-side search state).
 *     Response redirects to SearchResults.aspx — session state established.
 *
 *   Step 3 — GET ExportToCSV.aspx
 *     Cookie header: AspxAutoDetectCookieSupport=1; ASP.NET_SessionId=<id>
 *     No body required — session state already established in step 2.
 *     Returns application/octet-stream CSV with all records.
 *
 * Bug history (all fixed in this rewrite):
 *   BUG 1 — Cookie detection redirect: server issued 302 to ?AspxAutoDetectCookieSupport=1;
 *            Node fetch() without the initial cookie header looped indefinitely.
 *   BUG 2 — Chunked VIEWSTATE not extracted: page uses __VIEWSTATEFIELDCOUNT=11 (11 parts);
 *            original code only extracted __VIEWSTATE (1 of 11).
 *   BUG 3 — Wrong POST target: original code POSTed directly to ExportToCSV.aspx;
 *            correct flow requires POSTing to SearchIndividual.aspx first.
 *
 * Maine auctioneers are licensed under 32 M.R.S. § 281 et seq., regulated by
 * the Board of Licensing of Auctioneers under the Office of Professional &
 * Financial Regulation (PFR). Board/regulator ID 4210 in ALMS.
 *
 * ADR-073: Directory Scraper Phase 2 — State auctioneer licensing data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { batchUpsertScrapedOrganizers, ScrapedOrganizerRow } from '../index';

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
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match: name="__VIEWSTATE" ... value="..." or name='__VIEWSTATE' ... value='...'
  const pattern = new RegExp(
    `name=["']` + escaped + `["'][^>]*value=["']([^"']*)["']`,
    'i'
  );
  const m = html.match(pattern);
  if (m) return m[1];

  // Alternate order: value first, then name
  const pattern2 = new RegExp(
    `value=["']([^"']*)["'][^>]*name=["']` + escaped + `["']`,
    'i'
  );
  const m2 = html.match(pattern2);
  return m2 ? m2[1] : '';
}

// ---------------------------------------------------------------------------
// Step 1: GET the search page — obtain ASP.NET tokens + session cookie
// ---------------------------------------------------------------------------

interface AspNetTokens {
  viewState: string;                       // __VIEWSTATE (part 0)
  viewStateParts: Record<string, string>;  // keyed by field name e.g. '__VIEWSTATE1'
  viewStateFieldCount: number;             // 11 on the live page
  viewStateGenerator: string;
  eventValidation: string;
  cookie: string;  // 'AspxAutoDetectCookieSupport=1; ASP.NET_SessionId=<id>'
}

async function fetchSearchPage(): Promise<AspNetTokens | null> {
  const url = `${ALMS_SEARCH_URL}?Board=${REGULATOR_ID}`;
  console.log(`[${SOURCE_NAME}] GET ${url}`);

  try {
    await defaultRateLimiter.waitBeforeRequest(ALMS_DOMAIN);

    // BUG 1 FIX: Send the cookie support flag in the initial request so the
    // server does not issue a redirect loop trying to detect cookie support.
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': USER_AGENT,
        Cookie: 'AspxAutoDetectCookieSupport=1',
      },
      signal: AbortSignal.timeout(30000),
      redirect: 'follow',
    });

    if (!response.ok) {
      console.warn(`[${SOURCE_NAME}] Search page returned HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Extract ASP.NET_SessionId from Set-Cookie header
    const setCookieHeader = response.headers.get('set-cookie') || '';
    const sessionMatch = setCookieHeader.match(/ASP\.NET_SessionId=([^;]+)/i);
    const sessionId = sessionMatch ? sessionMatch[1] : '';
    if (!sessionId) {
      console.warn(`[${SOURCE_NAME}] ASP.NET_SessionId not found in Set-Cookie — session may be broken`);
    }
    const cookie = `AspxAutoDetectCookieSupport=1${sessionId ? `; ASP.NET_SessionId=${sessionId}` : ''}`;

    // BUG 2 FIX: Extract all VIEWSTATE parts.
    // The page uses __VIEWSTATEFIELDCOUNT=11, meaning fields __VIEWSTATE through __VIEWSTATE10.
    const viewState = extractHiddenField(html, '__VIEWSTATE');
    const viewStateGenerator = extractHiddenField(html, '__VIEWSTATEGENERATOR');
    const eventValidation = extractHiddenField(html, '__EVENTVALIDATION');

    const fieldCountRaw = extractHiddenField(html, '__VIEWSTATEFIELDCOUNT');
    const viewStateFieldCount = fieldCountRaw ? parseInt(fieldCountRaw, 10) : 1;

    const viewStateParts: Record<string, string> = {};
    for (let i = 1; i < viewStateFieldCount; i++) {
      const key = `__VIEWSTATE${i}`;
      viewStateParts[key] = extractHiddenField(html, key);
    }

    console.log(
      `[${SOURCE_NAME}] Search page OK — __VIEWSTATEFIELDCOUNT: ${viewStateFieldCount}, ` +
      `__VIEWSTATE length: ${viewState.length}, sessionId: ${sessionId ? 'present' : 'absent'}`
    );

    return { viewState, viewStateParts, viewStateFieldCount, viewStateGenerator, eventValidation, cookie };
  } catch (err) {
    console.error(`[${SOURCE_NAME}] Failed to fetch search page:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Step 2: POST to SearchIndividual.aspx — establish server-side search state
// ---------------------------------------------------------------------------

/**
 * Submit the search form to SearchIndividual.aspx with regulator=4210 and
 * empty name fields (returns all records). This establishes the server-side
 * session state that ExportToCSV.aspx will use in step 3.
 *
 * BUG 3 FIX: The original code POSTed directly to ExportToCSV.aspx, which
 * does not work. The correct flow requires posting to SearchIndividual.aspx
 * first so the server builds its result set in the session.
 */
async function fetchSearchResults(tokens: AspNetTokens): Promise<boolean> {
  const url = `${ALMS_SEARCH_URL}?Board=${REGULATOR_ID}`;
  console.log(`[${SOURCE_NAME}] POST ${url} (establishing search state for regulator=${REGULATOR_ID})`);

  try {
    await defaultRateLimiter.waitBeforeRequest(ALMS_DOMAIN);

    const body = new URLSearchParams();

    // Include __VIEWSTATE (part 0) and all additional parts
    body.set('__VIEWSTATE', tokens.viewState);
    for (const [key, value] of Object.entries(tokens.viewStateParts)) {
      body.set(key, value);
    }
    body.set('__VIEWSTATEFIELDCOUNT', String(tokens.viewStateFieldCount));
    body.set('__VIEWSTATEGENERATOR', tokens.viewStateGenerator);
    body.set('__EVENTVALIDATION', tokens.eventValidation);

    // Standard ASP.NET event fields
    body.set('__EVENTTARGET', '');
    body.set('__EVENTARGUMENT', '');
    body.set('__LASTFOCUS', '');

    // Form fields — exact names verified from live page HTML
    body.set('ctl00$ctl00$mainContent$mainContent$scDepartment', '');
    body.set('ctl00$ctl00$mainContent$mainContent$scAgency', '');
    body.set('ctl00$ctl00$mainContent$mainContent$scRegulator', REGULATOR_ID);
    body.set('ctl00$ctl00$mainContent$mainContent$scLastName', '');   // empty = all records
    body.set('ctl00$ctl00$mainContent$mainContent$scFirstName', '');
    body.set('ctl00$ctl00$mainContent$mainContent$scLicenseNo', '');
    body.set('ctl00$ctl00$mainContent$mainContent$iShowAdditionalOptions', 'False');
    body.set('ctl00$ctl00$mainContent$mainContent$iAdditionalOptionsSaved', 'False');
    body.set('ctl00$ctl00$mainContent$mainContent$btnSearch', 'Search');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': USER_AGENT,
        Referer: url,
        Origin: 'https://www.pfr.maine.gov',
        Cookie: tokens.cookie,
      },
      body: body.toString(),
      signal: AbortSignal.timeout(60000),
      redirect: 'follow',
    });

    console.log(`[${SOURCE_NAME}] Search POST response: HTTP ${response.status}, final URL: ${response.url}`);

    if (!response.ok) {
      console.warn(`[${SOURCE_NAME}] Search POST returned HTTP ${response.status}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[${SOURCE_NAME}] Failed to POST search form:`, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Step 3: GET ExportToCSV.aspx — receive CSV data using established session
// ---------------------------------------------------------------------------

/**
 * Fetch the CSV export using the session cookie established in steps 1 and 2.
 * No body or VIEWSTATE required — the server already has the search state.
 */
async function fetchCsvExport(tokens: AspNetTokens): Promise<string | null> {
  console.log(`[${SOURCE_NAME}] GET ${ALMS_EXPORT_URL} (session-based CSV export)`);

  try {
    await defaultRateLimiter.waitBeforeRequest(ALMS_DOMAIN);

    const response = await fetch(ALMS_EXPORT_URL, {
      method: 'GET',
      headers: {
        Accept: 'text/csv,text/plain,application/octet-stream,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': USER_AGENT,
        Referer: `${ALMS_SEARCH_URL}?Board=${REGULATOR_ID}`,
        Cookie: tokens.cookie,
      },
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
// Step 4: Parse CSV and upsert Organizer records
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
  const batchRows: ScrapedOrganizerRow[] = [];

  for (const record of records) {
    // Skip non-active licenses
    const statusLower = record.status.toLowerCase();
    if (statusLower && !statusLower.includes('active') && statusLower !== '') {
      continue;
    }

    batchRows.push({
      businessName: record.name,
      sourceName: SOURCE_NAME,
      city: record.city || 'Maine',
      state: 'ME',
      businessCategory: 'AUCTION_HOUSE', // all are licensed auctioneers
      isStateLicensed: true,
      licenseState: 'Maine',
      licenseNumber: record.licenseNumber || undefined,
      sourceLabel: SOURCE_LABEL,
    });
  }

  // Batch upsert (ADR-073 perf: replaces serial per-row upserts)
  const ids = await batchUpsertScrapedOrganizers(batchRows, 100);
  upserted = ids.filter((id) => id !== null).length;

  return upserted;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Maine PFR auctioneer license scraper — ALMSOnline edition.
 *
 * Fetches active auctioneer licenses (regulator 4210) from the Maine PFR
 * ALMSOnline system via a confirmed 3-step HTTP flow:
 *   1. GET SearchIndividual.aspx?Board=4210 with cookie support header
 *   2. POST SearchIndividual.aspx?Board=4210 with all VIEWSTATE parts + form fields
 *   3. GET ExportToCSV.aspx using the established session cookie
 *
 * Confirmed to return ~1,118 records as of 2026-06.
 * Throws on zero results to prevent silent failure.
 */
export async function runMainePhase2Scraper(): Promise<void> {
  console.log(`[${SOURCE_NAME}] Starting — Maine PFR ALMSOnline auctioneer license export`);
  console.log(`[${SOURCE_NAME}] Search page: ${ALMS_SEARCH_URL}?Board=${REGULATOR_ID}`);
  console.log(`[${SOURCE_NAME}] Export endpoint: ${ALMS_EXPORT_URL}`);

  // Step 1: GET search page — obtain ASP.NET tokens and session cookie
  const tokens = await fetchSearchPage();
  if (!tokens) {
    throw new Error(
      `[${SOURCE_NAME}] Cannot reach Maine PFR ALMSOnline search page (${ALMS_SEARCH_URL}). ` +
      `Check that www.pfr.maine.gov is reachable from the runner.`
    );
  }

  // Step 2: POST search form — establish server-side result set in session
  const searchOk = await fetchSearchResults(tokens);
  if (!searchOk) {
    throw new Error(
      `[${SOURCE_NAME}] Search POST to ${ALMS_SEARCH_URL} failed. ` +
      `ASP.NET tokens may have been rejected or the form field names changed.`
    );
  }

  // Step 3: GET CSV export — session state already established
  const csvText = await fetchCsvExport(tokens);
  if (!csvText) {
    throw new Error(
      `[${SOURCE_NAME}] CSV export returned no data from ${ALMS_EXPORT_URL}. ` +
      `Session may have expired between search POST and export GET.`
    );
  }

  // Step 4: Parse CSV
  const records = parseLicenseCsv(csvText);
  console.log(`[${SOURCE_NAME}] Parsed ${records.length} license records from CSV`);

  if (records.length === 0) {
    throw new Error(
      `[${SOURCE_NAME}] CSV parsed successfully but returned 0 records. ` +
      `Verify CSV column headers and regulator=${REGULATOR_ID} parameter. ` +
      `Export URL: ${ALMS_EXPORT_URL}`
    );
  }

  // Step 5: Upsert
  const totalUpserted = await upsertLicenseRecords(records);

  console.log(
    `[${SOURCE_NAME}] Done — parsed: ${records.length}, upserted: ${totalUpserted}`
  );
}
