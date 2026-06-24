/**
 * Maryland Auctioneer License Scraper
 * Scrapes licensed auctioneers from Maryland Department of Labor Licensing and Regulation
 * Source: https://www.dllr.state.md.us/cgi-bin/ElectronicLicensing/OP_Search/OP_search.cgi?calling_app=ALL::ALL_personal_name (updated 2026 — old occpro.shtml page moved)
 * Public directory with auctioneer license records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

// NOTE: The old Maryland occpro.shtml page is no longer the entry point.
// The universal occupational license search (all professions including auctioneers) is at the CGI endpoint below.
const MARYLAND_SEARCH_URL = 'https://www.dllr.state.md.us/cgi-bin/ElectronicLicensing/OP_Search/OP_search.cgi?calling_app=ALL::ALL_personal_name';

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
 * Scrape Maryland auctioneer licenses from DLLR database.
 * Public directory — no authentication required.
 * Ingests records into Organizer table with MarylandLicensing source attribution.
 */
export async function runMarylandLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(MARYLAND_SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[MarylandLicensing] Starting auctioneer license scraper');

    // Fetch search page
    await rateLimiter.waitBeforeRequest(domain);

    const searchResponse = await fetch(MARYLAND_SEARCH_URL, {
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
      throw new Error(`Failed to fetch Maryland auctioneer search: ${searchResponse.status}`);
    }

    const html = await searchResponse.text();

    // Parse HTML table rows
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRegex) || [];

    console.log(`[MarylandLicensing] Found ${rows.length} table rows`);

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
          `[MarylandLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`
        );
        continue;
      }

      const { city, zip } = parseAddress(addressFull);

      console.log(`[MarylandLicensing] Processing: ${name} (License ${licenseNum}) in ${city}, MD`);

      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'MarylandLicensing',
        city || 'Maryland',
        'MD',
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
            licenseState: 'MD',
            isStateLicensed: true,
          },
        });

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[MarylandLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[MarylandLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[MarylandLicensing] Scraper error:', error);
    throw error;
  }
}
