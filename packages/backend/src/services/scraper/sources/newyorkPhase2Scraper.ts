/**
 * New York Department of Financial Services (DFS) — Secondhand Dealer/Pawnbroker License Scraper (Phase 2)
 * Scrapes licensed pawnbrokers and secondhand dealers from NY DFS licensee search
 * Primary: https://myportal.dfs.ny.gov/web/guest-applications/licensed-entities
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data
 * Note: NYC also has city-level licensing, but NY DFS maintains state-level pawnbroker/secondhand dealer records.
 *
 * NY DFS licensed entities portal supports license type filtering.
 * We search for "Pawnbroker" and "Secondhand Dealer" license types separately.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

// NY DFS public licensee search — REST-style query endpoint
const NYDFS_BASE_URL = 'https://myportal.dfs.ny.gov';
const NYDFS_SEARCH_URL = 'https://myportal.dfs.ny.gov/web/guest-applications/licensed-entities';
// DFS uses Liferay portal — search API endpoint
const NYDFS_API_URL = 'https://myportal.dfs.ny.gov/api/jsonws/invoke';
const RATE_DELAY_MS = 3000;

// License types to search — NY DFS covers both pawnbroker and secondhand dealer at state level
const LICENSE_TYPES = ['Pawnbroker', 'Secondhand Dealer'];

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Scrape New York DFS pawnbroker and secondhand dealer licenses.
 * Attempts DFS portal search for each license type.
 * Falls back gracefully if portal requires JS rendering.
 */
export async function runNewYorkPhase2Scraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(NYDFS_SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[NewYorkPhase2] Starting NY DFS pawnbroker/secondhand dealer scraper');

    // Step 1: Fetch the DFS licensed entities page to understand portal structure
    await rateLimiter.waitBeforeRequest(domain);

    const landingResponse = await fetch(NYDFS_SEARCH_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!landingResponse.ok) {
      console.warn(`[NewYorkPhase2] DFS portal unreachable: ${landingResponse.status}`);
      // TODO: NY DFS licensed entity search may require Liferay session.
      // Alternative: https://www.dfs.ny.gov/consumers/financial_companies/pawnbroker
      // or email dfs.licensing@dfs.ny.gov for bulk licensee list.
      return;
    }

    const landingHtml = await landingResponse.text();
    console.log(`[NewYorkPhase2] DFS portal fetched (${landingHtml.length} bytes)`);

    // Check for JS-rendered portal (Liferay/React apps return minimal HTML without JS)
    const isJsPortal =
      landingHtml.includes('window.__INITIAL_STATE__') ||
      landingHtml.includes('ng-app') ||
      landingHtml.length < 2000;

    if (isJsPortal) {
      console.warn(
        '[NewYorkPhase2] DFS portal appears to be JS-rendered. ' +
        'TODO: NY DFS myportal.dfs.ny.gov is a Liferay portal that requires JavaScript rendering. ' +
        'Options: ' +
        '1. Use DFS public data: https://www.dfs.ny.gov/apps_and_licensing/licensed_entities/pawnbrokers ' +
        '2. Request bulk list via FOIL: https://www.dfs.ny.gov/consumers/foil ' +
        '3. Parse the DFS public PDF directory if available.'
      );
      // Attempt the public static page as a fallback
      await sleep(RATE_DELAY_MS);
      await runNewYorkStaticFallback(domain, rateLimiter, createdOrganizers, totalRecords);
      return;
    }

    // Parse results if portal returned HTML data
    const extractText = (cellHtml: string): string => {
      return cellHtml
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
    };

    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowRegex.exec(landingHtml)) !== null) {
      const rowHtml = rowMatch[1];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;

      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(extractText(cellMatch[1]));
      }

      if (cells.length < 2) continue;

      const licenseNumber = cells[0];
      const businessName = cells[1];
      const city = cells.length > 2 ? cells[2] : '';
      const licenseType = cells.length > 3 ? cells[3] : '';

      // Filter to pawnbroker and secondhand dealer entries
      if (licenseType && !licenseType.toLowerCase().includes('pawn') && !licenseType.toLowerCase().includes('secondhand')) {
        continue;
      }

      if (!licenseNumber || !businessName || licenseNumber === 'License Number') continue;

      totalRecords++;

      console.log(`[NewYorkPhase2] Processing: ${businessName} (${licenseNumber}) in ${city || 'NY'}`);

      try {
        await upsertNYOrganizer({ businessName, licenseNumber, city });
        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(`[NewYorkPhase2] Progress: ${totalRecords} processed, ${createdOrganizers} created`);
        }

        await sleep(RATE_DELAY_MS);
      } catch (err) {
        console.error(`[NewYorkPhase2] Error processing ${businessName}:`, err);
      }
    }

    console.log(
      `[NewYorkPhase2] Scraper completed: ${totalRecords} records processed, ${createdOrganizers} created`
    );
  } catch (error) {
    console.error('[NewYorkPhase2] Scraper error:', error);
    throw error;
  }
}

/**
 * Fallback: Try the NY DFS static public pawnbroker page.
 * https://www.dfs.ny.gov/apps_and_licensing/licensed_entities/pawnbrokers
 */
async function runNewYorkStaticFallback(
  domain: string,
  rateLimiter: typeof defaultRateLimiter,
  createdOrganizers: number,
  totalRecords: number
): Promise<void> {
  const fallbackUrl = 'https://www.dfs.ny.gov/apps_and_licensing/licensed_entities/pawnbrokers';
  const fallbackDomain = 'www.dfs.ny.gov';

  console.log(`[NewYorkPhase2] Attempting static fallback: ${fallbackUrl}`);

  await rateLimiter.waitBeforeRequest(fallbackDomain);

  const fallbackResponse = await fetch(fallbackUrl, {
    method: 'GET',
    headers: {
      'User-Agent': getRandomUserAgent(),
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Connection: 'keep-alive',
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!fallbackResponse.ok) {
    console.warn(
      `[NewYorkPhase2] Static fallback also failed (${fallbackResponse.status}). ` +
      'TODO: Submit FOIL request to NY DFS for pawnbroker licensee list. ' +
      'Contact: https://www.dfs.ny.gov/consumers/foil'
    );
    return;
  }

  const html = await fallbackResponse.text();

  if (html.includes('captcha') || html.includes('CAPTCHA') || html.length < 500) {
    console.warn(
      '[NewYorkPhase2] Static fallback returned blocked/empty response. ' +
      'TODO: NY DFS is blocking server-side requests. Use FOIL request for bulk data.'
    );
    return;
  }

  const extractText = (cellHtml: string): string => {
    return cellHtml
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .trim();
  };

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(extractText(cellMatch[1]));
    }

    if (cells.length < 2) continue;

    const licenseNumber = cells[0];
    const businessName = cells[1];
    const city = cells.length > 2 ? cells[2] : '';

    if (!licenseNumber || !businessName || licenseNumber === 'License Number') continue;

    totalRecords++;
    console.log(`[NewYorkPhase2] Fallback processing: ${businessName} (${licenseNumber})`);

    try {
      await upsertNYOrganizer({ businessName, licenseNumber, city });
      createdOrganizers++;

      await new Promise((r) => setTimeout(r, RATE_DELAY_MS));
    } catch (err) {
      console.error(`[NewYorkPhase2] Error in fallback processing ${businessName}:`, err);
    }
  }

  console.log(
    `[NewYorkPhase2] Fallback completed: ${totalRecords} records, ${createdOrganizers} created`
  );
}

async function upsertNYOrganizer({
  businessName,
  licenseNumber,
  city,
}: {
  businessName: string;
  licenseNumber: string;
  city: string;
}): Promise<void> {
  const existing = await prisma.organizer.findFirst({
    where: {
      businessName: { equals: businessName, mode: 'insensitive' },
      licenseState: 'NY',
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.organizer.update({
      where: { id: existing.id },
      data: {
        licenseNumber,
        licenseState: 'NY',
        isStateLicensed: true,
        directoryMostRecentSource: 'NewYorkPhase2',
        directoryMostRecentAt: new Date(),
      },
    });
  } else {
    const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
    const citySlug = (city || 'ny').toLowerCase().replace(/[^a-z0-9]/g, '-');
    await prisma.organizer.create({
      data: {
        businessName,
        phone: null,
        address: city ? `${city}, NY` : 'New York',
        city: city || 'New York',
        state: 'NY',
        bio: `Licensed pawnbroker in ${city || 'New York'}.`,
        isClaimed: false,
        isUnmanagedListing: true,
        licenseNumber,
        licenseState: 'NY',
        isStateLicensed: true,
        businessCategory: 'PAWN_SHOP',
        directoryMostRecentSource: 'NewYorkPhase2',
        directoryMostRecentAt: new Date(),
        user: {
          create: {
            email: `scraper+${slug}-${citySlug}-ny-nyphase2@system.finda.sale`,
            name: businessName,
            password: null,
            role: 'ORGANIZER',
            roles: ['ORGANIZER'],
          },
        },
      },
    });
  }
}
