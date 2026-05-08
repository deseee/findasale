/**
 * California Department of Consumer Affairs — Auctioneer License Scraper
 * Scrapes licensed auctioneers from California public license verification system
 * Source: https://search.dca.ca.gov/#AUCT
 * Public directory with auctioneer license records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const CALIFORNIA_LICENSE_BASE_URL = 'https://search.dca.ca.gov';
const SEARCH_URL = 'https://search.dca.ca.gov/api/v1/License';

/**
 * Parse an address string into components
 */
function parseAddress(address: string): { city: string; zip: string } {
  const parts = address.split(',').map((s) => s.trim());
  if (parts.length < 2) {
    return { city: address, zip: '' };
  }
  const cityPart = parts[0];
  const stateZip = parts[1];
  // Format: "CA 12345" or similar
  const zipMatch = stateZip.match(/\d{5}/);
  const zip = zipMatch ? zipMatch[0] : '';
  return { city: cityPart, zip };
}

/**
 * Scrape California auctioneer licenses from the public license verification system.
 * Public directory — no authentication required.
 * Ingests records into Organizer table with CaliforniaLicensing source attribution.
 */
export async function runCaliforniaLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[CaliforniaLicensing] Starting auctioneer license scraper');

    // Fetch the initial search form to get any necessary state/hidden fields
    await rateLimiter.waitBeforeRequest(domain);

    const formPageResponse = await fetch(CALIFORNIA_LICENSE_BASE_URL + '/#AUCT', {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!formPageResponse.ok) {
      throw new Error(`Failed to fetch search form: ${formPageResponse.status}`);
    }

    const formHtml = await formPageResponse.text();

    // Extract ASP.NET ViewState and EventValidation from hidden fields if present
    const viewStateMatch = formHtml.match(/name="__VIEWSTATE"\s+value="([^"]+)"/);
    const eventValidationMatch = formHtml.match(/name="__EVENTVALIDATION"\s+value="([^"]+)"/);

    const viewState = viewStateMatch ? viewStateMatch[1] : '';
    const eventValidation = eventValidationMatch ? eventValidationMatch[1] : '';

    console.log('[CaliforniaLicensing] Extracted form state');

    // Build form data for search: License Type = Auctioneer
    const formData = new URLSearchParams();
    if (viewState) formData.append('__VIEWSTATE', viewState);
    if (eventValidation) formData.append('__EVENTVALIDATION', eventValidation);
    formData.append('ctl00$ContentPlaceHolder1$ddlLicenseType', 'Auctioneer');
    formData.append('ctl00$ContentPlaceHolder1$ddlLicenseStatus', 'Active');
    formData.append('ctl00$ContentPlaceHolder1$btnSearch', 'Search');

    // Submit search
    await rateLimiter.waitBeforeRequest(domain);

    const searchResponse = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
        Referer: CALIFORNIA_LICENSE_BASE_URL,
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(30000),
    });

    if (!searchResponse.ok) {
      throw new Error(`Search failed: ${searchResponse.status}`);
    }

    const html = await searchResponse.text();

    // Parse HTML table rows
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRegex) || [];

    console.log(`[CaliforniaLicensing] Found ${rows.length} table rows`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Extract cells from row
      const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
      const cells = row.match(cellRegex) || [];

      if (cells.length < 4) {
        continue;
      }

      // Extract text from cells, removing HTML tags
      const extractText = (html: string): string => {
        return html
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .trim();
      };

      const name = extractText(cells[0]);
      const licenseNum = extractText(cells[1]);
      const status = extractText(cells[2]);
      const addressFull = extractText(cells[3]);

      if (!name || !licenseNum) {
        continue;
      }

      totalRecords++;

      // Parse address
      const { city, zip } = parseAddress(addressFull);

      // Only ingest active licenses
      if (status !== 'Active') {
        console.log(
          `[CaliforniaLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`
        );
        continue;
      }

      console.log(`[CaliforniaLicensing] Processing: ${name} (License ${licenseNum}) in ${city}, CA`);

      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'CaliforniaLicensing',
        city || 'California',
        'CA',
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
            licenseState: 'CA',
            isStateLicensed: true,
          },
        });

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[CaliforniaLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[CaliforniaLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[CaliforniaLicensing] Scraper error:', error);
    throw error;
  }
}
