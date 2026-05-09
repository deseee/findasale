/**
 * Oklahoma Department of Consumer Credit — Pawnbroker License Scraper (Phase 2)
 * Scrapes licensed pawnbrokers from the ODCC public licensee search
 * Source: https://www.okdocc.state.ok.us/OKApps/license/listsearch.aspx
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const ODCC_SEARCH_URL =
  'https://www.okdocc.state.ok.us/OKApps/license/listsearch.aspx';

/**
 * Scrape Oklahoma pawnbroker licenses from the ODCC licensee search.
 */
export async function runOklahomaphase2Scraper(): Promise<void> {
  const domain = new URL(ODCC_SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[OklahomaPhase2] Starting pawnbroker license scraper');

    // Step 1: Fetch the search page to get ASP.NET form tokens
    await defaultRateLimiter.waitBeforeRequest(domain);

    const initResponse = await fetch(ODCC_SEARCH_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!initResponse.ok) {
      throw new Error(`Failed to load ODCC search page: ${initResponse.status}`);
    }

    const initHtml = await initResponse.text();
    console.log('[OklahomaPhase2] Loaded ODCC search page');

    const viewStateMatch = initHtml.match(/id="__VIEWSTATE"\s+value="([^"]+)"/);
    const eventValidationMatch = initHtml.match(/id="__EVENTVALIDATION"\s+value="([^"]+)"/);
    const viewStateGeneratorMatch = initHtml.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/);

    const viewState = viewStateMatch ? viewStateMatch[1] : '';
    const eventValidation = eventValidationMatch ? eventValidationMatch[1] : '';
    const viewStateGenerator = viewStateGeneratorMatch ? viewStateGeneratorMatch[1] : '';

    // Step 2: POST search for active Pawnbroker licenses
    await defaultRateLimiter.waitBeforeRequest(domain);

    const searchBody = new URLSearchParams({
      __VIEWSTATE: viewState,
      __VIEWSTATEGENERATOR: viewStateGenerator,
      __EVENTVALIDATION: eventValidation,
      ctl00$MainContent$ddlLicenseType: 'PAWN',
      ctl00$MainContent$ddlStatus: 'Active',
      ctl00$MainContent$btnSearch: 'Search',
    });

    const searchResponse = await fetch(ODCC_SEARCH_URL, {
      method: 'POST',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: ODCC_SEARCH_URL,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      body: searchBody.toString(),
      signal: AbortSignal.timeout(60000),
    });

    if (!searchResponse.ok) {
      throw new Error(`ODCC search POST failed: ${searchResponse.status}`);
    }

    const resultsHtml = await searchResponse.text();
    console.log('[OklahomaPhase2] Received search results');

    const tableRowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = resultsHtml.match(tableRowRegex) || [];
    console.log(`[OklahomaPhase2] Found ${rows.length} table rows`);

    const extractText = (html: string): string =>
      html
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();

    for (const row of rows) {
      const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
      const cells = row.match(cellRegex) || [];
      if (cells.length < 2) continue;

      const businessName = extractText(cells[0]);
      if (!businessName || businessName.toLowerCase() === 'business name') continue;

      const licenseNumber = cells.length > 1 ? extractText(cells[1]) : `OK-${totalRecords + 1}`;
      const city = cells.length > 2 ? extractText(cells[2]) : 'Oklahoma';

      totalRecords++;
      console.log(`[OklahomaPhase2] Processing: ${businessName} (${licenseNumber}), ${city}, OK`);

      try {
        const existing = await prisma.organizer.findFirst({
          where: {
            businessName: { equals: businessName, mode: 'insensitive' },
            licenseState: 'OK',
          },
          select: { id: true },
        });

        if (existing) {
          await prisma.organizer.update({
            where: { id: existing.id },
            data: {
              licenseNumber,
              licenseState: 'OK',
              isStateLicensed: true,
              directoryMostRecentSource: 'OklahomaPhase2',
              directoryMostRecentAt: new Date(),
            },
          });
        } else {
          const slug = businessName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .slice(0, 30)
            .replace(/-$/, '');

          await prisma.organizer.create({
            data: {
              businessName,
              phone: null,
              address: city ? `${city}, Oklahoma` : 'Oklahoma',
              bio: 'Licensed pawnbroker in Oklahoma.',
              isClaimed: false,
              isUnmanagedListing: true,
              licenseNumber,
              licenseState: 'OK',
              isStateLicensed: true,
              businessCategory: 'PAWN_SHOP',
              directoryMostRecentSource: 'OklahomaPhase2',
              directoryMostRecentAt: new Date(),
              user: {
                create: {
                  email: `scraper+${slug}-ok-oklahomaphase2@system.finda.sale`,
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
          console.log(`[OklahomaPhase2] Progress: ${totalRecords} processed, ${createdOrganizers} created`);
        }
      } catch (err) {
        console.error(`[OklahomaPhase2] Error processing ${businessName}:`, err);
      }
    }

    console.log(`[OklahomaPhase2] Completed: ${totalRecords} records processed, ${createdOrganizers} organizers created`);
  } catch (error) {
    console.error('[OklahomaPhase2] Scraper error:', error);
    throw error;
  }
}
