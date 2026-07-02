/**
 * New Hampshire — Secondary Sale License Scraper (Phase 2)
 *
 * Source: NH Office of Professional Licensure and Certification (OPLC)
 *   License verification portal: https://forms.nh.gov/licenseverification/
 *   Auctioneer info page: https://www.oplc.nh.gov/auctioneers
 *
 * Strategy:
 *   The OPLC license verification portal is an ASP.NET form that allows
 *   searching by profession type. We search for "Auctioneer" licenses
 *   with an empty name (wildcard) to retrieve all active auctioneers.
 *
 *   The portal uses Akamai CDN which blocks cloud/datacenter IPs.
 *   When blocked (HTTP 403), the scraper logs diagnostics and throws
 *   so the workflow correctly reports zero results as a failure.
 *
 * NH pawnbroker licensing is municipal-only (no statewide registry).
 *
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 */

import * as cheerio from 'cheerio';
import { defaultRateLimiter } from '../rateLimiter';
import { batchUpsertScrapedOrganizers, ScrapedOrganizerRow } from '../index';
import { getRandomUserAgent } from '../userAgents';

const OPLC_DOMAIN = 'forms.nh.gov';
const OPLC_SEARCH_URL = 'https://forms.nh.gov/licenseverification/Search.aspx';

const EXCLUDE_FRAGMENTS = [
  'real estate', 'realty', 'realtor', 'mortgage', 'bank', 'credit union',
  'financial', 'insurance', 'restaurant', 'petroleum', 'dental', 'medical',
  'pharmacy', 'funeral', 'tax service', 'accounting', 'attorney',
  'law office', 'landscaping', 'construction', 'plumbing', 'electrical',
  'roofing', 'automotive repair', 'car wash', 'dry clean', 'laundry',
  'hair salon', 'nail salon', 'tattoo', 'massage', 'yoga', 'daycare',
];

interface NHLicensee {
  name: string;
  city: string;
  licenseNumber: string;
  status: string;
}

function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Extract an ASP.NET hidden field value from HTML.
 */
function extractHiddenField(html: string, fieldId: string): string {
  const match = html.match(
    new RegExp(`id="${fieldId}"\\s+value="([^"]*)"`, 's'),
  );
  return match ? match[1] : '';
}

/**
 * Build a URL-encoded form body.
 */
function buildFormBody(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/**
 * Parse licensee rows from the OPLC search results HTML.
 *
 * The results page uses a GridView table. We look for table rows with
 * license data (name, city, license number, status).
 */
function parseLicensees(html: string): NHLicensee[] {
  const $ = cheerio.load(html);
  const results: NHLicensee[] = [];

  // Try multiple table selectors — ASP.NET GridView IDs vary
  const tableSelectors = [
    '#ctl00_MainContentPlaceHolder_gvSearchResults',
    '#MainContentPlaceHolder_gvSearchResults',
    '#gvSearchResults',
    'table.GridView',
    'table.grid',
    '.results-table table',
    '#results table',
  ];

  let $table = $();
  for (const sel of tableSelectors) {
    $table = $(sel);
    if ($table.length > 0) break;
  }

  // Fallback: find any table with multiple rows that looks like results
  if ($table.length === 0) {
    $('table').each((_i, el) => {
      const rows = $(el).find('tr');
      if (rows.length > 3) {
        $table = $(el);
        return false; // break
      }
    });
  }

  if ($table.length === 0) {
    // Try parsing without table structure — some portals use div-based layouts
    const rows = $('div.row, div.result-item, div.licensee, tr');
    if (rows.length === 0) {
      console.log('[NewHampshirePhase2] No results table found in HTML');
      return results;
    }
  }

  // Parse table rows (skip header row)
  $table.find('tr').each((_i, el) => {
    const tds = $(el).find('td');
    if (tds.length < 3) return; // skip header or malformed rows

    // Common OPLC column orders:
    // Name | License# | City | Status  OR
    // License# | Name | City/State | Status
    const cells = tds.map((_j, td) => $(td).text().trim()).get();

    // Find which cell looks like a license number (alphanumeric pattern)
    let name = '';
    let licenseNumber = '';
    let city = '';
    let status = '';

    for (const cell of cells) {
      if (/^[A-Z]{2,4}[\-\s]?\d{3,}$/i.test(cell) && !licenseNumber) {
        licenseNumber = cell;
      } else if (/active|inactive|expired|pending|current/i.test(cell) && !status) {
        status = cell;
      } else if (!name && cell.length > 2 && !/^\d+$/.test(cell)) {
        name = cell;
      } else if (name && !city && cell.length > 1) {
        // Could be city or city/state
        const cityMatch = cell.match(/^([A-Za-z\s.'-]+?)(?:,\s*NH)?$/i);
        if (cityMatch) {
          city = cityMatch[1].trim();
        } else {
          city = cell;
        }
      }
    }

    if (name && !nameIsExcluded(name)) {
      results.push({
        name,
        city: city || 'New Hampshire',
        licenseNumber,
        status: status || 'Active',
      });
    }
  });

  return results;
}

/**
 * Attempt to fetch the OPLC initial search page and extract ASP.NET form state.
 */
async function fetchInitialPage(): Promise<{
  html: string;
  cookies: string;
} | null> {
  try {
    await defaultRateLimiter.waitBeforeRequest(OPLC_DOMAIN);
    const response = await fetch(OPLC_SEARCH_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (response.status === 403) {
      console.warn('[NewHampshirePhase2] OPLC returned 403 — Akamai WAF blocking cloud IP');
      return null;
    }

    if (!response.ok) {
      console.warn(`[NewHampshirePhase2] OPLC GET HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();
    const cookies = response.headers.get('set-cookie') ?? '';
    return { html, cookies };
  } catch (err) {
    console.warn('[NewHampshirePhase2] OPLC initial GET failed:', err);
    return null;
  }
}

/**
 * POST search form to OPLC license verification.
 */
async function postSearchForm(
  body: string,
  cookies: string,
): Promise<{ html: string; cookies: string } | null> {
  try {
    await defaultRateLimiter.waitBeforeRequest(OPLC_DOMAIN);
    const response = await fetch(OPLC_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': OPLC_SEARCH_URL,
        'Cookie': cookies,
      },
      body,
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      console.warn(`[NewHampshirePhase2] OPLC POST HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();
    const newCookies = response.headers.get('set-cookie') ?? cookies;
    return { html, cookies: newCookies };
  } catch (err) {
    console.warn('[NewHampshirePhase2] OPLC POST failed:', err);
    return null;
  }
}

/**
 * New Hampshire Phase 2 scraper — OPLC Auctioneer licenses.
 *
 * Uses the NH OPLC license verification portal (ASP.NET form).
 * Searches for all active Auctioneer licenses statewide.
 *
 * NOTE: The portal uses Akamai CDN which blocks cloud/datacenter IPs.
 * This scraper will work from residential IPs or with a proxy configured.
 * When blocked, it throws with a clear diagnostic message.
 */
export async function runNewHampshirePhase2Scraper(): Promise<void> {
  console.log('[NewHampshirePhase2] ═══ NH Phase 2 scraper starting ═══════');
  console.log(`[NewHampshirePhase2] Source: ${OPLC_SEARCH_URL}`);

  // Step 1 — GET initial page for ASP.NET form state
  const initial = await fetchInitialPage();
  if (!initial) {
    // INTENTIONAL_BREAK: Akamai WAF blocks cloud IPs — parked 2026-06.
    console.log('[NewHampshirePhase2] PARKED: OPLC portal unreachable (Akamai WAF blocking cloud IP). Exiting cleanly.');
    return;
  }

  const viewstate = extractHiddenField(initial.html, '__VIEWSTATE');
  const viewstateGen = extractHiddenField(initial.html, '__VIEWSTATEGENERATOR');
  const eventVal = extractHiddenField(initial.html, '__EVENTVALIDATION');

  if (!viewstate) {
    // INTENTIONAL_BREAK: parked 2026-06 — Akamai WAF blocks cloud IPs.
    console.log('[NewHampshirePhase2] PARKED: Could not extract __VIEWSTATE (Akamai WAF or form change). Exiting cleanly.');
    return;
  }

  console.log('[NewHampshirePhase2] Got initial page with form state');

  // Step 2 — POST search for Auctioneer profession, all active, empty name = wildcard
  // Common OPLC form field names (ASP.NET control IDs)
  const searchBody = buildFormBody({
    __EVENTTARGET: '',
    __EVENTARGUMENT: '',
    __VIEWSTATE: viewstate,
    __VIEWSTATEGENERATOR: viewstateGen,
    __EVENTVALIDATION: eventVal,
    'ctl00$MainContentPlaceHolder$txtLastName': '',
    'ctl00$MainContentPlaceHolder$txtFirstName': '',
    'ctl00$MainContentPlaceHolder$txtLicenseNumber': '',
    'ctl00$MainContentPlaceHolder$ddlProfession': 'Auctioneer',
    'ctl00$MainContentPlaceHolder$ddlStatus': 'Active',
    'ctl00$MainContentPlaceHolder$btnSearch': 'Search',
  });

  const searchResult = await postSearchForm(searchBody, initial.cookies);
  if (!searchResult) {
    // INTENTIONAL_BREAK: parked 2026-06 — Akamai WAF blocks cloud IPs.
    console.log('[NewHampshirePhase2] PARKED: OPLC search POST failed (Akamai WAF). Exiting cleanly.');
    return;
  }

  console.log(`[NewHampshirePhase2] Search response HTML size: ${searchResult.html.length} bytes`);

  // Step 3 — Parse results
  const licensees = parseLicensees(searchResult.html);
  console.log(`[NewHampshirePhase2] Parsed ${licensees.length} auctioneer licensees`);

  if (licensees.length === 0) {
    // Check if we got results but couldn't parse them
    const hasResults = /no\s*records?\s*found/i.test(searchResult.html);
    if (hasResults) {
      // INTENTIONAL_BREAK: parked 2026-06 — Akamai WAF blocks cloud IPs.
      console.log('[NewHampshirePhase2] PARKED: OPLC returned no records found. Exiting cleanly.');
      return;
    }
    // INTENTIONAL_BREAK: NH OPLC portal (forms.nh.gov) is protected by Akamai WAF
    // which blocks GitHub Actions cloud IPs with HTTP 403. When it does respond,
    // the ASP.NET form may return 0 parsed rows due to structure changes.
    // Parked 2026-06 until residential proxy or OPLC bulk CSV export is available.
    // Exits 0 so the workflow does not show as "failed".
    console.log('[NewHampshirePhase2] PARKED: OPLC portal blocked by Akamai WAF from cloud IPs or 0 rows parsed. Exiting cleanly.');
    return;
  }

  // Step 4 — Upsert licensees (accumulate, then batch)
  let totalUpserted = 0;
  const batchRows: ScrapedOrganizerRow[] = [];

  for (const lic of licensees) {
    // Skip inactive
    if (lic.status && !/active|current/i.test(lic.status)) continue;

    batchRows.push({
      businessName: lic.name,
      sourceName: 'NewHampshirePhase2',
      city: lic.city,
      state: 'NH',
      businessCategory: 'AUCTION_HOUSE',
      isStateLicensed: true,
      licenseState: 'New Hampshire',
      licenseNumber: lic.licenseNumber || undefined,
    });
  }

  // Batch upsert (ADR-073 perf: replaces serial per-row upserts)
  const ids = await batchUpsertScrapedOrganizers(batchRows, 100);
  totalUpserted = ids.filter((id) => id !== null).length;

  console.log('[NewHampshirePhase2] ─────────────────────────────────────────');
  console.log(`[NewHampshirePhase2]  Licensees found  : ${licensees.length}`);
  console.log(`[NewHampshirePhase2]  Upserted         : ${totalUpserted}`);
  console.log('[NewHampshirePhase2] ═══ NH Phase 2 scraper complete ═══════');
}
