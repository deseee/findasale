/**
 * Rhode Island Secretary of State — Corporate Registry Scraper
 * Scrapes auction and consignment businesses from RI SOS corporate database
 * Source: https://business.sos.ri.gov/CorpWeb/CorpSearch/CorpSearch.aspx
 *
 * NOTE: Rhode Island repealed its general auctioneer license requirement (Chapter 5-58)
 * in 2015. No statewide auctioneer license registry exists. This scraper uses the RI SOS
 * corporate business search as an alternative source. Records are corporate registrations,
 * not licenses — isStateLicensed is set to false accordingly.
 *
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';

const RI_SOS_SEARCH_URL = 'https://business.sos.ri.gov/CorpWeb/CorpSearch/CorpSearch.aspx';
const RI_SOS_RESULTS_URL = 'https://business.sos.ri.gov/CorpWeb/CorpSearch/CorpSearchResults.aspx';

/** Strip HTML tags and decode basic entities */
function extractText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Parse the address cell into city, state, zip.
 * Address format: "STREET LINE\nCITY, STATE  ZIP  COUNTRY"
 */
function parseAddressCell(rawHtml: string): { city: string; state: string; zip: string } {
  const text = extractText(rawHtml);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { city: '', state: '', zip: '' };
  const locLine = lines[lines.length - 1]; // last line has city, state, zip
  const commaIdx = locLine.indexOf(',');
  if (commaIdx < 0) return { city: locLine, state: '', zip: '' };
  const city = locLine.slice(0, commaIdx).trim();
  const rest = locLine.slice(commaIdx + 1).trim(); // "RI  02886  USA"
  const tokens = rest.split(/\s+/);
  const state = tokens[0] ?? '';
  const zip = tokens[1] ?? '';
  return { city, state, zip };
}

interface FormTokens {
  viewState: string;
  viewStateGenerator: string;
  eventValidation: string;
  sessionCookie: string;
}

/** Fetch the search form and extract ASP.NET form tokens + session cookie */
async function fetchFormTokens(): Promise<FormTokens> {
  const domain = new URL(RI_SOS_SEARCH_URL).hostname;
  await defaultRateLimiter.waitBeforeRequest(domain);

  const resp = await fetch(RI_SOS_SEARCH_URL, {
    method: 'GET',
    headers: {
      'User-Agent': getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) throw new Error(`[RhodeIslandSOS] Form fetch failed: ${resp.status}`);

  const html = await resp.text();
  const viewState = html.match(/name="__VIEWSTATE"\s+id="__VIEWSTATE"\s+value="([^"]+)"/)?.[1] ?? '';
  const viewStateGenerator = html.match(/name="__VIEWSTATEGENERATOR"\s+id="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/)?.[1] ?? '';
  const eventValidation = html.match(/name="__EVENTVALIDATION"\s+id="__EVENTVALIDATION"\s+value="([^"]+)"/)?.[1] ?? '';
  const sessionCookie = resp.headers.get('set-cookie') ?? '';

  if (!viewState) throw new Error('[RhodeIslandSOS] Could not extract ViewState from form page');

  return { viewState, viewStateGenerator, eventValidation, sessionCookie };
}

/**
 * Trigger the AJAX search on RI SOS. The server stores results in session and
 * redirects to CorpSearchResults.aspx. Returns the session cookie for the results fetch.
 */
async function triggerSearch(tokens: FormTokens, searchTerm: string): Promise<string> {
  const domain = new URL(RI_SOS_SEARCH_URL).hostname;
  await defaultRateLimiter.waitBeforeRequest(domain);

  const body = new URLSearchParams({
    'ctl00$ScriptManager1': 'ctl00$MainContent$UpdatePanel1|ctl00$MainContent$btnSearch',
    '__EVENTTARGET': '',
    '__EVENTARGUMENT': '',
    '__LASTFOCUS': '',
    '__VIEWSTATE': tokens.viewState,
    '__VIEWSTATEGENERATOR': tokens.viewStateGenerator,
    '__VIEWSTATEENCRYPTED': '',
    '__EVENTVALIDATION': tokens.eventValidation,
    'ctl00$MainContent$hdnApplyMasterPageWitoutSidebar': '0',
    'ctl00$MainContent$hdn1': '0',
    'ctl00$MainContent$EntityStatus': 'rdbActive',
    'ctl00$MainContent$CorpSearch': 'rdoByPurpose',
    'ctl00$MainContent$txtPurpose': searchTerm,
    'ctl00$MainContent$ddRecordsPerPage': '100',
    'ctl00$MainContent$btnSearch': 'Search',
    'ctl00$MainContent$hdnW': '1920',
    'ctl00$MainContent$hdnH': '1080',
    '__ASYNCPOST': 'true',
  });

  const headers: Record<string, string> = {
    'User-Agent': getRandomUserAgent(),
    'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    'Accept': '*/*',
    'Referer': RI_SOS_SEARCH_URL,
    'X-MicrosoftAjax': 'Delta=true',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (tokens.sessionCookie) headers['Cookie'] = tokens.sessionCookie;

  const resp = await fetch(RI_SOS_SEARCH_URL, {
    method: 'POST',
    headers,
    body: body.toString(),
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) throw new Error(`[RhodeIslandSOS] Search POST failed: ${resp.status}`);

  const newCookie = resp.headers.get('set-cookie');
  return newCookie ?? tokens.sessionCookie;
}

/**
 * Fetch the results page and parse entity rows.
 * Returns array of { name, city, state, zip }.
 */
async function fetchResultsPage(sessionCookie: string): Promise<Array<{ name: string; city: string; state: string; zip: string }>> {
  const domain = new URL(RI_SOS_RESULTS_URL).hostname;
  await defaultRateLimiter.waitBeforeRequest(domain);

  const headers: Record<string, string> = {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': RI_SOS_SEARCH_URL,
  };
  if (sessionCookie) headers['Cookie'] = sessionCookie;

  const resp = await fetch(RI_SOS_RESULTS_URL, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) throw new Error(`[RhodeIslandSOS] Results fetch failed: ${resp.status}`);

  const html = await resp.text();
  const results: Array<{ name: string; city: string; state: string; zip: string }> = [];

  // Grid rows have class GridRow or GridAltRow
  const rowRegex = /<tr class="Grid(?:Row|AltRow)">([\s\S]*?)<\/tr>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1]);
    }

    if (cells.length < 5) continue;

    // Cell 0: entity name (inside <a> link)
    const nameLinkMatch = cells[0].match(/>([\s\S]*?)<\/a>/);
    const name = nameLinkMatch ? extractText(nameLinkMatch[1]) : extractText(cells[0]);
    if (!name) continue;

    // Cell 3: inactive status — non-empty means Revoked/Receivership; skip those
    const inactiveStatus = extractText(cells[3]);
    if (inactiveStatus) continue;

    // Cell 4: address
    const { city, state, zip } = parseAddressCell(cells[4]);

    results.push({ name, city, state, zip });
  }

  return results;
}

/**
 * Run one search term and ingest results into Organizer table.
 * Returns count of records processed.
 */
async function runSearch(
  searchTerm: string,
  seenNames: Set<string>,
  counters: { total: number; created: number }
): Promise<void> {
  console.log(`[RhodeIslandSOS] Searching for purpose: "${searchTerm}"`);

  const tokens = await fetchFormTokens();
  const sessionCookie = await triggerSearch(tokens, searchTerm);
  const entities = await fetchResultsPage(sessionCookie);

  console.log(`[RhodeIslandSOS] Found ${entities.length} active entities for "${searchTerm}"`);

  for (const entity of entities) {
    const key = entity.name.toLowerCase();
    if (seenNames.has(key)) continue; // deduplicate across search terms
    seenNames.add(key);

    counters.total++;

    console.log(`[RhodeIslandSOS] Processing: ${entity.name} in ${entity.city}, ${entity.state}`);

    await getOrCreateScrapedOrganizer(
      entity.name,
      'RhodeIslandSOS',
      entity.city || 'Rhode Island',
      entity.state || 'RI',
      undefined, // esnOrgId
      undefined, // googlePlaceId
      undefined, // foursquareVenueId
      undefined, // hereBusinessId
      'AUCTION_HOUSE',
      undefined, // contactEmail
      undefined, // phone
      undefined, // website
      undefined, // lat
      undefined, // lng
      false,     // isStateLicensed — corporate registration, not a license
      undefined, // licenseState
      undefined, // licenseNumber
    );

    counters.created++;
  }
}

/**
 * Scrape Rhode Island SOS corporate database for auction and consignment businesses.
 * Uses two search terms ("auction", "consignment") to maximize coverage.
 * Records are Active corporate registrations — not state licenses.
 * Function name kept as runRhodeIslandLicensingScraper for export compatibility.
 */
export async function runRhodeIslandLicensingScraper(): Promise<void> {
  const counters = { total: 0, created: 0 };
  const seenNames = new Set<string>();
  const searchTerms = ['auction', 'consignment'];

  console.log('[RhodeIslandSOS] Starting RI SOS corporate registry scraper');
  console.log('[RhodeIslandSOS] Note: RI repealed auctioneer licensing in 2015. Using corporate registry as data source.');

  try {
    for (const term of searchTerms) {
      await runSearch(term, seenNames, counters);
    }

    console.log(
      `[RhodeIslandSOS] Completed: ${counters.total} unique entities processed, ${counters.created} organizers created/updated`
    );
  } catch (error) {
    console.error('[RhodeIslandSOS] Scraper error:', error);
    throw error;
  }
}
