/**
 * New Mexico Regulation and Licensing Department — Auctioneer License Scraper
 * Scrapes licensed auctioneers from New Mexico RLD verification system
 * Source: https://www.rld.state.nm.us/boards/Auctioneers_Verify.aspx
 * Public directory with auctioneer records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const NEW_MEXICO_BASE_URL = 'https://www.rld.state.nm.us';
const SEARCH_URL = 'https://www.rld.state.nm.us/boards/Auctioneers_Verify.aspx';

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
 * Scrape New Mexico auctioneer licenses from RLD verification system.
 * Public directory — no authentication required.
 * Ingests records into Organizer table with NewMexicoLicensing source attribution.
 */
export async function runNewMexicoLicensingScraper(): Promise<void> {
  // Phase 1 portal URL is dead (404 since ~2026-05). Phase 2 scraper uses alternative data source.
  console.log('[NewMexicoLicensing] Scraper disabled — Phase 1 portal URL (rld.state.nm.us) no longer responds. Phase 2 handles this state.');
  return;

  const rateLimiter = defaultRateLimiter;
  const domain = new URL(SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[NewMexicoLicensing] Starting auctioneer license scraper');

    // First, fetch the initial search form to get ASP.NET state and other hidden fields
    await rateLimiter.waitBeforeRequest(domain);

    const formPageResponse = await fetch(SEARCH_URL, {
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

    console.log('[NewMexicoLicensing] Extracted ASP.NET form state');

    // Build form data for search
    const formData = new URLSearchParams();
    formData.append('__VIEWSTATE', viewState);
    formData.append('__EVENTVALIDATION', eventValidation);
    formData.append('ctl00$ContentPlaceHolder1$ddlLicenseType', 'All');
    formData.append('ctl00$ContentPlaceHolder1$ddlLicenseStatus', 'All');
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
        Referer: SEARCH_URL,
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

    console.log(`[NewMexicoLicensing] Found ${rows.length} table rows on page 1`);

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
          `[NewMexicoLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`
        );
        continue;
      }

      console.log(`[NewMexicoLicensing] Processing: ${name} (License ${licenseNum}) in ${city}, NM`);

      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'NewMexicoLicensing',
        city || 'New Mexico',
        'NM',
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
            licenseState: 'NM',
            isStateLicensed: true,
          },
        });

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[NewMexicoLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[NewMexicoLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[NewMexicoLicensing] Scraper error:', error);
    throw error;
  }
}
