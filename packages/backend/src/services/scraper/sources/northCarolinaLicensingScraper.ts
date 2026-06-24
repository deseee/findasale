/**
 * North Carolina Auctioneer Licensing Board — License Scraper
 * Scrapes licensed auctioneers from NC SALB public directory
 * Source: https://www.ncalb.org/licensee-information/license-search
 * (previously ncalb.gov — domain changed to ncalb.org)
 * Public directory with searchable auctioneer records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const NC_SEARCH_URL = 'https://www.ncalb.org/licensee-information/license-search';

/**
 * Scrape North Carolina auctioneer licenses from SALB public directory.
 * Public directory — no authentication required.
 * Ingests records into Organizer table with NorthCarolinaLicensing source attribution.
 */
export async function runNorthCarolinaLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(NC_SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[NorthCarolinaLicensing] Starting auctioneer license scraper');

    // Fetch the search page to get initial data
    await rateLimiter.waitBeforeRequest(domain);

    const searchResponse = await fetch(NC_SEARCH_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!searchResponse.ok) {
      throw new Error(`Failed to fetch search page: ${searchResponse.status}`);
    }

    const html = await searchResponse.text();

    // Look for licensee data in table rows or structured data
    // NC SALB typically presents data in HTML tables or as JSON embedded in the page
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRegex) || [];

    console.log(`[NorthCarolinaLicensing] Found ${rows.length} table rows`);

    // Parse each row for auctioneer information
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Extract cells from row
      const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
      const cells = row.match(cellRegex) || [];

      if (cells.length < 3) {
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
      const status = cells.length > 2 ? extractText(cells[2]) : '';

      if (!name || !licenseNum) {
        continue;
      }

      totalRecords++;

      // Only ingest active licenses
      if (status && status.toLowerCase() !== 'active') {
        console.log(`[NorthCarolinaLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`);
        continue;
      }

      console.log(`[NorthCarolinaLicensing] Processing: ${name} (License ${licenseNum}) in NC`);

      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'NorthCarolinaLicensing',
        'North Carolina',
        'NC',
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
            licenseState: 'NC',
            isStateLicensed: true,
          },
        });

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[NorthCarolinaLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[NorthCarolinaLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[NorthCarolinaLicensing] Scraper error:', error);
    throw error;
  }
}
