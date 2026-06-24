/**
 * Virginia DPOR Auctioneer Licensing — License Scraper
 * Scrapes licensed auctioneers from Virginia DPOR License Lookup
 * Source: https://www.dpor.virginia.gov/LicenseLookup/
 * Public directory with searchable auctioneer records
 * License types: Auctioneer, Auction Firm
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const VA_LOOKUP_URL = 'https://www.dpor.virginia.gov/LicenseLookup/';

/**
 * Scrape Virginia auctioneer licenses from DPOR License Lookup.
 * Public directory — no authentication required.
 * Ingests records into Organizer table with VirginiaLicensing source attribution.
 */
export async function runVirginiaLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(VA_LOOKUP_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[VirginiaLicensing] Starting auctioneer license scraper');

    // Fetch the license lookup page
    await rateLimiter.waitBeforeRequest(domain);

    const lookupResponse = await fetch(VA_LOOKUP_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!lookupResponse.ok) {
      throw new Error(`Failed to fetch license lookup page: ${lookupResponse.status}`);
    }

    const html = await lookupResponse.text();

    // Look for auctioneer license data in table rows
    // Virginia DPOR typically presents data in HTML tables
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRegex) || [];

    console.log(`[VirginiaLicensing] Found ${rows.length} table rows`);

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
      const licenseType = extractText(cells[1]);
      const licenseNum = cells.length > 2 ? extractText(cells[2]) : '';
      const status = cells.length > 3 ? extractText(cells[3]) : 'Active';

      if (!name || !licenseNum) {
        continue;
      }

      // Filter for Auctioneer or Auction Firm license types
      if (licenseType && !licenseType.toLowerCase().includes('auctioneer') && !licenseType.toLowerCase().includes('auction firm')) {
        continue;
      }

      totalRecords++;

      // Only ingest active licenses
      if (status && status.toLowerCase() !== 'active') {
        console.log(`[VirginiaLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`);
        continue;
      }

      console.log(`[VirginiaLicensing] Processing: ${name} (License ${licenseNum}) in VA`);

      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'VirginiaLicensing',
        'Virginia',
        'VA',
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
            licenseState: 'VA',
            isStateLicensed: true,
          },
        });

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[VirginiaLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[VirginiaLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[VirginiaLicensing] Scraper error:', error);
    throw error;
  }
}
