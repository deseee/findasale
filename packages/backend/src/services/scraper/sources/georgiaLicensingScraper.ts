/**
 * Georgia Secretary of State — Auctioneer License Scraper
 * Scrapes licensed auctioneers from Georgia SOS license verification system
 * Source: https://verify.sos.ga.gov/verification/Search.aspx
 * Public directory with auctioneer records
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const GEORGIA_SOS_URL = 'https://verify.sos.ga.gov/verification/Search.aspx';

/**
 * Scrape Georgia auctioneer licenses from SOS verification system.
 * Public directory — no authentication required.
 * Ingests records into Organizer table with GeorgiaLicensing source attribution.
 */
export async function runGeorgiaLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(GEORGIA_SOS_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[GeorgiaLicensing] Starting auctioneer license scraper');

    await rateLimiter.waitBeforeRequest(domain);

    const response = await fetch(GEORGIA_SOS_URL, {
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
      throw new Error(`Failed to fetch Georgia auctioneer list: ${response.status}`);
    }

    const html = await response.text();

    // Parse HTML table rows
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRegex) || [];

    console.log(`[GeorgiaLicensing] Found ${rows.length} table rows`);

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
          `[GeorgiaLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`
        );
        continue;
      }

      console.log(`[GeorgiaLicensing] Processing: ${name} (License ${licenseNum}), GA`);

      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'GeorgiaLicensing',
        'Georgia',
        'GA',
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
            licenseState: 'GA',
            isStateLicensed: true,
          },
        });

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[GeorgiaLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[GeorgiaLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[GeorgiaLicensing] Scraper error:', error);
    throw error;
  }
}
