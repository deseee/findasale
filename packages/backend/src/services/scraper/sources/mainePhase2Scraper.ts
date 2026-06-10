/**
 * Maine PFR (Professional and Financial Regulation) — Auctioneer License Scraper (Phase 2)
 * Scrapes licensed auctioneers from Maine PFR ALMS (Automated Licensing and Monitoring System).
 * Primary: https://pfr.maine.gov/alms/search.aspx?board=4210 — Board of Licensing of Auctioneers
 * Fallback: https://pfr.maine.gov/olmt/ — Online Licensing Management Tool
 *
 * Maine auctioneers are licensed under 32 M.R.S. § 281 et seq., regulated by
 * the Board of Licensing of Auctioneers under the Office of Professional &
 * Financial Regulation (PFR). Board ID 4210 in ALMS.
 *
 * ADR-073: Directory Scraper Phase 2 — State auctioneer licensing data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';

const ALMS_SEARCH_URL = 'https://pfr.maine.gov/alms/search.aspx';
const ALMS_BOARD_ID = '4210'; // Board of Licensing of Auctioneers
const ALMS_DOMAIN = 'pfr.maine.gov';
const OLMT_URL = 'https://pfr.maine.gov/olmt/';
const ALMS_PORTAL_URL = 'https://pfr.maine.gov/ALMSPortal/';
const SOURCE_NAME = 'MainePhase2';
const SOURCE_LABEL = 'ME-PFR-Auctioneer';

// False-positive business name fragments — exclude rows matching these
const EXCLUDE_FRAGMENTS = [
  'real estate', 'realty', 'realtor', 'mortgage', 'bank', 'credit union',
  'financial', 'insurance', 'law office', 'attorney', 'lawyer',
  'dental', 'dentist', 'medical', 'clinic', 'pharmacy', 'hospital',
  'restaurant', 'hotel', 'motel',
];

/**
 * Return true if the business name contains a false-positive fragment.
 */
function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Extract text content from an HTML cell, stripping tags and decoding entities.
 */
function extractText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse ASPX hidden form fields needed for postback.
 * ASPX pages use __VIEWSTATE, __VIEWSTATEGENERATOR, __EVENTVALIDATION, etc.
 */
function parseAspxHiddenFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const hiddenInputRegex = /<input[^>]*type="hidden"[^>]*>/gi;
  const matches = html.match(hiddenInputRegex) || [];

  for (const input of matches) {
    const nameMatch = input.match(/name="([^"]+)"/);
    const valueMatch = input.match(/value="([^"]*)"/);
    if (nameMatch) {
      fields[nameMatch[1]] = valueMatch ? valueMatch[1] : '';
    }
  }

  return fields;
}

/**
 * Parse license records from ALMS HTML search results.
 * ALMS typically renders a GridView with columns for Name, License #, City, Status.
 */
function parseAlmsResults(html: string): Array<{
  businessName: string;
  licenseNumber: string;
  city: string;
  status: string;
}> {
  const results: Array<{
    businessName: string;
    licenseNumber: string;
    city: string;
    status: string;
  }> = [];

  // Find all tables — ALMS uses ASP.NET GridView which renders as <table>
  const tableMatches = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi) || [];

  for (const tableHtml of tableMatches) {
    const rows = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    if (rows.length < 2) continue;

    // Detect column positions from header row
    const headerCells = (rows[0].match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) || []).map(c => extractText(c).toLowerCase());

    let nameCol = -1;
    let licenseCol = -1;
    let cityCol = -1;
    let statusCol = -1;

    for (let ci = 0; ci < headerCells.length; ci++) {
      const h = headerCells[ci];
      if (h.includes('name') || h.includes('licensee') || h.includes('business') || h.includes('entity')) nameCol = ci;
      if (h.includes('license') && !h.includes('type')) licenseCol = ci;
      if (h.includes('city') || h.includes('town') || h.includes('location')) cityCol = ci;
      if (h.includes('status') || h.includes('active')) statusCol = ci;
    }

    // Positional defaults if headers not detected
    if (nameCol === -1) nameCol = 0;
    if (licenseCol === -1) licenseCol = 1;
    if (cityCol === -1 && headerCells.length > 2) cityCol = 2;
    if (statusCol === -1 && headerCells.length > 3) statusCol = 3;

    // Parse data rows
    for (let ri = 1; ri < rows.length; ri++) {
      const cells = (rows[ri].match(/<td[^>]*>[\s\S]*?<\/td>/gi) || []).map(c => extractText(c));
      if (cells.length < 2) continue;

      const businessName = cells[nameCol] || '';
      const licenseNumber = cells[licenseCol] || '';
      const city = cityCol >= 0 && cityCol < cells.length ? cells[cityCol] : '';
      const status = statusCol >= 0 && statusCol < cells.length ? cells[statusCol] : 'Active';

      if (businessName && businessName.length > 1) {
        results.push({ businessName, licenseNumber, city, status });
      }
    }
  }

  return results;
}

/**
 * Attempt to search ALMS via ASPX postback.
 * ALMS is an ASP.NET WebForms app — requires:
 * 1. GET the search page to obtain __VIEWSTATE etc.
 * 2. POST with form data including board selection and search criteria.
 */
async function fetchFromAlms(): Promise<Array<{
  businessName: string;
  licenseNumber: string;
  city: string;
}>> {
  const results: Array<{
    businessName: string;
    licenseNumber: string;
    city: string;
  }> = [];

  try {
    // Step 1: GET the search page to extract ASPX hidden fields
    await defaultRateLimiter.waitBeforeRequest(ALMS_DOMAIN);

    const searchPageUrl = `${ALMS_SEARCH_URL}?board=${ALMS_BOARD_ID}`;
    console.log(`[${SOURCE_NAME}] Fetching ALMS search page: ${searchPageUrl}`);

    const getResponse = await fetch(searchPageUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!getResponse.ok) {
      console.warn(`[${SOURCE_NAME}] ALMS search page returned ${getResponse.status}`);
      return results;
    }

    const searchPageHtml = await getResponse.text();
    const hiddenFields = parseAspxHiddenFields(searchPageHtml);

    // Check if results are already on the GET response (some ALMS boards show all licensees by default)
    const preloadResults = parseAlmsResults(searchPageHtml);
    if (preloadResults.length > 0) {
      console.log(`[${SOURCE_NAME}] Found ${preloadResults.length} records on initial page load`);
      for (const row of preloadResults) {
        if (row.status.toLowerCase().includes('active') || row.status === '') {
          if (!nameIsExcluded(row.businessName)) {
            results.push({
              businessName: row.businessName,
              licenseNumber: row.licenseNumber,
              city: row.city,
            });
          }
        }
      }
      if (results.length > 0) return results;
    }

    // Step 2: POST search — try submitting with search-all criteria
    if (!hiddenFields['__VIEWSTATE']) {
      console.warn(`[${SOURCE_NAME}] No __VIEWSTATE found — ALMS may be blocking or JS-rendered`);
      return results;
    }

    await defaultRateLimiter.waitBeforeRequest(ALMS_DOMAIN);

    // Extract cookie from GET response for session continuity
    const setCookieHeader = getResponse.headers.get('set-cookie') || '';
    const sessionCookie = setCookieHeader.split(';')[0] || '';

    // Build POST body — ASPX form data
    const formData = new URLSearchParams();
    formData.set('__VIEWSTATE', hiddenFields['__VIEWSTATE'] || '');
    formData.set('__VIEWSTATEGENERATOR', hiddenFields['__VIEWSTATEGENERATOR'] || '');
    formData.set('__EVENTVALIDATION', hiddenFields['__EVENTVALIDATION'] || '');

    // Common ALMS search button IDs — try various patterns
    // The search button usually triggers a postback like btnSearch or ctl00$...btnSearch
    const searchButtonMatch = searchPageHtml.match(/name="([^"]*(?:btnSearch|SearchButton|btnFind|btn_search)[^"]*)"/i);
    if (searchButtonMatch) {
      formData.set(searchButtonMatch[1], 'Search');
    }

    // Set board selection if available
    const boardSelectMatch = searchPageHtml.match(/name="([^"]*(?:ddlBoard|drpBoard|board)[^"]*)"/i);
    if (boardSelectMatch) {
      formData.set(boardSelectMatch[1], ALMS_BOARD_ID);
    }

    // Set license type to all/auctioneer if dropdown exists
    const licTypeMatch = searchPageHtml.match(/name="([^"]*(?:ddlLicenseType|drpLicType|lictype)[^"]*)"/i);
    if (licTypeMatch) {
      formData.set(licTypeMatch[1], '');
    }

    // Set status to Active if available
    const statusMatch = searchPageHtml.match(/name="([^"]*(?:ddlStatus|drpStatus|status)[^"]*)"/i);
    if (statusMatch) {
      formData.set(statusMatch[1], 'Active');
    }

    const postHeaders: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: searchPageUrl,
    };
    if (sessionCookie) {
      postHeaders['Cookie'] = sessionCookie;
    }

    const postResponse = await fetch(searchPageUrl, {
      method: 'POST',
      headers: postHeaders,
      body: formData.toString(),
      signal: AbortSignal.timeout(30000),
    });

    if (!postResponse.ok) {
      console.warn(`[${SOURCE_NAME}] ALMS POST search returned ${postResponse.status}`);
      return results;
    }

    const resultsHtml = await postResponse.text();
    const parsed = parseAlmsResults(resultsHtml);

    for (const row of parsed) {
      if (row.status.toLowerCase().includes('active') || row.status === '') {
        if (!nameIsExcluded(row.businessName)) {
          results.push({
            businessName: row.businessName,
            licenseNumber: row.licenseNumber,
            city: row.city,
          });
        }
      }
    }

    console.log(`[${SOURCE_NAME}] ALMS POST search: ${parsed.length} rows, ${results.length} matched`);
  } catch (err) {
    console.warn(`[${SOURCE_NAME}] ALMS fetch error:`, err);
  }

  return results;
}

/**
 * Fallback: try the ALMS Portal or OLMT endpoint.
 */
async function fetchFromOlmt(): Promise<Array<{
  businessName: string;
  licenseNumber: string;
  city: string;
}>> {
  const results: Array<{
    businessName: string;
    licenseNumber: string;
    city: string;
  }> = [];

  // Try ALMS Portal
  for (const url of [ALMS_PORTAL_URL, OLMT_URL]) {
    await defaultRateLimiter.waitBeforeRequest(ALMS_DOMAIN);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        console.warn(`[${SOURCE_NAME}] ${url} returned ${response.status}`);
        continue;
      }

      const html = await response.text();
      const parsed = parseAlmsResults(html);

      for (const row of parsed) {
        if (!nameIsExcluded(row.businessName)) {
          results.push({
            businessName: row.businessName,
            licenseNumber: row.licenseNumber,
            city: row.city,
          });
        }
      }

      if (results.length > 0) {
        console.log(`[${SOURCE_NAME}] ${url}: found ${results.length} records`);
        return results;
      }
    } catch (err) {
      console.warn(`[${SOURCE_NAME}] Fetch error for ${url}:`, err);
    }
  }

  return results;
}

/**
 * Deduplicate records by license number or business name.
 */
function deduplicateRecords(
  records: Array<{ businessName: string; licenseNumber: string; city: string }>
): Array<{ businessName: string; licenseNumber: string; city: string }> {
  const seen = new Set<string>();
  return records.filter((r) => {
    const key = r.licenseNumber
      ? `LIC:${r.licenseNumber}`
      : `NAME:${r.businessName.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Maine PFR auctioneer license scraper.
 * Queries ALMS (Automated Licensing and Monitoring System) board 4210
 * for active auctioneer licenses.
 * Falls back to ALMS Portal and OLMT endpoints.
 * Throws if zero results (prevents silent failure).
 */
export async function runMainePhase2Scraper(): Promise<void> {
  // INTENTIONAL_BREAK: Maine PFR ALMS requires AJAX-driven cascading dropdowns
  // that cannot be replicated without a headless browser from cloud runners.
  // Parked 2026-06 until Puppeteer support or FOAA bulk export available.
  console.log(`[${SOURCE_NAME}] PARKED: ALMS AJAX cascade unreachable from cloud IPs. Exiting cleanly.`);
  return;

  // --- ORIGINAL CODE BELOW (unreachable, preserved for reference) ---
  console.log(`[${SOURCE_NAME}] Starting auctioneer license scraper — Maine PFR`);
  console.log(`[${SOURCE_NAME}] Primary source: ${ALMS_SEARCH_URL}?board=${ALMS_BOARD_ID}`);
  console.log(`[${SOURCE_NAME}] Fallback sources: ${ALMS_PORTAL_URL}, ${OLMT_URL}`);

  let totalUpserted = 0;

  try {
    // Step 1: Try ALMS search with board=4210
    let records = await fetchFromAlms();
    console.log(`[${SOURCE_NAME}] ALMS returned ${records.length} records`);

    // Step 2: Fallback to OLMT/Portal if ALMS returned nothing
    if (records.length === 0) {
      console.log(`[${SOURCE_NAME}] ALMS returned 0 — trying OLMT/Portal fallback`);
      records = await fetchFromOlmt();
      console.log(`[${SOURCE_NAME}] OLMT/Portal returned ${records.length} records`);
    }

    // Deduplicate
    const unique = deduplicateRecords(records);
    console.log(`[${SOURCE_NAME}] ${unique.length} unique records after dedup`);

    // Step 3: Upsert via getOrCreateScrapedOrganizer
    for (const record of unique) {
      try {
        const orgId = await getOrCreateScrapedOrganizer(
          record.businessName,       // businessName
          SOURCE_NAME,               // sourceName
          record.city || 'Maine',    // city
          'ME',                      // state
          undefined,                 // esnOrgId
          undefined,                 // googlePlaceId
          undefined,                 // foursquareVenueId
          undefined,                 // hereBusinessId
          'AUCTION_HOUSE',           // businessCategory — all are auctioneers
          undefined,                 // contactEmail
          undefined,                 // phone
          undefined,                 // website
          undefined,                 // lat
          undefined,                 // lng
          true,                      // isStateLicensed
          'Maine',                   // licenseState
          record.licenseNumber || undefined, // licenseNumber
          SOURCE_LABEL               // sourceLabel
        );
        if (orgId) totalUpserted++;
      } catch (upsertErr) {
        console.error(`[${SOURCE_NAME}] Upsert error for "${record.businessName}":`, upsertErr);
      }
    }

    console.log(
      `[${SOURCE_NAME}] Done — fetched: ${records.length}, unique: ${unique.length}, upserted: ${totalUpserted}`
    );

    if (unique.length === 0) {
      throw new Error(
        `[${SOURCE_NAME}] Zero results from all sources (ALMS + OLMT/Portal). ` +
        `ALMS may require browser session or ASPX viewstate is blocking automated requests. ` +
        `Board 4210 (Auctioneers) may need FOAA request for bulk data. ` +
        `Verify endpoints manually: ${ALMS_SEARCH_URL}?board=${ALMS_BOARD_ID}`
      );
    }
  } catch (error) {
    console.error(`[${SOURCE_NAME}] Scraper error:`, error);
    throw error;
  }
}
