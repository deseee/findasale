/**
 * Alaska Professional Licensing Agency — Pawnbroker License Scraper (Phase 2)
 * Scrapes licensed pawnbrokers from Alaska Division of Corporations, Business and Professional Licensing
 * Source: https://www.commerce.alaska.gov/cbp/main/search/professional
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data (no auctioneer licensing in AK)
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const ALASKA_SEARCH_URL = 'https://www.commerce.alaska.gov/cbp/main/search/professional';

/**
 * Scrape Alaska pawnbroker licenses from state licensing system.
 * Uses form-based search targeting Program ID 41 (Pawnbroker).
 */
export async function runAlaskaPhase2Scraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(ALASKA_SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[AlaskaPhase2] Starting pawnbroker license scraper');

    // Fetch the search form page to get any required form tokens
    await rateLimiter.waitBeforeRequest(domain);

    const formPageResponse = await fetch(ALASKA_SEARCH_URL, {
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

    const formHtml = await formPageResponse.text();

    // Extract any form tokens (verification tokens, view state, etc.)
    // Alaska form uses standard HTML form submission
    const tokenMatch = formHtml.match(/name="__RequestVerificationToken"\s+value="([^"]+)"/);
    const token = tokenMatch ? tokenMatch[1] : '';

    console.log('[AlaskaPhase2] Fetched search form');

    // Build form data for search: Program = Pawnbroker (ID 41)
    // Search with empty name to get all pawnbrokers
    const formData = new URLSearchParams();
    formData.append('ProgramId', '41'); // Pawnbroker program ID
    formData.append('DBA', ''); // Empty to get all results
    formData.append('OwnerEntityName', ''); // Empty to get all results
    formData.append('City', ''); // Empty to get all results
    formData.append('CurrentOnly', 'true'); // Only current (active) licenses

    // Submit search
    await rateLimiter.waitBeforeRequest(domain);

    const searchResponse = await fetch(ALASKA_SEARCH_URL, {
      method: 'POST',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
        Referer: ALASKA_SEARCH_URL,
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(30000),
    });

    if (!searchResponse.ok) {
      throw new Error(`Search failed: ${searchResponse.status}`);
    }

    const html = await searchResponse.text();

    // Parse HTML table rows — Alaska returns results in a grid table
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRegex) || [];

    console.log(`[AlaskaPhase2] Found ${rows.length} table rows`);

    // Skip header row if present, parse data rows
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      // Extract cells from row
      const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
      const cells = row.match(cellRegex) || [];

      if (cells.length < 4) {
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
      const ownerName = extractText(cells[2]);
      const city = extractText(cells[3]);

      if (!businessName || !licenseNumber) {
        continue; // Skip rows without business name or license
      }

      totalRecords++;

      console.log(
        `[AlaskaPhase2] Processing: ${businessName} (License ${licenseNumber}) in ${city}, AK`
      );

      // Upsert organizer with pawnbroker licensing data
      try {
        const existing = await prisma.organizer.findFirst({
          where: {
            businessName: { equals: businessName, mode: 'insensitive' },
            city: { equals: city, mode: 'insensitive' },
            licenseState: 'AK',
          },
          select: { id: true },
        });

        if (existing) {
          // Update existing
          await prisma.organizer.update({
            where: { id: existing.id },
            data: {
              licenseNumber,
              licenseState: 'AK',
              isStateLicensed: true,
              directoryMostRecentSource: 'AlaskaPhase2',
              directoryMostRecentAt: new Date(),
            },
          });
        } else {
          // Create new
          const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
          const citySlug = city.toLowerCase().replace(/[^a-z0-9]/g, '-');
          const newOrg = await prisma.organizer.create({
            data: {
              businessName,
              phone: null,
              address: `${city}, AK`,
              bio: `Licensed pawnbroker in ${city}, Alaska.`,
              isClaimed: false,
              isUnmanagedListing: true,
              licenseNumber,
              licenseState: 'AK',
              isStateLicensed: true,
              businessCategory: 'PAWN_SHOP',
              directoryMostRecentSource: 'AlaskaPhase2',
              directoryMostRecentAt: new Date(),
              user: {
                create: {
                  email: `scraper+${slug}-${citySlug}-ak-alaskaphase2@system.finda.sale`,
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
            `[AlaskaPhase2] Progress: processed ${totalRecords} records, created ${createdOrganizers} organizers`
          );
        }
      } catch (err) {
        console.error(`[AlaskaPhase2] Error processing ${businessName}:`, err);
      }
    }

    console.log(
      `[AlaskaPhase2] Scraper completed: processed ${totalRecords} records, created ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[AlaskaPhase2] Scraper error:', error);
    throw error;
  }
}
