/**
 * Kentucky — Board of Licensed Professional Occupations (OOP) Auctioneer Scraper (Phase 2)
 * ADR-073: Directory Scraper Phase 2 — State auctioneer licensing data
 *
 * Source: https://oop.ky.gov/lic_search.aspx
 * Board code 34 = Auctioneers (Kentucky Board of Auctioneers)
 * Method: ASP.NET form POST — GET initial page for VIEWSTATE tokens,
 *         then POST with board=34, status=Active, last_name=A..Z
 * Strategy: iterate A–Z on last name to page through all results without
 *           hitting ASP.NET result-count limits; dedup by license number.
 * Confirmed: ~155 live records as of 2026-06.
 *
 * All records are licensed auctioneers → category = AUCTION_HOUSE
 * isStateLicensed: true, licenseState: 'Kentucky'
 *
 * Replaces the dead web1.ky.gov GenSearch URL (parked 2026-06).
 */

import { defaultRateLimiter } from '../rateLimiter';
import { batchUpsertScrapedOrganizers, ScrapedOrganizerRow } from '../index';
import { getRandomUserAgent } from '../userAgents';

const OOP_URL = 'https://oop.ky.gov/lic_search.aspx';
const DOMAIN = 'oop.ky.gov';
const SOURCE_ID = 'KentuckyPhase2';

// Board 34 = Kentucky Board of Auctioneers
const BOARD_CODE = '34';

const LAST_NAME_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** Polite delay between requests (ms) */
const POLITE_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const EXCLUDE_FRAGMENTS = [
  'real estate', 'realty', 'realtor', 'mortgage', 'bank', 'credit union',
  'financial', 'insurance', 'law office', 'attorney', 'lawyer',
  'dental', 'dentist', 'medical', 'clinic', 'pharmacy', 'hospital',
  'restaurant', 'hotel', 'motel',
];

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

// ---------------------------------------------------------------------------
// HTML helpers (regex-based, no cheerio — matches pattern in arkansasPhase2Scraper)
// ---------------------------------------------------------------------------

function extractText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract a hidden ASP.NET form field value by name.
 * Handles both attribute orderings: name=... value=... and value=... name=...
 */
function extractHiddenField(html: string, fieldName: string): string {
  // name before value
  const re1 = new RegExp(
    `<input[^>]+name=["']${fieldName}["'][^>]+value=["']([^"']*)["']`,
    'i'
  );
  const m1 = html.match(re1);
  if (m1) return m1[1];
  // value before name
  const re2 = new RegExp(
    `<input[^>]+value=["']([^"']*)["'][^>]+name=["']${fieldName}["']`,
    'i'
  );
  const m2 = html.match(re2);
  return m2 ? m2[1] : '';
}

interface LicenseRecord {
  name: string;
  licenseNumber: string;
  city: string;
  state: string;
  status: string;
  businessName: string;
}

/**
 * Parse the OOP results table from the HTML response.
 *
 * oop.ky.gov uses <td> for ALL rows — no <th> elements exist anywhere.
 * Confirmed column layout (positional, verified 2026-06-12 via live fetch):
 *   0: Licensee Name
 *   1: Board Name  (e.g. "Kentucky Board of Auctioneers")
 *   2: License Type (e.g. "Principal Auctioneer" / "Apprentice Auctioneer")
 *   3: License Number (primary — always present)
 *   4: Secondary number OR status-flag string — variable
 *   …: Additional columns (dates, flags) — ignored
 *
 * We filter for rows where col[1] contains "auctioneer" to exclude stray
 * cross-board results and skip the header row by checking for non-numeric
 * content in col[3].
 */
function parseResultsTable(html: string): LicenseRecord[] {
  const records: LicenseRecord[] = [];

  const rowRegex = /<tr[\s\S]*?>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
      cells.push(extractText(tdMatch[1]));
    }

    // Need at least name + board + type + license#
    if (cells.length < 4) continue;

    const name        = cells[0].trim();
    const boardName   = cells[1].trim();
    const licenseType = cells[2].trim();
    const licenseNum  = cells[3].trim();

    // Skip header row (col[0] will be "Name" or similar text label)
    if (!name || name.toLowerCase() === 'name' || name.toLowerCase() === 'licensee name') continue;

    // Only keep auctioneer board records (safety filter for cross-board leakage)
    if (!boardName.toLowerCase().includes('auctioneer')) continue;

    // Skip if licenseNum looks like a non-numeric header label
    if (!licenseNum || !/^[0-9]/.test(licenseNum)) continue;

    records.push({
      licenseNumber: licenseNum,
      name,
      businessName:  '',          // OOP does not expose business name in this view
      city:          'Kentucky',  // OOP does not expose city in this view
      state:         'KY',
      status:        'Active',    // we POST with DStatus=Active so all results are active
    });
  }

  return records;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

interface AspNetSession {
  viewState: string;
  viewStateGenerator: string;
  eventValidation: string;
  cookies: string;
}

/**
 * Perform an initial GET to oop.ky.gov/lic_search.aspx to capture
 * ASP.NET hidden form tokens and session cookies.
 */
async function getInitialPage(): Promise<AspNetSession | null> {
  try {
    const response = await fetch(OOP_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.error(`[KentuckyPhase2] GET failed: HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();
    const viewState          = extractHiddenField(html, '__VIEWSTATE');
    const viewStateGenerator = extractHiddenField(html, '__VIEWSTATEGENERATOR');
    const eventValidation    = extractHiddenField(html, '__EVENTVALIDATION');

    // Capture session cookies
    const rawCookies: string[] = [];
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      // Node fetch may return a single joined string; split on ", " boundary between cookies
      rawCookies.push(...setCookieHeader.split(/,\s*(?=[A-Za-z_-]+=)/).map((c) => c.split(';')[0]));
    }
    const cookies = rawCookies.join('; ');

    if (!viewState && !eventValidation) {
      console.warn('[KentuckyPhase2] No ASP.NET tokens found on initial GET — page structure may have changed');
    }

    return { viewState, viewStateGenerator, eventValidation, cookies };
  } catch (err) {
    console.error('[KentuckyPhase2] Initial GET error:', err);
    return null;
  }
}

/**
 * POST the search form for a given last-name letter.
 *
 * OOP ASP.NET form field names — verified against live https://oop.ky.gov/lic_search.aspx
 * (ContentPlaceHolder2, confirmed 2026-06-11).
 * Board is a checkbox (chkBoards$2), not a dropdown. Individual/active/last-name filters.
 *
 * Field names (verified against live page 2026-06-11):
 *   ctl00$ContentPlaceHolder2$chkBoards$2 = "34" (checkbox: KY Board of Auctioneers)
 *   ctl00$ContentPlaceHolder2$rdLictype   = "1" (Individual search)
 *   ctl00$ContentPlaceHolder2$DStatus     = "Active"
 *   ctl00$ContentPlaceHolder2$TLname      = letter (A, B, …, Z)
 *   ctl00$ContentPlaceHolder2$BSrch       = "Search"
 */
async function searchByLastNameLetter(
  letter: string,
  session: AspNetSession
): Promise<LicenseRecord[] | null> {
  try {
    const body = new URLSearchParams();
    body.set('__VIEWSTATE',          session.viewState);
    body.set('__VIEWSTATEGENERATOR', session.viewStateGenerator);
    body.set('__EVENTVALIDATION',    session.eventValidation);
    body.set('__EVENTTARGET',        '');
    body.set('__EVENTARGUMENT',      '');

    // Board/status/last-name controls (ContentPlaceHolder2 — verified 2026-06-11 against live page)
    body.set('ctl00$ContentPlaceHolder2$chkBoards$2', BOARD_CODE);   // checkbox: KY Board of Auctioneers (board ID 34)
    body.set('ctl00$ContentPlaceHolder2$rdLictype',   '1');              // Individual search
    body.set('ctl00$ContentPlaceHolder2$DStatus',     'Active');
    body.set('ctl00$ContentPlaceHolder2$TLname',      letter);
    body.set('ctl00$ContentPlaceHolder2$BSrch',       'Search');

    const response = await fetch(OOP_URL, {
      method: 'POST',
      headers: {
        'User-Agent':      getRandomUserAgent(),
        Accept:            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type':    'application/x-www-form-urlencoded',
        Referer:           OOP_URL,
        ...(session.cookies ? { Cookie: session.cookies } : {}),
      },
      body: body.toString(),
      signal: AbortSignal.timeout(45000),
    });

    if (!response.ok) {
      console.warn(`[KentuckyPhase2] POST failed for "${letter}": HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Update session cookies from response
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      const newCookies = setCookieHeader
        .split(/,\s*(?=[A-Za-z_-]+=)/)
        .map((c) => c.split(';')[0]);
      session.cookies = newCookies.join('; ');
    }

    // Refresh ASP.NET tokens from response (required for next POST)
    const newVs = extractHiddenField(html, '__VIEWSTATE');
    if (newVs) session.viewState = newVs;
    const newVsg = extractHiddenField(html, '__VIEWSTATEGENERATOR');
    if (newVsg) session.viewStateGenerator = newVsg;
    const newEv = extractHiddenField(html, '__EVENTVALIDATION');
    if (newEv) session.eventValidation = newEv;

    const lowerHtml = html.toLowerCase();
    if (
      lowerHtml.includes('access denied') ||
      lowerHtml.includes('403 forbidden') ||
      lowerHtml.includes('cf-browser-verification')
    ) {
      console.warn(`[KentuckyPhase2] Access denied for letter "${letter}"`);
      return null;
    }

    return parseResultsTable(html);
  } catch (err) {
    console.warn(`[KentuckyPhase2] POST error for letter "${letter}":`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Board selection autopostback
// ---------------------------------------------------------------------------

/**
 * POST the board-selection autopostback to activate board 34 (Auctioneers)
 * in the server-side session before running letter searches.
 *
 * oop.ky.gov uses ASP.NET AutoPostBack on the board checkboxes: clicking a
 * checkbox triggers an immediate form POST with __EVENTTARGET set to the
 * checkbox control ID. The server updates its ViewState and returns a new
 * page. Subsequent Search POSTs must use this updated ViewState — otherwise
 * the board filter is ignored and all boards are returned.
 *
 * Verified flow (2026-06-12):
 *   1. GET lic_search.aspx → capture VIEWSTATE + session cookie
 *   2. POST with __EVENTTARGET=ctl00$ContentPlaceHolder2$chkBoards$2 → updated VIEWSTATE
 *   3. POST per letter with BSrch=Search + updated VIEWSTATE → board-filtered results
 */
async function selectBoardInSession(session: AspNetSession): Promise<boolean> {
  try {
    const body = new URLSearchParams();
    body.set('__VIEWSTATE',          session.viewState);
    body.set('__VIEWSTATEGENERATOR', session.viewStateGenerator);
    body.set('__EVENTVALIDATION',    session.eventValidation);
    body.set('__EVENTTARGET',        'ctl00$ContentPlaceHolder2$chkBoards$2');
    body.set('__EVENTARGUMENT',      '');
    body.set('ctl00$ContentPlaceHolder2$chkBoards$2', BOARD_CODE);
    body.set('ctl00$ContentPlaceHolder2$rdLictype',   '1');
    body.set('ctl00$ContentPlaceHolder2$DStatus',     'Active');

    const response = await fetch(OOP_URL, {
      method: 'POST',
      headers: {
        'User-Agent':      getRandomUserAgent(),
        Accept:            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type':    'application/x-www-form-urlencoded',
        Referer:           OOP_URL,
        ...(session.cookies ? { Cookie: session.cookies } : {}),
      },
      body: body.toString(),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.warn(`[KentuckyPhase2] Board-select POST failed: HTTP ${response.status}`);
      return false;
    }

    const html = await response.text();

    // Update cookies
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      const newCookies = setCookieHeader
        .split(/,\s*(?=[A-Za-z_-]+=)/)
        .map((c) => c.split(';')[0]);
      session.cookies = newCookies.join('; ');
    }

    // Update VIEWSTATE — required for subsequent Search POSTs
    const newVs = extractHiddenField(html, '__VIEWSTATE');
    if (newVs) session.viewState = newVs;
    const newVsg = extractHiddenField(html, '__VIEWSTATEGENERATOR');
    if (newVsg) session.viewStateGenerator = newVsg;
    const newEv = extractHiddenField(html, '__EVENTVALIDATION');
    if (newEv) session.eventValidation = newEv;

    return true;
  } catch (err) {
    console.error('[KentuckyPhase2] Board-select POST error:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Kentucky Board of Auctioneers license scraper — Phase 2.
 *
 * Uses the OOP portal at https://oop.ky.gov/lic_search.aspx (board=34).
 * Iterates last-name A–Z to retrieve all licensed auctioneers.
 * Deduplicates by license number across letters.
 * Upserts via getOrCreateScrapedOrganizer with isStateLicensed=true.
 *
 * Replaces the dead web1.ky.gov GenSearch URL (parked 2026-06).
 * Confirmed ~155 live records.
 *
 * MUST throw if zero records found across all letters (source may be down).
 */
export async function runKentuckyPhase2Scraper(): Promise<void> {
  console.log('[KentuckyPhase2] Starting KY Board of Auctioneers scraper (OOP portal)');
  console.log(`[KentuckyPhase2] Source: ${OOP_URL} — Board ${BOARD_CODE}, Status: Active`);

  let totalRecords = 0;
  let upserted     = 0;
  let skipped      = 0;
  let letterErrors = 0;

  // Deduplicate across A–Z iterations
  const seenLicenses = new Set<string>();

  // Step 1: GET initial page to capture ASP.NET tokens
  await defaultRateLimiter.waitBeforeRequest(DOMAIN);
  const session = await getInitialPage();

  if (!session) {
    throw new Error('[KentuckyPhase2] Failed to load OOP initial page — cannot obtain ASP.NET tokens');
  }

  console.log('[KentuckyPhase2] Initial page loaded — ASP.NET tokens captured');

  // Step 2: Board-selection autopostback (required — activates board 34 filter in VIEWSTATE)
  await defaultRateLimiter.waitBeforeRequest(DOMAIN);
  const boardSelected = await selectBoardInSession(session);
  if (!boardSelected) {
    console.warn('[KentuckyPhase2] Board-select POST failed — results may include all boards');
  } else {
    console.log('[KentuckyPhase2] Board 34 (Auctioneers) selected — VIEWSTATE updated');
  }

  // Step 3: Iterate A–Z
  for (const letter of LAST_NAME_LETTERS) {
    await defaultRateLimiter.waitBeforeRequest(DOMAIN);
    await sleep(POLITE_DELAY_MS);

    console.log(`[KentuckyPhase2] Searching last name prefix: ${letter}`);

    const records = await searchByLastNameLetter(letter, session);

    if (records === null) {
      letterErrors++;
      console.warn(`[KentuckyPhase2] No response for letter "${letter}" — skipping`);
      continue;
    }

    if (records.length === 0) {
      console.log(`[KentuckyPhase2] Letter "${letter}": 0 results`);
      continue;
    }

    console.log(`[KentuckyPhase2] Letter "${letter}": ${records.length} record(s)`);

    // Accumulate rows for this letter — batch upsert after the loop (ADR-073 perf)
    const letterRows: ScrapedOrganizerRow[] = [];

    for (const rec of records) {
      // Deduplicate by license number; fall back to name slug
      const dedupKey = rec.licenseNumber
        ? `LIC-${rec.licenseNumber.trim().toUpperCase()}`
        : `NAME-${rec.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

      if (seenLicenses.has(dedupKey)) continue;
      seenLicenses.add(dedupKey);

      const displayName = rec.businessName || rec.name;

      // Skip excluded business types
      if (nameIsExcluded(displayName)) {
        skipped++;
        continue;
      }

      // Skip non-active licenses
      if (rec.status) {
        const statusLower = rec.status.toLowerCase();
        if (
          statusLower.includes('expired')   ||
          statusLower.includes('revoked')   ||
          statusLower.includes('suspended') ||
          statusLower.includes('inactive')  ||
          statusLower.includes('lapsed')    ||
          statusLower.includes('cancelled')
        ) {
          skipped++;
          continue;
        }
      }

      totalRecords++;

      // Prefer business name; fall back to licensee name
      const organizerName = rec.businessName?.trim() || rec.name.trim();

      const city = (rec.city || '')
        .replace(/,?\s*KY\b.*$/i, '')
        .replace(/,?\s*Kentucky\b.*$/i, '')
        .trim() || 'Kentucky';

      const stateCode = (rec.state || 'KY').trim().toUpperCase().slice(0, 2) || 'KY';

      letterRows.push({
        businessName: organizerName,
        sourceName: SOURCE_ID,
        city,
        state: stateCode,
        businessCategory: 'AUCTION_HOUSE',
        isStateLicensed: true,
        licenseState: 'Kentucky',
        licenseNumber: rec.licenseNumber || undefined,
        sourceLabel: SOURCE_ID,
      });

      if (totalRecords % 25 === 0) {
        console.log(
          `[KentuckyPhase2] Progress: ${totalRecords} processed, ` +
          `${upserted} upserted, ${skipped} skipped`
        );
      }
    }

    // Batch upsert for this letter (ADR-073 perf: replaces serial per-row upserts)
    const ids = await batchUpsertScrapedOrganizers(letterRows, 100);
    upserted += ids.filter((id) => id !== null).length;
  }

  console.log(
    `[KentuckyPhase2] Complete — ${totalRecords} records processed, ` +
    `${upserted} upserted, ${skipped} skipped, ${letterErrors} letter(s) errored`
  );

  if (totalRecords === 0) {
    throw new Error(
      '[KentuckyPhase2] Zero active auctioneer records found across all A–Z queries. ' +
      'OOP portal may be down, form field names may have changed, or board code 34 is incorrect. ' +
      `Check ${OOP_URL} manually.`
    );
  }
}
