/**
 * Idaho Department of Finance — Pawnbroker License Scraper (Phase 2)
 * Scrapes licensed pawnbrokers from Idaho Department of Finance regulated lender search
 * Source: https://www.finance.idaho.gov/
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const ID_FINANCE_URL = 'https://www.finance.idaho.gov/';
const ID_LICENSEE_SEARCH_URL = 'https://www.finance.idaho.gov/consumer-finance/find-a-licensed-lender/';

/**
 * Scrape Idaho pawnbroker licenses from Idaho Department of Finance.
 * Attempts static HTML form-based search for pawnbroker license type.
 */
export async function runIdahoPhase2Scraper(): Promise<void> {
  const domain = new URL(ID_FINANCE_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  console.log('[Idaho Phase2] Starting pawnbroker license scraper');

  try {
    // Step 1: Fetch the licensee search page
    await defaultRateLimiter.waitBeforeRequest(domain);

    const pageResponse = await fetch(ID_LICENSEE_SEARCH_URL, {
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
      console.warn(
        `[Idaho Phase2] Portal blocked — TODO: Playwright/headless browser. HTTP ${pageResponse.status}`
      );
      return;
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
        '[Idaho Phase2] Portal blocked — TODO: Playwright/headless browser required for finance.idaho.gov'
      );
      return;
    }

    console.log('[Idaho Phase2] Fetched licensee search page');

    // Step 2: Look for a form action URL and submit with pawnbroker license type
    const formActionMatch = html.match(/<form[^>]+action="([^"]+)"/i);
    const formAction = formActionMatch ? formActionMatch[1] : null;

    // Look for pawnbroker-related option values in license type dropdowns
    const pawnOptionMatch = html.match(/value="([^"]*pawn[^"]*)"[^>]*>/i);

    if (!formAction && !pawnOptionMatch) {
      console.warn(
        '[Idaho Phase2] Portal blocked — TODO: Playwright/headless browser. No form or pawnbroker option found — page may require JS rendering'
      );
      return;
    }

    // Build search URL — try common Idaho DOF search endpoint patterns
    const searchUrl = formAction
      ? (formAction.startsWith('http') ? formAction : `https://www.finance.idaho.gov${formAction}`)
      : 'https://www.finance.idaho.gov/consumer-finance/find-a-licensed-lender/';

    const pawnValue = pawnOptionMatch ? pawnOptionMatch[1] : 'pawnbroker';

    const formData = new URLSearchParams();
    formData.append('licenseType', pawnValue);
    formData.append('businessName', '');

    await defaultRateLimiter.waitBeforeRequest(domain);

    const searchResponse = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
        Referer: ID_LICENSEE_SEARCH_URL,
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(30000),
    });

    if (!searchResponse.ok) {
      console.warn(`[Idaho Phase2] Search request failed: HTTP ${searchResponse.status}`);
      return;
    }

    const resultsHtml = await searchResponse.text();

    // Step 3: Parse table rows from results
    const extractText = (cellHtml: string): string =>
      cellHtml
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .trim();

    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = resultsHtml.match(rowRegex) || [];

    console.log(`[Idaho Phase2] Found ${rows.length} table rows`);

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
      const cells = row.match(cellRegex) || [];

      if (cells.length < 3) continue;

      const licenseNumber = extractText(cells[0]);
      const businessName = extractText(cells[1]);
      const city = extractText(cells[2]);
      const licenseType = cells.length > 3 ? extractText(cells[3]) : '';

      // Filter to pawnbroker licenses only
      if (
        licenseType &&
        !licenseType.toLowerCase().includes('pawn')
      ) {
        continue;
      }

      if (!businessName || !licenseNumber) continue;

      totalRecords++;
      console.log(`[Idaho Phase2] Processing: ${businessName} (License ${licenseNumber}) in ${city}, ID`);

      try {
        const existing = await prisma.organizer.findFirst({
          where: {
            businessName: { equals: businessName, mode: 'insensitive' },
            licenseState: 'ID',
          },
          select: { id: true },
        });

        if (existing) {
          await prisma.organizer.update({
            where: { id: existing.id },
            data: {
              licenseNumber,
              licenseState: 'ID',
              isStateLicensed: true,
              directoryMostRecentSource: 'IdahoPhase2',
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
              address: city ? `${city}, ID` : 'Idaho',
              bio: `Licensed pawnbroker in ${city || 'Idaho'}.`,
              isClaimed: false,
              isUnmanagedListing: true,
              licenseNumber,
              licenseState: 'ID',
              isStateLicensed: true,
              businessCategory: 'PAWN_SHOP',
              directoryMostRecentSource: 'IdahoPhase2',
              directoryMostRecentAt: new Date(),
              user: {
                create: {
                  email: `scraper+${slug}-${citySlug}-id-idahophase2@system.finda.sale`,
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
            `[Idaho Phase2] Progress: processed ${totalRecords} records, created ${createdOrganizers} organizers`
          );
        }
      } catch (err) {
        console.error(`[Idaho Phase2] Error processing ${businessName}:`, err);
      }
    }

    console.log(
      `[Idaho Phase2] Scraper completed: processed ${totalRecords} records, created ${createdOrganizers} organizers`
    );
  } catch (err) {
    console.error('[Idaho Phase2] Scraper error:', err);
    throw err;
  }
}
