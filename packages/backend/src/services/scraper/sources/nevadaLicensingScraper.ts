/**
 * Nevada Secretary of State — Auctioneer License Scraper
 * Scrapes licensed auctioneers from Nevada SOS licensing system
 * Source: https://nvsos.gov/sos/licensing/real-estate/auctioneers
 * Public directory with auctioneer records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const NEVADA_BASE_URL = 'https://nvsos.gov';
const SEARCH_URL = 'https://nvsos.gov/sos/licensing/real-estate/auctioneers';

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
 * Scrape Nevada auctioneer licenses from SOS licensing system.
 * Public directory — no authentication required.
 * Ingests records into Organizer table with NevadaLicensing source attribution.
 */
export async function runNevadaLicensingScraper(): Promise<void> {
  // Phase 1 portal URL is dead (404 since ~2026-05). Phase 2 scraper uses alternative data source.
  console.log('[NevadaLicensing] Scraper disabled — Phase 1 portal URL (nvsos.gov) no longer responds. Phase 2 handles this state.');
  return;

  const rateLimiter = defaultRateLimiter;
  const domain = new URL(SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[NevadaLicensing] Starting auctioneer license scraper');

    // Fetch the auctioneer licensing page
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

    console.log(`[NevadaLicensing] Found ${rows.length} table rows on page`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
      const cells = row.match(cellRegex) || [];

      if (cells.length < 6) {
        continue;
      }

      const extractText = (html: string | undefined): string => {
        return (html ?? '')
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
          `[NevadaLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`
        );
        continue;
      }

      console.log(`[NevadaLicensing] Processing: ${name} (License ${licenseNum}) in ${city}, NV`);

      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'NevadaLicensing',
        city || 'Nevada',
        'NV',
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
        'NV',  // licenseState
        licenseNum, // licenseNumber
      );

      if (organizerId) {

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[NevadaLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[NevadaLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[NevadaLicensing] Scraper error:', error);
    throw error;
  }
}
