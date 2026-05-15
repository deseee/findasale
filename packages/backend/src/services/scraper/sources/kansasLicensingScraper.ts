/**
 * Kansas Auctioneer License Scraper
 * Scrapes licensed auctioneers from Kansas Secretary of State auctioneer search
 * Source: https://prolicenseverify.ks.gov/ (updated 2026 — KS has NO state auctioneer license requirement; old KSAuctioneerSearch URL is 404)
 * Public directory with auctioneer license records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

// NOTE: Kansas does NOT issue a state auctioneer license. The old KSAuctioneerSearch
// URL is a 404. The general KS license verification portal (prolicenseverify.ks.gov)
// does not include auctioneers. This scraper will return no auctioneer records.
const KANSAS_SEARCH_URL = 'https://prolicenseverify.ks.gov/';

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
 * Scrape Kansas auctioneer licenses from Secretary of State database.
 * Public directory — no authentication required.
 * Ingests records into Organizer table with KansasLicensing source attribution.
 */
export async function runKansasLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(KANSAS_SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[KansasLicensing] Starting auctioneer license scraper');

    // Fetch search page
    await rateLimiter.waitBeforeRequest(domain);

    const searchResponse = await fetch(KANSAS_SEARCH_URL, {
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
      throw new Error(`Failed to fetch Kansas auctioneer search: ${searchResponse.status}`);
    }

    const html = await searchResponse.text();

    // Parse HTML table rows
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRegex) || [];

    console.log(`[KansasLicensing] Found ${rows.length} table rows`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Extract cells from row
      const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
      const cells = row.match(cellRegex) || [];

      if (cells.length < 4) {
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
      const status = extractText(cells[2]);
      const addressFull = extractText(cells[3]);

      if (!name || !licenseNum) {
        continue;
      }

      totalRecords++;

      // Only ingest active licenses
      if (status !== 'Active') {
        console.log(
          `[KansasLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`
        );
        continue;
      }

      const { city, zip } = parseAddress(addressFull);

      console.log(`[KansasLicensing] Processing: ${name} (License ${licenseNum}) in ${city}, KS`);

      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'KansasLicensing',
        city || 'Kansas',
        'KS',
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
            licenseState: 'KS',
            isStateLicensed: true,
          },
        });

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[KansasLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[KansasLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[KansasLicensing] Scraper error:', error);
    throw error;
  }
}
