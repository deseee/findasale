/**
 * Delaware Department of Professional Regulation — Auctioneer License Scraper
 * Scrapes licensed auctioneers from Delaware DPR license verification system
 * Source: https://delpros.delaware.gov/OH_VerifyLicense (updated 2026 — old DPR board page moved to DelPros eLicense portal)
 * Public directory with auctioneer records
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

// NOTE: Delaware DPR auctioneer board page moved to the DelPros eLicensing portal.
const DELAWARE_DPR_URL = 'https://delpros.delaware.gov/OH_VerifyLicense';

/**
 * Scrape Delaware auctioneer licenses from DPR verification system.
 * Public directory — no authentication required.
 * Ingests records into Organizer table with DelawareLicensing source attribution.
 */
export async function runDelawareLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(DELAWARE_DPR_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[DelawareLicensing] Starting auctioneer license scraper');

    await rateLimiter.waitBeforeRequest(domain);

    const response = await fetch(DELAWARE_DPR_URL, {
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
      throw new Error(`Failed to fetch Delaware auctioneer list: ${response.status}`);
    }

    const html = await response.text();

    // Parse HTML table rows
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRegex) || [];

    console.log(`[DelawareLicensing] Found ${rows.length} table rows`);

    const extractText = (html: string | undefined): string => {
      return (html ?? '')
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
          `[DelawareLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`
        );
        continue;
      }

      console.log(`[DelawareLicensing] Processing: ${name} (License ${licenseNum}), DE`);

      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'DelawareLicensing',
        'Delaware',
        'DE',
        undefined,
        undefined,
        undefined,
        undefined,
        'AUCTION_HOUSE',
        undefined, // contactEmail
        undefined, // phone
        undefined, // website
        undefined, // lat
        undefined, // lng
        true,       // isStateLicensed
        'DE',  // licenseState
        licenseNum, // licenseNumber
      );

      if (organizerId) {

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[DelawareLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[DelawareLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[DelawareLicensing] Scraper error:', error);
    throw error;
  }
}
