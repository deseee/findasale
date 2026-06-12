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
import { getOrCreateScrapedOrganizer } from '../index';
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
 * The oop.ky.gov results table typically has columns:
 *   License # | Licensee Name | Business Name | City | State | License Status
 *
 * We detect the header row to build a column index map, then extract td cells
 * from data rows using that map.
 */
function parseResultsTable(html: string): LicenseRecord[] {
  const records: LicenseRecord[] = [];

  // Walk every <tr> in the page
  const rowRegex = /<tr[\s\S]*?>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  let headerFound = false;
  let colMap: Record<string, number> = {};

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    // Header row detection: contains <th> elements
    if (/<th[^>]*>/i.test(rowHtml)) {
      const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
      let thMatch: RegExpExecArray | null;
      let idx = 0;
      colMap = {};
      while ((thMatch = thRegex.exec(rowHtml)) !== null) {
        const header = extractText(thMatch[1]).toLowerCase();
        if (header.includes('license') && (header.includes('#') || header.includes('num'))) {
          colMap['licenseNumber'] = idx;
        } else if (header === 'lic #' || header === 'lic. #' || header === 'license #') {
          colMap['licenseNumber'] = idx;
        } else if (header.includes('licensee') || (header.includes('name') && !header.includes('business'))) {
          colMap['name'] = idx;
        } else if (header.includes('business')) {
          colMap['businessName'] = idx;
        } else if (header === 'city') {
          colMap['city'] = idx;
        } else if (header === 'state' || header === 'st') {
          colMap['state'] = idx;
        } else if (header.includes('status')) {
          colMap['status'] = idx;
        }
        idx++;
      }
      if (Object.keys(colMap).length >= 2) {
        headerFound = true;
      }
      continue;
    }

    if (!headerFound) continue;

    // Extract td cells
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
      cells.push(extractText(tdMatch[1]));
    }

    if (cells.length < 2) continue;

    // Use mapped columns; fall back to positional defaults:
    // 0=License# | 1=Name | 2=BusinessName | 3=City | 4=State | 5=Status
    const get = (key: string, fallbackIdx: number): string => {
      const i = colMap[key] ?? fallbackIdx;
      return (i < cells.length ? cells[i] : '').trim();
    };

    const licenseNumber = get('licenseNumber', 0);
    const name         = get('name', 1);
    const businessName = get('businessName', 2);
    const city         = get('city', 3);
    const state        = get('state', 4);
    const status       = get('status', 5);

    if (!name && !licenseNumber) continue;
    if (name.toLowerCase() === 'name' || licenseNumber.toLowerCase().includes('license')) continue;

    records.push({ licenseNumber, name, businessName, city, state, status });
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

  // Step 2: Iterate A–Z
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

      try {
        const orgId = await getOrCreateScrapedOrganizer(
          organizerName,
          SOURCE_ID,
          city,
          stateCode,
          undefined,                       // esnOrgId
          undefined,                       // googlePlaceId
          undefined,                       // foursquareVenueId
          undefined,                       // hereBusinessId
          'AUCTION_HOUSE',                 // businessCategory
          undefined,                       // contactEmail
          undefined,                       // phone
          undefined,                       // website
          undefined,                       // lat
          undefined,                       // lng
          true,                            // isStateLicensed
          'Kentucky',                      // licenseState
          rec.licenseNumber || undefined,  // licenseNumber
          SOURCE_ID                        // sourceLabel
        );
        if (orgId) upserted++;
      } catch (upsertErr) {
        console.error(`[KentuckyPhase2] Upsert error for "${organizerName}":`, upsertErr);
      }

      if (totalRecords % 25 === 0) {
        console.log(
          `[KentuckyPhase2] Progress: ${totalRecords} processed, ` +
          `${upserted} upserted, ${skipped} skipped`
        );
      }
    }
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
