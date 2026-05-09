/**
 * Rhode Island Department of Business Regulation — Pawnbroker License Scraper (Phase 2)
 * Scrapes licensed pawnbrokers from RI DBR banking division pawnbroker search
 * Source: https://dbr.ri.gov/
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const RI_DBR_URL = 'https://dbr.ri.gov/';
const RI_LICENSEE_URL = 'https://dbr.ri.gov/divisions/banking/pawnbrokers';

/**
 * Scrape Rhode Island pawnbroker licenses from RI DBR.
 * Attempts static HTML fetch of pawnbroker licensee page.
 */
export async function runRhodeIslandPhase2Scraper(): Promise<void> {
  const domain = new URL(RI_DBR_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  console.log('[RhodeIsland Phase2] Starting pawnbroker license scraper');

  try {
    // Step 1: Fetch the pawnbroker licensee page
    await defaultRateLimiter.waitBeforeRequest(domain);

    const pageResponse = await fetch(RI_LICENSEE_URL, {
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
      // Try alternate URL pattern
      await defaultRateLimiter.waitBeforeRequest(domain);
      const altResponse = await fetch(`${RI_DBR_URL}divisions/banking/regulated-entities`, {
        method: 'GET',
        headers: {
          'User-Agent': getRandomUserAgent(),
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate',
          Connection: 'keep-alive',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!altResponse.ok) {
        console.warn(
          `[RhodeIsland Phase2] Portal blocked — TODO: Playwright/headless browser. Both URLs returned errors: ${pageResponse.status} / ${altResponse.status}`
        );
        return;
      }
    }

    const html = await pageResponse.text();

    // Detect Cloudflare or JS-only rendering
    const isBlocked =
      html.includes('cf-browser-verification') ||
      html.includes('Just a moment') ||
      html.includes('Checking your browser') ||
      html.includes('_cf_chl_opt') ||
      html.trim().length < 500;

    if (isBlocked) {
      console.warn(
        '[RhodeIsland Phase2] Portal blocked — TODO: Playwright/headless browser required for dbr.ri.gov'
      );
      return;
    }

    console.log('[RhodeIsland Phase2] Fetched pawnbroker licensee page');

    // Step 2: Parse table rows or list items for pawnbroker entries
    const extractText = (cellHtml: string): string =>
      cellHtml
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .trim();

    // Try table parsing first
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRegex) || [];

    if (rows.length > 1) {
      console.log(`[RhodeIsland Phase2] Found ${rows.length} table rows`);

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
        const cells = row.match(cellRegex) || [];

        if (cells.length < 2) continue;

        const businessName = extractText(cells[0]);
        const city = cells.length > 1 ? extractText(cells[1]) : '';
        const licenseNumber = cells.length > 2 ? extractText(cells[2]) : `RI-PAWN-${totalRecords + 1}`;

        if (!businessName) continue;

        totalRecords++;
        console.log(`[RhodeIsland Phase2] Processing: ${businessName} (License ${licenseNumber}) in ${city}, RI`);

        try {
          const existing = await prisma.organizer.findFirst({
            where: {
              businessName: { equals: businessName, mode: 'insensitive' },
              licenseState: 'RI',
            },
            select: { id: true },
          });

          if (existing) {
            await prisma.organizer.update({
              where: { id: existing.id },
              data: {
                licenseNumber,
                licenseState: 'RI',
                isStateLicensed: true,
                directoryMostRecentSource: 'RhodeIslandPhase2',
                directoryMostRecentAt: new Date(),
              },
            });
          } else {
            const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
            const citySlug = city.toLowerCase().replace(/[^a-z0-9]/g, '-');
            await prisma.organizer.create({
              data: {
                businessName,
                phone: null,
                address: city ? `${city}, RI` : 'Rhode Island',
                bio: `Licensed pawnbroker in ${city || 'Rhode Island'}.`,
                isClaimed: false,
                isUnmanagedListing: true,
                licenseNumber,
                licenseState: 'RI',
                isStateLicensed: true,
                businessCategory: 'PAWN_SHOP',
                directoryMostRecentSource: 'RhodeIslandPhase2',
                directoryMostRecentAt: new Date(),
                user: {
                  create: {
                    email: `scraper+${slug}-${citySlug}-ri-riphase2@system.finda.sale`,
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
              `[RhodeIsland Phase2] Progress: processed ${totalRecords} records, created ${createdOrganizers} organizers`
            );
          }
        } catch (err) {
          console.error(`[RhodeIsland Phase2] Error processing ${businessName}:`, err);
        }
      }
    } else {
      // No table found — page may be a static list or require different parsing
      console.warn(
        '[RhodeIsland Phase2] Portal blocked — TODO: Playwright/headless browser. No table found on pawnbroker page — manual inspection of dbr.ri.gov required'
      );
      return;
    }

    console.log(
      `[RhodeIsland Phase2] Scraper completed: processed ${totalRecords} records, created ${createdOrganizers} organizers`
    );
  } catch (err) {
    console.error('[RhodeIsland Phase2] Scraper error:', err);
    throw err;
  }
}
