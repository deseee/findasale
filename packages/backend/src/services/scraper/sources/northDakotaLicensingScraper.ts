/**
 * North Dakota Professional Standards Board — Auctioneer License Scraper
 * Scrapes licensed auctioneers from North Dakota PSI Exams database
 * Source: https://www.psiexams.com/ndac
 * Public directory with auctioneer records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const NORTH_DAKOTA_BASE_URL = 'https://www.psiexams.com/ndac';

/**
 * Parse an address string into city and zip components
 */
function parseAddress(address: string): { city: string; zip: string } {
  const parts = address.split(',').map((s) => s.trim());
  if (parts.length < 2) {
    return { city: address, zip: '' };
  }
  const cityPart = parts[0];
  const stateZip = parts[1];
  const zipMatch = stateZip.match(/\d{5}/);
  const zip = zipMatch ? zipMatch[0] : '';
  return { city: cityPart, zip };
}

/**
 * Scrape North Dakota auctioneer licenses from Professional Standards Board.
 * Public directory — no authentication required.
 * Ingests records into Organizer table with NorthDakotaLicensing source attribution.
 */
export async function runNorthDakotaLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(NORTH_DAKOTA_BASE_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[NorthDakotaLicensing] Starting auctioneer license scraper');

    await rateLimiter.waitBeforeRequest(domain);

    const response = await fetch(NORTH_DAKOTA_BASE_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch North Dakota licensing page: ${response.status}`);
    }

    const html = await response.text();

    // Parse HTML table rows
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRegex) || [];

    console.log(`[NorthDakotaLicensing] Found ${rows.length} table rows`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
      const cells = row.match(cellRegex) || [];

      if (cells.length < 5) {
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
      const status = extractText(cells[2]);
      const city = extractText(cells[3]);
      const zip = extractText(cells[4]);

      if (!name || !licenseNum) {
        continue;
      }

      totalRecords++;

      // Only ingest active licenses
      if (status !== 'Active') {
        console.log(`[NorthDakotaLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`);
        continue;
      }

      console.log(`[NorthDakotaLicensing] Processing: ${name} (License ${licenseNum}) in ${city}, ND`);

      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'NorthDakotaLicensing',
        city || 'North Dakota',
        'ND',
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
            licenseState: 'ND',
            isStateLicensed: true,
          },
        });

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[NorthDakotaLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[NorthDakotaLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[NorthDakotaLicensing] Scraper error:', error);
    throw error;
  }
}
