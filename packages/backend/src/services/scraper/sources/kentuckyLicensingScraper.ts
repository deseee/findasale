/**
 * Kentucky Auctioneer License Scraper
 * Scrapes licensed auctioneers from Kentucky Auctioneer Commission search
 * Source: http://web1.ky.gov/gensearch/LicenseSearch.aspx?AGY=3
 * Public directory with auctioneer license records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const KENTUCKY_SEARCH_URL = 'http://web1.ky.gov/gensearch/LicenseSearch.aspx?AGY=3';

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
 * Scrape Kentucky auctioneer licenses from Auctioneer Commission database.
 * Public directory — no authentication required.
 * Ingests records into Organizer table with KentuckyLicensing source attribution.
 */
export async function runKentuckyLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(KENTUCKY_SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[KentuckyLicensing] Starting auctioneer license scraper');

    // Fetch search page
    await rateLimiter.waitBeforeRequest(domain);

    const searchResponse = await fetch(KENTUCKY_SEARCH_URL, {
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
      throw new Error(`Failed to fetch Kentucky auctioneer search: ${searchResponse.status}`);
    }

    const html = await searchResponse.text();

    // Parse HTML table rows
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRegex) || [];

    console.log(`[KentuckyLicensing] Found ${rows.length} table rows`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Extract cells from row
      const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
      const cells = row.match(cellRegex) || [];

      if (cells.length < 4) {
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
      const status = extractText(cells[2]);
      const addressFull = extractText(cells[3]);

      if (!name || !licenseNum) {
        continue;
      }

      totalRecords++;

      // Only ingest active licenses
      if (status !== 'Active') {
        console.log(
          `[KentuckyLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`
        );
        continue;
      }

      const { city, zip } = parseAddress(addressFull);

      console.log(`[KentuckyLicensing] Processing: ${name} (License ${licenseNum}) in ${city}, KY`);

      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'KentuckyLicensing',
        city || 'Kentucky',
        'KY',
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
        'KY',  // licenseState
        licenseNum, // licenseNumber
      );

      if (organizerId) {

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[KentuckyLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[KentuckyLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[KentuckyLicensing] Scraper error:', error);
    throw error;
  }
}
