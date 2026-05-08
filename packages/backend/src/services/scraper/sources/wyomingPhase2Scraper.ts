/**
 * Wyoming Division of Banking — Pawnbroker License Scraper (Phase 2)
 * Scrapes licensed pawnbrokers from Wyoming Division of Banking licensee list
 * Source: https://wyomingbankingdivision.wyo.gov/consumer-lending/licensee-list
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data (no auctioneer licensing in WY)
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const WYOMING_LICENSEE_LIST_URL = 'https://wyomingbankingdivision.wyo.gov/consumer-lending/licensee-list';

/**
 * Scrape Wyoming pawnbroker licenses from state banking division.
 * Fetches the licensee list page and parses pawnbroker entries.
 */
export async function runWyomingPhase2Scraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(WYOMING_LICENSEE_LIST_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[WyomingPhase2] Starting pawnbroker license scraper');

    // Fetch the licensee list page
    await rateLimiter.waitBeforeRequest(domain);

    const pageResponse = await fetch(WYOMING_LICENSEE_LIST_URL, {
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
      throw new Error(`Failed to fetch licensee list: ${pageResponse.status}`);
    }

    const html = await pageResponse.text();

    console.log('[WyomingPhase2] Fetched licensee list page');

    // Parse pawnbroker license entries from the page
    // Wyoming typically presents licensees in a table or list format with name, license type, and location
    // Look for rows/entries that mention "Pawnbroker" or "Pawn" in the license type field

    // Pattern 1: Table rows with pawnbroker license type
    const tableRowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(tableRowRegex) || [];

    console.log(`[WyomingPhase2] Found ${rows.length} table rows`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Extract cells from row
      const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
      const cells = row.match(cellRegex) || [];

      if (cells.length < 2) {
        continue; // Skip malformed rows
      }

      // Extract text from cells, removing HTML tags
      const extractText = (html: string): string => {
        return html
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .trim();
      };

      const firstCellText = extractText(cells[0]);
      const licenseTypeText = cells.length > 1 ? extractText(cells[1]) : '';

      // Check if this is a pawnbroker license entry
      if (!licenseTypeText.includes('Pawnbroker') && !licenseTypeText.includes('pawnbroker')) {
        continue; // Not a pawnbroker entry
      }

      const businessName = firstCellText;

      if (!businessName) {
        continue; // Skip empty business names
      }

      // Extract license number from row if available (usually in a separate cell)
      const licenseNumber = cells.length > 2 ? extractText(cells[2]) : `WY-${totalRecords + 1}`;

      totalRecords++;

      console.log(
        `[WyomingPhase2] Processing: ${businessName} (License ${licenseNumber}), WY`
      );

      // Upsert organizer with pawnbroker licensing data
      try {
        const existing = await prisma.organizer.findFirst({
          where: {
            businessName: { equals: businessName, mode: 'insensitive' },
            licenseState: 'WY',
          },
          select: { id: true },
        });

        if (existing) {
          // Update existing
          await prisma.organizer.update({
            where: { id: existing.id },
            data: {
              licenseNumber,
              licenseState: 'WY',
              isStateLicensed: true,
              directoryMostRecentSource: 'WyomingPhase2',
              directoryMostRecentAt: new Date(),
            },
          });
        } else {
          // Create new
          const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
          const newOrg = await prisma.organizer.create({
            data: {
              businessName,
              phone: null,
              address: 'Wyoming',
              bio: `Licensed pawnbroker in Wyoming.`,
              isClaimed: false,
              isUnmanagedListing: true,
              licenseNumber,
              licenseState: 'WY',
              isStateLicensed: true,
              businessCategory: 'PAWN_SHOP',
              directoryMostRecentSource: 'WyomingPhase2',
              directoryMostRecentAt: new Date(),
              user: {
                create: {
                  email: `scraper+${slug}-wy-wyomingphase2@system.finda.sale`,
                  name: businessName,
                  password: null,
                  role: 'ORGANIZER',
                  roles: ['ORGANIZER'],
                },
              },
            },
          });
          createdOrganizers++;
        }

        if (totalRecords % 50 === 0) {
          console.log(
            `[WyomingPhase2] Progress: processed ${totalRecords} records, created ${createdOrganizers} organizers`
          );
        }
      } catch (err) {
        console.error(`[WyomingPhase2] Error processing ${businessName}:`, err);
      }
    }

    console.log(
      `[WyomingPhase2] Scraper completed: processed ${totalRecords} records, created ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[WyomingPhase2] Scraper error:', error);
    throw error;
  }
}
