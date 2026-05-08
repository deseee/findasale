/**
 * Iowa Professional Licensing Bureau — Auctioneer License Scraper
 * Scrapes licensed auctioneers from Iowa PLB license verification system
 * Source: https://plb.iowa.gov/licensee-search
 * Public directory with auctioneer records
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const IOWA_PLB_URL = 'https://plb.iowa.gov/licensee-search';

/**
 * Scrape Iowa auctioneer licenses from PLB verification system.
 * Public directory — no authentication required.
 * Ingests records into Organizer table with IowaLicensing source attribution.
 */
export async function runIowaLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(IOWA_PLB_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[IowaLicensing] Starting auctioneer license scraper');

    await rateLimiter.waitBeforeRequest(domain);

    const response = await fetch(IOWA_PLB_URL, {
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
      throw new Error(`Failed to fetch Iowa auctioneer list: ${response.status}`);
    }

    const html = await response.text();

    // Parse HTML table rows
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRegex) || [];

    console.log(`[IowaLicensing] Found ${rows.length} table rows`);

    const extractText = (html: string): string => {
      return html
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .trim();
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
      const cells = row.match(cellRegex) || [];

      if (cells.length < 3) {
        continue;
      }

      const name = extractText(cells[0]);
      const licenseNum = extractText(cells[1]);
      const status = cells.length > 3 ? extractText(cells[3]) : extractText(cells[2]);

      if (!name || !licenseNum) {
        continue;
      }

      totalRecords++;

      if (status.toLowerCase() !== 'active') {
        console.log(
          `[IowaLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`
        );
        continue;
      }

      console.log(`[IowaLicensing] Processing: ${name} (License ${licenseNum}), IA`);

      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'IowaLicensing',
        'Iowa',
        'IA',
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
            licenseState: 'IA',
            isStateLicensed: true,
          },
        });

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[IowaLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[IowaLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[IowaLicensing] Scraper error:', error);
    throw error;
  }
}
