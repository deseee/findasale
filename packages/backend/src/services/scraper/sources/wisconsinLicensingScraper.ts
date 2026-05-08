/**
 * Wisconsin Department of Safety — Auctioneer License Scraper
 * Scrapes licensed auctioneers from Wisconsin license search directory
 * Source: https://licensesearch.wi.gov/
 * Public directory with auctioneer records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const WISCONSIN_BASE_URL = 'https://licensesearch.wi.gov/';

/**
 * Scrape Wisconsin auctioneer licenses from state license search directory.
 * Public directory — no authentication required.
 * Ingests records into Organizer table with WisconsinLicensing source attribution.
 */
export async function runWisconsinLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(WISCONSIN_BASE_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[WisconsinLicensing] Starting auctioneer license scraper');

    await rateLimiter.waitBeforeRequest(domain);

    const response = await fetch(WISCONSIN_BASE_URL, {
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
      throw new Error(`Failed to fetch Wisconsin license search directory: ${response.status}`);
    }

    const html = await response.text();

    // Parse HTML table rows
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRegex) || [];

    console.log(`[WisconsinLicensing] Found ${rows.length} table rows`);

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
      const city = cells.length > 2 ? extractText(cells[2]) : 'Wisconsin';
      const status = cells.length > 3 ? extractText(cells[3]) : 'Active';

      if (!name || !licenseNum) {
        continue;
      }

      totalRecords++;

      if (status !== 'Active') {
        console.log(
          `[WisconsinLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`
        );
        continue;
      }

      console.log(`[WisconsinLicensing] Processing: ${name} (License ${licenseNum}) in ${city}, WI`);

      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'WisconsinLicensing',
        city || 'Wisconsin',
        'WI',
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
            licenseState: 'WI',
            isStateLicensed: true,
          },
        });

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[WisconsinLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[WisconsinLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[WisconsinLicensing] Scraper error:', error);
    throw error;
  }
}
