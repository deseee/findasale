/**
 * New Jersey Office of the Auctioneer — Auctioneer License Scraper
 * Scrapes licensed auctioneers from New Jersey license verification system
 * Source: https://newjersey.mylicense.com/verification/Search.aspx
 * Public directory with auctioneer records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const NEW_JERSEY_BASE_URL = 'https://newjersey.mylicense.com';
const SEARCH_URL = 'https://newjersey.mylicense.com/verification/Search.aspx';

/**
 * Parse an address string like "City, ST 12345" into city and zip components
 */
function parseAddress(address: string): { city: string; zip: string } {
  const parts = address.split(',').map((s) => s.trim());
  if (parts.length < 2) {
    return { city: address, zip: '' };
  }
  const cityPart = parts[0];
  const stateZip = parts[1];
  // Format: "ST 12345"
  const zipMatch = stateZip.match(/\d{5}/);
  const zip = zipMatch ? zipMatch[0] : '';
  return { city: cityPart, zip };
}

/**
 * Scrape New Jersey auctioneer licenses from license verification system.
 * Public directory — no authentication required.
 * Ingests records into Organizer table with NewJerseyLicensing source attribution.
 */
export async function runNewJerseyLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[NewJerseyLicensing] Starting auctioneer license scraper');

    // First, fetch the initial search form to get ASP.NET state and other hidden fields
    await rateLimiter.waitBeforeRequest(domain);

    const formPageResponse = await fetch(NEW_JERSEY_BASE_URL + '/verification/Search.aspx', {
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

    // Extract ASP.NET ViewState and EventValidation from hidden fields
    const viewStateMatch = formHtml.match(/name="__VIEWSTATE"\s+value="([^"]+)"/);
    const eventValidationMatch = formHtml.match(/name="__EVENTVALIDATION"\s+value="([^"]+)"/);

    const viewState = viewStateMatch ? viewStateMatch[1] : '';
    const eventValidation = eventValidationMatch ? eventValidationMatch[1] : '';

    console.log('[NewJerseyLicensing] Extracted ASP.NET form state');

    // Build form data for search: Profession = Auctioneer, State = New Jersey
    const formData = new URLSearchParams();
    formData.append('__VIEWSTATE', viewState);
    formData.append('__EVENTVALIDATION', eventValidation);
    formData.append('ctl00$ContentPlaceHolder1$ddlProfession', 'Auctioneer');
    formData.append('ctl00$ContentPlaceHolder1$ddlLicenseType', 'All');
    formData.append('ctl00$ContentPlaceHolder1$ddlAttributeType', 'All');
    formData.append('ctl00$ContentPlaceHolder1$ddlLicenseStatus', 'All');
    formData.append('ctl00$ContentPlaceHolder1$ddlState', 'New Jersey');
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
        Referer: NEW_JERSEY_BASE_URL + '/verification/Search.aspx',
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

    console.log(`[NewJerseyLicensing] Found ${rows.length} table rows on page 1`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
      const cells = row.match(cellRegex) || [];

      if (cells.length < 6) {
        continue;
      }

      const extractText = (html: string): string => {
        return html
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .trim();
      };

      const name = extractText(cells[0]);
      const licenseNum = extractText(cells[1]);
      const profession = extractText(cells[2]);
      const licenseType = extractText(cells[3]);
      const status = extractText(cells[4]);
      const addressFull = extractText(cells[5]);

      if (!name || !licenseNum) {
        continue;
      }

      totalRecords++;

      const { city, zip } = parseAddress(addressFull);

      if (status !== 'Active') {
        console.log(
          `[NewJerseyLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`
        );
        continue;
      }

      console.log(`[NewJerseyLicensing] Processing: ${name} (License ${licenseNum}) in ${city}, NJ`);

      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'NewJerseyLicensing',
        city || 'New Jersey',
        'NJ',
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
            licenseState: 'NJ',
            isStateLicensed: true,
          },
        });

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[NewJerseyLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[NewJerseyLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[NewJerseyLicensing] Scraper error:', error);
    throw error;
  }
}
