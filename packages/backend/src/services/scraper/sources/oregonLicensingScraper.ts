/**
 * Oregon Department of Consumer and Business Services — Auctioneer License Scraper
 * Scrapes licensed auctioneers from Oregon DCBS licensing system
 * Source: https://www.oregon.gov/dcbs/business/Pages/licensing.aspx
 * Public directory with auctioneer records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const OREGON_BASE_URL = 'https://www.oregon.gov';
const SEARCH_URL = 'https://www.oregon.gov/dcbs/business/Pages/licensing.aspx';

/**
 * Parse an address string like "City, ST 12345" into city and zip components
 */
function parseAddress(address: string): { city: string; zip: string } {
  const parts = address.split(',').map((s) => s.trim());
  if (parts.length < 2) {
    return { city: address, zip: '' };
  }
  const cityPart = parts[0];
  const stateZip = parts[1];
  // Format: "ST 12345"
  const zipMatch = stateZip.match(/\d{5}/);
  const zip = zipMatch ? zipMatch[0] : '';
  return { city: cityPart, zip };
}

/**
 * Scrape Oregon auctioneer licenses from DCBS licensing system.
 * Public directory — no authentication required.
 * Ingests records into Organizer table with OregonLicensing source attribution.
 */
export async function runOregonLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[OregonLicensing] Starting auctioneer license scraper');

    // Fetch the licensing page
    await rateLimiter.waitBeforeRequest(domain);

    const pageResponse = await fetch(SEARCH_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!pageResponse.ok) {
      throw new Error(`Failed to fetch page: ${pageResponse.status}`);
    }

    const html = await pageResponse.text();

    // Parse HTML table rows
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRegex) || [];

    console.log(`[OregonLicensing] Found ${rows.length} table rows on page`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
      const cells = row.match(cellRegex) || [];

      if (cells.length < 6) {
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
      const profession = extractText(cells[2]);
      const licenseType = extractText(cells[3]);
      const status = extractText(cells[4]);
      const addressFull = extractText(cells[5]);

      if (!name || !licenseNum) {
        continue;
      }

      totalRecords++;

      const { city, zip } = parseAddress(addressFull);

      if (status !== 'Active') {
        console.log(
          `[OregonLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`
        );
        continue;
      }

      console.log(`[OregonLicensing] Processing: ${name} (License ${licenseNum}) in ${city}, OR`);

      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'OregonLicensing',
        city || 'Oregon',
        'OR',
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
            licenseState: 'OR',
            isStateLicensed: true,
          },
        });

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[OregonLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[OregonLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[OregonLicensing] Scraper error:', error);
    throw error;
  }
}
