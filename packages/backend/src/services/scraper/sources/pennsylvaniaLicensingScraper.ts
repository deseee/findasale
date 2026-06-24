/**
 * Pennsylvania Department of State — Auctioneer License Scraper
 * Scrapes licensed auctioneers from Pennsylvania DOS Auctioneers Board license search
 * Source: https://www.dos.pa.gov/ProfessionalLicensing/BoardsCommissions/AuctioneersBoard/Pages/Search.aspx
 * Public directory with auctioneer records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const PENNSYLVANIA_DOS_BASE_URL = 'https://www.dos.pa.gov';
const SEARCH_URL = 'https://www.dos.pa.gov/ProfessionalLicensing/BoardsCommissions/AuctioneersBoard/Pages/Search.aspx';

/**
 * Parse an address string into city and state components
 */
function parseAddress(address: string): { city: string } {
  const parts = address.split(',').map((s) => s.trim());
  const city = parts[0] || 'Pennsylvania';
  return { city };
}

/**
 * Scrape Pennsylvania auctioneer licenses from DOS Auctioneers Board search.
 * Public directory — no authentication required.
 * Ingests records into Organizer table with PennsylvaniaLicensing source attribution.
 */
export async function runPennsylvaniaLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[PennsylvaniaLicensing] Starting auctioneer license scraper');

    // Fetch the search page
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

    // Extract ASP.NET ViewState if present
    const viewStateMatch = formHtml.match(/name="__VIEWSTATE"\s+value="([^"]+)"/);
    const eventValidationMatch = formHtml.match(/name="__EVENTVALIDATION"\s+value="([^"]+)"/);

    const viewState = viewStateMatch ? viewStateMatch[1] : '';
    const eventValidation = eventValidationMatch ? eventValidationMatch[1] : '';

    console.log('[PennsylvaniaLicensing] Extracted form state');

    // Build form data for search
    const formData = new URLSearchParams();
    if (viewState) formData.append('__VIEWSTATE', viewState);
    if (eventValidation) formData.append('__EVENTVALIDATION', eventValidation);
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

    console.log(`[PennsylvaniaLicensing] Found ${rows.length} table rows`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
      const cells = row.match(cellRegex) || [];

      if (cells.length < 3) {
        continue;
      }

      const extractText = (html: string | undefined): string => {
        return (html ?? '')
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .trim();
      };

      const name = extractText(cells[0]);
      const licenseNum = extractText(cells[1]);
      const addressFull = extractText(cells[2] || '');
      const status = extractText(cells[3] || 'Active');

      if (!name || !licenseNum) {
        continue;
      }

      totalRecords++;

      const { city } = parseAddress(addressFull);

      if (status !== 'Active') {
        console.log(
          `[PennsylvaniaLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`
        );
        continue;
      }

      console.log(`[PennsylvaniaLicensing] Processing: ${name} (License ${licenseNum}) in ${city}, PA`);

      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'PennsylvaniaLicensing',
        city || 'Pennsylvania',
        'PA',
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
            licenseState: 'PA',
            isStateLicensed: true,
          },
        });

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[PennsylvaniaLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[PennsylvaniaLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[PennsylvaniaLicensing] Scraper error:', error);
    throw error;
  }
}
