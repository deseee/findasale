/**
 * Indiana Professional Licensing Agency — Auctioneer License Scraper
 * Scrapes licensed auctioneers from Indiana PLA license verification system
 * Source: https://mylicense.in.gov/EVerification/Search.aspx
 * Public directory with ~40+ pages of auctioneer records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const INDIANA_PLA_BASE_URL = 'https://mylicense.in.gov';
const SEARCH_URL = 'https://mylicense.in.gov/EVerification/SearchResults.aspx';

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
 * Scrape Indiana auctioneer licenses from PLA verification system.
 * Public directory — no authentication required.
 * Ingests records into Organizer table with IndianaLicensing source attribution.
 */
export async function runIndianaLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[IndianaLicensing] Starting auctioneer license scraper');

    // First, fetch the initial search form to get ASP.NET state and other hidden fields
    await rateLimiter.waitBeforeRequest(domain);

    const formPageResponse = await fetch(INDIANA_PLA_BASE_URL + '/EVerification/Search.aspx', {
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

    // Capture ASP.NET session cookie — required on POST for ViewState validation
    const setCookieHeader = formPageResponse.headers.get('set-cookie') ?? '';
    const sessionCookieMatch = setCookieHeader.match(/ASP\.NET_SessionId=([^;]+)/);
    const sessionCookie = sessionCookieMatch ? `ASP.NET_SessionId=${sessionCookieMatch[1]}` : '';
    if (!sessionCookie) {
      console.warn('[IndianaLicensing] No ASP.NET_SessionId found — POST may fail ViewState validation');
    }

    const formHtml = await formPageResponse.text();

    // Extract ASP.NET ViewState and EventValidation from hidden fields
    // These are typically required for ASP.NET form submission
    const viewStateMatch = formHtml.match(/name="__VIEWSTATE"\s+value="([^"]+)"/);
    const eventValidationMatch = formHtml.match(/name="__EVENTVALIDATION"\s+value="([^"]+)"/);
    const viewStateGeneratorMatch = formHtml.match(/name="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/);

    const viewState = viewStateMatch ? viewStateMatch[1] : '';
    const eventValidation = eventValidationMatch ? eventValidationMatch[1] : '';
    const viewStateGenerator = viewStateGeneratorMatch ? viewStateGeneratorMatch[1] : '';

    console.log('[IndianaLicensing] Extracted ASP.NET form state');

    // Build form data for search: Profession = Auctioneer Commission, State = Indiana
    const formData = new URLSearchParams();
    formData.append('__VIEWSTATE', viewState);
    formData.append('__EVENTVALIDATION', eventValidation);
    formData.append('__VIEWSTATEGENERATOR', viewStateGenerator);
    formData.append('Recaptcha1', '');
    formData.append('ctl00$ContentPlaceHolder1$ddlProfession', 'Auctioneer Commission');
    formData.append('ctl00$ContentPlaceHolder1$ddlLicenseType', 'All');
    formData.append('ctl00$ContentPlaceHolder1$ddlAttributeType', 'All');
    formData.append('ctl00$ContentPlaceHolder1$ddlLicenseStatus', 'All');
    formData.append('ctl00$ContentPlaceHolder1$ddlState', 'Indiana');
    formData.append('ctl00$ContentPlaceHolder1$btnSearch', 'Search');

    // Submit search — this will return paginated results
    await rateLimiter.waitBeforeRequest(domain);

    const searchResponse = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
        Referer: INDIANA_PLA_BASE_URL + '/EVerification/Search.aspx',
        ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(30000),
    });

    if (!searchResponse.ok) {
      throw new Error(`Search failed: ${searchResponse.status}`);
    }

    const html = await searchResponse.text();

    // Parse HTML table rows — look for table rows in the results grid
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRegex) || [];

    console.log(`[IndianaLicensing] Found ${rows.length} table rows on page 1`);

    // Skip header row if present, parse data rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Extract cells from row
      const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
      const cells = row.match(cellRegex) || [];

      if (cells.length < 6) {
        // Skip header or malformed rows
        continue;
      }

      // Extract text from cells, removing HTML tags
      const extractText = (html: string | undefined): string => {
        return (html ?? '')
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
        continue; // Skip rows without name or license
      }

      totalRecords++;

      // Parse address
      const { city, zip } = parseAddress(addressFull);

      // Only ingest active licenses
      if (status !== 'Active') {
        console.log(
          `[IndianaLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`
        );
        continue;
      }

      console.log(`[IndianaLicensing] Processing: ${name} (License ${licenseNum}) in ${city}, IN`);

      // Call getOrCreateScrapedOrganizer with AUCTION_HOUSE category
      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'IndianaLicensing',
        city || 'Indiana',
        'IN',
        undefined, // esnOrgId
        undefined, // googlePlaceId
        undefined, // foursquareVenueId
        undefined, // hereBusinessId
        'AUCTION_HOUSE', // businessCategory
        undefined, // contactEmail
        undefined, // phone
        undefined, // website
        undefined, // lat
        undefined, // lng
        true,       // isStateLicensed
        'IN',  // licenseState
        licenseNum, // licenseNumber
      );

      if (organizerId) {

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[IndianaLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[IndianaLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[IndianaLicensing] Scraper error:', error);
    throw error;
  }
}
