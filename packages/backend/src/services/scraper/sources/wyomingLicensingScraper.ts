/**
 * Wyoming Secretary of State — Auctioneer License Scraper
 * Scrapes licensed auctioneers from Wyoming professional licenses directory
 * Source: https://wyobiz.wyo.gov/Business/RegistrationType.aspx (updated 2026 — WY has NO state auctioneer license; old URL connection refused)
 * Public directory with auctioneer records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

// NOTE: Wyoming does NOT require a state auctioneer license. Some municipalities
// require local permits. The old wyoming.gov URL is connection-refused (site restructured).
// Updated to the WY Secretary of State business portal — will not yield auctioneer records.
const WYOMING_BASE_URL = 'https://wyobiz.wyo.gov/Business/RegistrationType.aspx';

/**
 * Scrape Wyoming auctioneer licenses from state professional licenses directory.
 * Public directory — no authentication required.
 * Ingests records into Organizer table with WyomingLicensing source attribution.
 */
export async function runWyomingLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(WYOMING_BASE_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[WyomingLicensing] Starting auctioneer license scraper');

    await rateLimiter.waitBeforeRequest(domain);

    const response = await fetch(WYOMING_BASE_URL, {
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
      throw new Error(`Failed to fetch Wyoming professional licenses directory: ${response.status}`);
    }

    const html = await response.text();

    // Parse HTML table rows
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRegex) || [];

    console.log(`[WyomingLicensing] Found ${rows.length} table rows`);

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

      if (cells.length < 2) {
        continue;
      }

      const name = extractText(cells[0]);
      const licenseNum = extractText(cells[1]);
      const city = cells.length > 2 ? extractText(cells[2]) : 'Wyoming';
      const status = cells.length > 3 ? extractText(cells[3]) : 'Active';

      if (!name || !licenseNum) {
        continue;
      }

      totalRecords++;

      if (status !== 'Active') {
        console.log(
          `[WyomingLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`
        );
        continue;
      }

      console.log(`[WyomingLicensing] Processing: ${name} (License ${licenseNum}) in ${city}, WY`);

      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'WyomingLicensing',
        city || 'Wyoming',
        'WY',
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
            licenseState: 'WY',
            isStateLicensed: true,
          },
        });

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[WyomingLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[WyomingLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[WyomingLicensing] Scraper error:', error);
    throw error;
  }
}
