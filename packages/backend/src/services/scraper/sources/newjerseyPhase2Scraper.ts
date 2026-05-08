/**
 * New Jersey Department of Banking and Insurance — Pawnbroker License Scraper (Phase 2)
 * Scrapes licensed pawnbrokers from NJDOBI Licensee Search
 * Source: https://www-dobi.nj.gov/DOBI_LicSearch/bnkSearch.jsp
 * License type: 1306 = PAWNBROKER
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data (no auctioneer licensing in NJ)
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const NJDOBI_SEARCH_URL = 'https://www-dobi.nj.gov/DOBI_LicSearch/bnkSearch.jsp';
const NJDOBI_SERVLET_URL = 'https://www-dobi.nj.gov/DOBI_LicSearch/bnkLicenseeSearchServlet';

/**
 * Scrape New Jersey pawnbroker licenses from NJDOBI system.
 * Uses form-based search with license type 1306 (PAWNBROKER).
 * Iterates through alphabetic name ranges to fetch all licenses.
 */
export async function runNewJerseyPhase2Scraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(NJDOBI_SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[NewJerseyPhase2] Starting pawnbroker license scraper');

    // Fetch initial form page
    await rateLimiter.waitBeforeRequest(domain);

    const formPageResponse = await fetch(NJDOBI_SEARCH_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!formPageResponse.ok) {
      throw new Error(`Failed to fetch search form: ${formPageResponse.status}`);
    }

    console.log('[NewJerseyPhase2] Fetched search form');

    // Iterate through alphabet to fetch all pawnbrokers
    // NJ requires at least 3 characters for name search, so we'll use single letters + wildcard
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    for (const letter of alphabet) {
      console.log(`[NewJerseyPhase2] Searching for businesses starting with '${letter}'`);

      // Build form data
      const formData = new URLSearchParams();
      formData.append('LicenseeName', letter); // Start with letter
      formData.append('LicenseType', '1306'); // PAWNBROKER

      await rateLimiter.waitBeforeRequest(domain);

      const searchResponse = await fetch(NJDOBI_SERVLET_URL, {
        method: 'POST',
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate',
          Connection: 'keep-alive',
          Referer: NJDOBI_SEARCH_URL,
        },
        body: formData.toString(),
        signal: AbortSignal.timeout(30000),
      });

      if (!searchResponse.ok) {
        console.warn(`[NewJerseyPhase2] Search failed for letter '${letter}': ${searchResponse.status}`);
        continue;
      }

      const html = await searchResponse.text();

      // Parse HTML table rows — NJ returns results in table format
      const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
      const rows = html.match(rowRegex) || [];

      console.log(`[NewJerseyPhase2] Found ${rows.length} rows for letter '${letter}'`);

      // Skip header row, parse data rows
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];

        // Extract cells from row
        const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
        const cells = row.match(cellRegex) || [];

        if (cells.length < 3) {
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

        const licenseNumber = extractText(cells[0]);
        const businessName = extractText(cells[1]);
        const licenseType = extractText(cells[2]);

        if (!businessName || !licenseNumber || licenseType !== 'PAWNBROKER') {
          continue;
        }

        totalRecords++;

        console.log(
          `[NewJerseyPhase2] Processing: ${businessName} (License ${licenseNumber}), NJ`
        );

        // Upsert organizer with pawnbroker licensing data
        try {
          const existing = await prisma.organizer.findFirst({
            where: {
              businessName: { equals: businessName, mode: 'insensitive' },
              licenseState: 'NJ',
            },
            select: { id: true },
          });

          if (existing) {
            // Update existing
            await prisma.organizer.update({
              where: { id: existing.id },
              data: {
                licenseNumber,
                licenseState: 'NJ',
                isStateLicensed: true,
                directoryMostRecentSource: 'NewJerseyPhase2',
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
                address: 'New Jersey',
                bio: `Licensed pawnbroker in New Jersey.`,
                isClaimed: false,
                isUnmanagedListing: true,
                licenseNumber,
                licenseState: 'NJ',
                isStateLicensed: true,
                businessCategory: 'PAWN_SHOP',
                directoryMostRecentSource: 'NewJerseyPhase2',
                directoryMostRecentAt: new Date(),
                user: {
                  create: {
                    email: `scraper+${slug}-nj-newjerseyph2@system.finda.sale`,
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
              `[NewJerseyPhase2] Progress: processed ${totalRecords} records, created ${createdOrganizers} organizers`
            );
          }
        } catch (err) {
          console.error(`[NewJerseyPhase2] Error processing ${businessName}:`, err);
        }
      }
    }

    console.log(
      `[NewJerseyPhase2] Scraper completed: processed ${totalRecords} records, created ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[NewJerseyPhase2] Scraper error:', error);
    throw error;
  }
}
