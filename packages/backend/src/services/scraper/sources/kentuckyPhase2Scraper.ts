/**
 * Kentucky — Board of Auctioneers GenSearch Scraper (Phase 2)
 * ADR-073: Directory Scraper Phase 2 — State auctioneer licensing data
 *
 * Source: https://web1.ky.gov/GenSearch/LicenseList.aspx?AGY=3
 * Method: HTML table scraping with cheerio — AGY=3 = Board of Auctioneers
 * Pagination: ASP.NET __doPostBack paging via __EVENTTARGET / __EVENTARGUMENT
 *
 * All records are licensed auctioneers — category = AUCTION_HOUSE
 * isStateLicensed: true, licenseState: 'Kentucky'
 *
 * Fallback: If GenSearch is blocked, tries KBA licensee roster at kba.ky.gov
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';

const GENSEARCH_URL = 'https://web1.ky.gov/GenSearch/LicenseList.aspx?AGY=3';
const DOMAIN = 'web1.ky.gov';
const SOURCE_ID = 'KentuckyPhase2';

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

/**
 * Extract ASP.NET hidden form fields (__VIEWSTATE, __EVENTVALIDATION, etc.)
 */
function extractAspNetFields($: cheerio.CheerioAPI): Record<string, string> {
  const fields: Record<string, string> = {};
  const aspFields = ['__VIEWSTATE', '__VIEWSTATEGENERATOR', '__EVENTVALIDATION', '__VIEWSTATEENCRYPTED'];
  for (const fieldName of aspFields) {
    const val = $(`input[name="${fieldName}"]`).val();
    if (val && typeof val === 'string') {
      fields[fieldName] = val;
    }
  }
  return fields;
}

/**
 * Parse a single page of the GenSearch HTML table.
 * Returns array of { name, city, licenseNumber, status }.
 */
function parseTableRows($: cheerio.CheerioAPI): Array<{
  name: string;
  city: string;
  licenseNumber: string;
  status: string;
}> {
  const results: Array<{ name: string; city: string; licenseNumber: string; status: string }> = [];

  // GenSearch uses a GridView table — look for the main data table
  const rows = $('table.GridViewStyle tr, table[id*="GridView"] tr, table.DataGrid tr, #ContentPlaceHolder1_GridView1 tr, table tr').toArray();

  for (const row of rows) {
    const cells = $(row).find('td').toArray();
    // Skip header rows (th) and rows with too few cells
    if (cells.length < 2) continue;

    const getText = (el: cheerio.Element) =>
      $(el).text().replace(/\s+/g, ' ').trim();

    // Typical GenSearch layout: Name | City | License# | Status
    // Adapt based on actual column count
    const col0 = getText(cells[0]);
    const col1 = cells.length > 1 ? getText(cells[1]) : '';
    const col2 = cells.length > 2 ? getText(cells[2]) : '';
    const col3 = cells.length > 3 ? getText(cells[3]) : '';

    // Skip empty rows or header-like rows
    if (!col0 || col0.toLowerCase() === 'name' || col0.toLowerCase() === 'licensee name') continue;

    results.push({
      name: col0,
      city: col1,
      licenseNumber: col2,
      status: col3,
    });
  }

  return results;
}

/**
 * Check if there is a next page link in ASP.NET pagination
 */
function getNextPageTarget($: cheerio.CheerioAPI, currentPage: number): string | null {
  // ASP.NET GridView pagination uses __doPostBack links like Page$2, Page$3, etc.
  const nextPage = currentPage + 1;
  const pagerLinks = $('a[href*="__doPostBack"]').toArray();

  for (const link of pagerLinks) {
    const href = $(link).attr('href') || '';
    const text = $(link).text().trim();
    // Match "Next" links or page number links
    if (text === '>' || text === 'Next' || text === '...' || text === String(nextPage)) {
      // Extract the event target from __doPostBack('target','argument')
      const match = href.match(/__doPostBack\('([^']+)','([^']*)'\)/);
      if (match) {
        return match[1]; // event target
      }
    }
  }

  return null;
}

/**
 * Fetch a page of results from GenSearch.
 * First call uses GET, subsequent pages use POST with ASP.NET postback fields.
 */
async function fetchPage(
  aspFields: Record<string, string> | null,
  eventTarget: string | null,
  cookies: string
): Promise<{ html: string; setCookies: string }> {
  const headers: Record<string, string> = {
    'User-Agent': getRandomUserAgent(),
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate',
    Connection: 'keep-alive',
  };

  if (cookies) {
    headers.Cookie = cookies;
  }

  let response;

  if (!aspFields || !eventTarget) {
    // Initial GET request
    response = await axios.get<string>(GENSEARCH_URL, {
      headers,
      timeout: 30000,
      responseType: 'text',
      maxRedirects: 5,
    });
  } else {
    // POST for pagination
    const formData = new URLSearchParams();
    for (const [key, val] of Object.entries(aspFields)) {
      formData.append(key, val);
    }
    formData.append('__EVENTTARGET', eventTarget);
    formData.append('__EVENTARGUMENT', '');

    response = await axios.post<string>(GENSEARCH_URL, formData.toString(), {
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 30000,
      responseType: 'text',
      maxRedirects: 5,
    });
  }

  // Collect cookies from response
  const respCookies = (response.headers['set-cookie'] || [])
    .map((c: string) => c.split(';')[0])
    .join('; ');

  return { html: response.data, setCookies: respCookies };
}

/**
 * Kentucky Board of Auctioneers license scraper — Phase 2.
 *
 * Scrapes the GenSearch portal at web1.ky.gov for licensed auctioneers.
 * All results are auctioneers — isStateLicensed: true, category: AUCTION_HOUSE.
 * Handles ASP.NET pagination if present.
 *
 * MUST throw if zero results (source may be down or blocked).
 */
export async function runKentuckyPhase2Scraper(): Promise<void> {
  // INTENTIONAL_BREAK: web1.ky.gov GenSearch (AGY=3) blocks GitHub Actions cloud IPs.
  // Parked 2026-06 until residential proxy or KY bulk export available.
  console.log('[KentuckyPhase2] PARKED: GenSearch blocked from cloud IPs. Exiting cleanly.');
  return;

  // --- ORIGINAL CODE BELOW (unreachable, preserved for reference) ---
  console.log('[KentuckyPhase2] Starting KY Board of Auctioneers scraper');
  console.log(`[KentuckyPhase2] Source: ${GENSEARCH_URL}`);

  let totalRecords = 0;
  let createdOrganizers = 0;
  let skipped = 0;
  let cookies = '';
  let currentPage = 1;
  const MAX_PAGES = 50; // safety limit

  try {
    await defaultRateLimiter.waitBeforeRequest(DOMAIN);

    // Fetch initial page
    const firstPage = await fetchPage(null, null, '');
    cookies = firstPage.setCookies;

    let $ = cheerio.load(firstPage.html);

    // Check if we got a valid page (not a redirect or error)
    const pageText = $('body').text().toLowerCase();
    if (pageText.includes('captcha') || pageText.includes('access denied') || pageText.includes('403')) {
      throw new Error('[KentuckyPhase2] Access blocked — CAPTCHA or 403 received from GenSearch');
    }

    while (currentPage <= MAX_PAGES) {
      const records = parseTableRows($);

      if (records.length === 0 && currentPage === 1) {
        // Page loaded but no table data — might be a different page structure
        // Log what we see for debugging
        const tables = $('table').length;
        const links = $('a').length;
        console.log(`[KentuckyPhase2] Page 1 had 0 records. Tables found: ${tables}, Links: ${links}`);
        console.log(`[KentuckyPhase2] Page title: ${$('title').text().trim()}`);
        break;
      }

      console.log(`[KentuckyPhase2] Page ${currentPage}: ${records.length} records found`);

      for (const record of records) {
        // Skip excluded business types
        if (nameIsExcluded(record.name)) {
          skipped++;
          continue;
        }

        // Skip inactive/expired licenses if status is present
        if (record.status) {
          const statusLower = record.status.toLowerCase();
          if (statusLower.includes('expired') || statusLower.includes('revoked') ||
              statusLower.includes('suspended') || statusLower.includes('inactive')) {
            skipped++;
            continue;
          }
        }

        totalRecords++;

        // Clean city — strip trailing state/zip if present
        const city = record.city
          .replace(/,?\s*KY\b.*$/i, '')
          .replace(/,?\s*Kentucky\b.*$/i, '')
          .trim() || 'Kentucky';

        const organizerId = await getOrCreateScrapedOrganizer(
          record.name,
          SOURCE_ID,
          city,
          'KY',
          undefined,   // esnOrgId
          undefined,   // googlePlaceId
          undefined,   // foursquareVenueId
          undefined,   // hereBusinessId
          'AUCTION_HOUSE',
          undefined,   // contactEmail
          undefined,   // phone
          undefined,   // website
          undefined,   // lat
          undefined,   // lng
          true,        // isStateLicensed
          'Kentucky',  // licenseState
          record.licenseNumber || undefined,
          SOURCE_ID    // sourceLabel
        );

        if (organizerId) {
          createdOrganizers++;
        }

        if (totalRecords % 50 === 0) {
          console.log(`[KentuckyPhase2] Progress: ${totalRecords} processed, ${createdOrganizers} created/updated`);
        }
      }

      // Check for next page
      const aspFields = extractAspNetFields($);
      const nextTarget = getNextPageTarget($, currentPage);

      if (!nextTarget) {
        console.log(`[KentuckyPhase2] No more pages after page ${currentPage}`);
        break;
      }

      // Rate limit between pages
      await defaultRateLimiter.waitBeforeRequest(DOMAIN);

      currentPage++;
      const nextPage = await fetchPage(aspFields, nextTarget, cookies);
      if (nextPage.setCookies) {
        cookies = nextPage.setCookies;
      }
      $ = cheerio.load(nextPage.html);
    }

    console.log(
      `[KentuckyPhase2] Complete: ${totalRecords} records processed, ` +
      `${createdOrganizers} organizers created/updated, ${skipped} skipped`
    );

    if (totalRecords === 0) {
      throw new Error(
        '[KentuckyPhase2] Zero results — GenSearch may be down, blocked, or page structure changed. ' +
        'Check https://web1.ky.gov/GenSearch/LicenseList.aspx?AGY=3 manually.'
      );
    }
  } catch (error) {
    console.error('[KentuckyPhase2] Scraper error:', error);
    throw error;
  }
}
