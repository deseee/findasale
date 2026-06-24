/**
 * South Carolina Department of Labor, Licensing and Regulation — Auctioneer License Scraper
 * Scrapes licensed auctioneers from South Carolina LLR auctioneer license search
 * Source: https://verify.llronline.com/LicLookup/Auctioneer/Auctioneer.aspx?div=29
 * Public directory with auctioneer records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 *
 * Fix (S-Cat3): Added proper cookie handling — the site sets AspxAutoDetectCookieSupport
 * cookie on first request and redirects. Without following the redirect with the
 * cookie, the POST gets no results. Also fixed form field names from live inspection:
 * ddl_type=296 (Auctioneer), btn_find is the submit button.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const SEARCH_URL = 'https://verify.llronline.com/LicLookup/Auctioneer/Auctioneer.aspx?div=29';
const AUCTIONEER_LICENSE_TYPE_VALUE = '296';

/**
 * Parse an address string into city and state components
 */
function parseAddress(address: string): { city: string } {
  const parts = address.split(',').map((s) => s.trim());
  const city = parts[0] || 'South Carolina';
  return { city };
}

/**
 * Extract a hidden field value from HTML
 */
function extractHiddenField(html: string, name: string): string {
  const regex = new RegExp(`name="${name}"[^>]*value="([^"]*)"`, 'i');
  const match = html.match(regex);
  return match ? match[1] : '';
}

/**
 * Scrape South Carolina auctioneer licenses from LLR search.
 * Handles the AspxAutoDetectCookieSupport redirect + ASP.NET ViewState form flow.
 */
export async function runSouthCarolinaLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[SouthCarolinaLicensing] Starting auctioneer license scraper');

    // Step 1: Initial GET to pick up the AspxAutoDetectCookieSupport cookie
    await rateLimiter.waitBeforeRequest(domain);

    const cookieJar: Record<string, string> = {};

    const initResponse = await fetch(SEARCH_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Connection: 'keep-alive',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    });

    // Collect cookies from the initial response
    const setCookieHeader = initResponse.headers.get('set-cookie');
    if (setCookieHeader) {
      const cookieParts = setCookieHeader.split(';')[0].split('=');
      if (cookieParts.length >= 2) {
        cookieJar[cookieParts[0].trim()] = cookieParts.slice(1).join('=').trim();
      }
    }

    // Build cookie string
    const cookieString = Object.entries(cookieJar)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

    // Step 2: Follow redirect to get the actual form page with ViewState
    await rateLimiter.waitBeforeRequest(domain);

    const formResponse = await fetch(SEARCH_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Cookie: cookieString || 'AspxAutoDetectCookieSupport=1',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!formResponse.ok) {
      console.warn(
        `[SouthCarolinaLicensing] Form page returned ${formResponse.status} — returning 0 records`
      );
      return;
    }

    const formHtml = await formResponse.text();

    // Check for transient "database refresh" message
    if (formHtml.includes('Database is currently being refreshed')) {
      console.warn(
        '[SouthCarolinaLicensing] WARNING: Site reports database refresh in progress. ' +
          'Returning 0 records — retry later.'
      );
      return;
    }

    const viewState = extractHiddenField(formHtml, '__VIEWSTATE');
    const viewStateGenerator = extractHiddenField(formHtml, '__VIEWSTATEGENERATOR');
    const eventValidation = extractHiddenField(formHtml, '__EVENTVALIDATION');

    if (!viewState) {
      console.warn(
        '[SouthCarolinaLicensing] WARNING: Could not extract ViewState from form page. ' +
          'Returning 0 records.'
      );
      return;
    }

    console.log('[SouthCarolinaLicensing] Extracted form state, submitting search');

    // Step 3: POST search with license type = Auctioneer (value 296)
    const formData = new URLSearchParams();
    formData.append('__VIEWSTATE', viewState);
    if (viewStateGenerator) formData.append('__VIEWSTATEGENERATOR', viewStateGenerator);
    if (eventValidation) formData.append('__EVENTVALIDATION', eventValidation);
    formData.append('ctl00$ContentPlaceHolder1$UserInputGen1$ddl_type', AUCTIONEER_LICENSE_TYPE_VALUE);
    formData.append('ctl00$ContentPlaceHolder1$UserInputGen1$btn_find', 'Search');

    await rateLimiter.waitBeforeRequest(domain);

    const searchResponse = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Cookie: cookieString || 'AspxAutoDetectCookieSupport=1',
        Referer: SEARCH_URL,
        Connection: 'keep-alive',
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(30000),
    });

    if (!searchResponse.ok) {
      console.warn(
        `[SouthCarolinaLicensing] Search POST returned ${searchResponse.status} — returning 0 records`
      );
      return;
    }

    const html = await searchResponse.text();

    // Parse HTML table rows
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRegex) || [];

    console.log(`[SouthCarolinaLicensing] Found ${rows.length} table rows`);

    const extractText = (cellHtml: string | undefined): string =>
      (cellHtml ?? '')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .trim();

    for (const row of rows) {
      const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
      const cells = row.match(cellRegex) || [];

      if (cells.length < 3) continue;

      const name = extractText(cells[0]);
      const licenseNum = extractText(cells[1]);
      const addressFull = extractText(cells[2]);
      const status = cells.length > 3 ? extractText(cells[3]) : 'Active';

      if (!name || !licenseNum) continue;

      totalRecords++;

      const { city } = parseAddress(addressFull);

      if (status !== 'Active') {
        console.log(
          `[SouthCarolinaLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`
        );
        continue;
      }

      console.log(
        `[SouthCarolinaLicensing] Processing: ${name} (License ${licenseNum}) in ${city}, SC`
      );

      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'SouthCarolinaLicensing',
        city || 'South Carolina',
        'SC',
        undefined,
        undefined,
        undefined,
        undefined,
        'AUCTION_HOUSE',
        undefined
      );

      if (organizerId) {
        await prisma.organizer.update({
          where: { id: organizerId },
          data: {
            licenseNumber: licenseNum,
            licenseState: 'SC',
            isStateLicensed: true,
          },
        });

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[SouthCarolinaLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[SouthCarolinaLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[SouthCarolinaLicensing] Scraper error:', error);
    throw error;
  }
}
