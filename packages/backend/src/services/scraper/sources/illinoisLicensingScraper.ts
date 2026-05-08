/**
 * Illinois Department of Financial and Professional Regulation — Auctioneer License Scraper
 * Scrapes licensed auctioneers from IDFPR license verification system
 * Source: https://www.idfpr.com/LicenseLookup/LicenseLookup.asp
 * Public directory with auctioneer records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const IDFPR_BASE_URL = 'https://www.idfpr.com';
const LICENSE_LOOKUP_URL = 'https://www.idfpr.com/LicenseLookup/LicenseLookup.asp';

/**
 * Parse an address string like "Chicago, IL 60601" into city and zip components
 */
function parseAddress(address: string): { city: string; zip: string } {
  const parts = address.split(',').map((s) => s.trim());
  if (parts.length < 2) {
    return { city: address, zip: '' };
  }
  const cityPart = parts[0];
  const stateZip = parts[1];
  // Format: "IL 60601"
  const zipMatch = stateZip.match(/\d{5}/);
  const zip = zipMatch ? zipMatch[0] : '';
  return { city: cityPart, zip };
}

/**
 * Scrape Illinois auctioneer licenses from IDFPR verification system.
 * Public directory — no authentication required.
 * Ingests records into Organizer table with IllinoisLicensing source attribution.
 */
export async function runIllinoisLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(LICENSE_LOOKUP_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[IllinoisLicensing] Starting auctioneer license scraper');

    // First, fetch the initial search form to get any hidden fields (VIEWSTATE, etc.)
    await rateLimiter.waitBeforeRequest(domain);

    const formPageResponse = await fetch(LICENSE_LOOKUP_URL, {
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

    console.log('[IllinoisLicensing] Extracted form state if present');

    // Build form data for search: License Type = Auctioneer
    const formData = new URLSearchParams();
    if (viewState) {
      formData.append('__VIEWSTATE', viewState);
    }
    if (eventValidation) {
      formData.append('__EVENTVALIDATION', eventValidation);
    }
    // IDFPR form field names — adjust if actual form differs
    formData.append('ddlLicenseType', 'Auctioneer');
    formData.append('ddlLicenseStatus', 'Active');
    formData.append('btnSearch', 'Search');

    // Submit search
    await rateLimiter.waitBeforeRequest(domain);

    const searchResponse = await fetch(LICENSE_LOOKUP_URL, {
      method: 'POST',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
        Referer: LICENSE_LOOKUP_URL,
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

    console.log(`[IllinoisLicensing] Found ${rows.length} table rows on page 1`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Extract cells from row
      const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
      const cells = row.match(cellRegex) || [];

      if (cells.length < 5) {
        // Skip header or malformed rows
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
      const licenseType = extractText(cells[2]);
      const status = extractText(cells[3]);
      const addressFull = extractText(cells[4]);

      if (!name || !licenseNum) {
        continue; // Skip rows without name or license
      }

      totalRecords++;

      // Parse address
      const { city, zip } = parseAddress(addressFull);

      // Only ingest active licenses
      if (status !== 'Active' && !status.includes('Active')) {
        console.log(
          `[IllinoisLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`
        );
        continue;
      }

      console.log(`[IllinoisLicensing] Processing: ${name} (License ${licenseNum}) in ${city}, IL`);

      // Call getOrCreateScrapedOrganizer with AUCTION_HOUSE category
      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'IllinoisLicensing',
        city || 'Illinois',
        'IL',
        undefined, // esnOrgId
        undefined, // googlePlaceId
        undefined, // foursquareVenueId
        undefined, // hereBusinessId
        'AUCTION_HOUSE', // businessCategory
        undefined // contactEmail
      );

      // If organizer was created or found, update with Illinois-specific fields
      if (organizerId) {
        await prisma.organizer.update({
          where: { id: organizerId },
          data: {
            licenseNumber: licenseNum,
            licenseState: 'IL',
            isStateLicensed: true,
          },
        });

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[IllinoisLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[IllinoisLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[IllinoisLicensing] Scraper error:', error);
    throw error;
  }
}
