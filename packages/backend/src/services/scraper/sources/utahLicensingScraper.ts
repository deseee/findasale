/**
 * Utah Department of Commerce — Division of Professional Licensing — Auctioneer License Scraper
 * Scrapes licensed auctioneers from Utah online license verification system
 * Source: https://secure.utah.gov/llv/search/index.html
 * Public directory with auctioneer records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const UTAH_DPL_BASE_URL = 'https://secure.utah.gov';
const SEARCH_URL = 'https://secure.utah.gov/llv/search/index.html';

/**
 * Returns true for network/infra failures: DNS dead, SSL rejected, connect timeout.
 * Logged as warnings — not thrown to Sentry — because these are site migration issues.
 * Note: Node's native fetch wraps errors as TypeError: fetch failed with the actual
 * ENOTFOUND/ECONNREFUSED code on err.cause, not directly on err.
 */
function isInfrastructureError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message ?? '';
  const code = (err as NodeJS.ErrnoException).code ??
    ((err as { cause?: NodeJS.ErrnoException }).cause?.code) ?? '';
  return (
    msg === 'fetch failed' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    err.name === 'ConnectTimeoutError' ||
    msg.includes('Connect Timeout') ||
    msg.includes('SSL') ||
    msg.includes('ssl3_read_bytes') ||
    msg.includes('tlsv1 alert') ||
    msg.includes('ENOTFOUND')
  );
}

/**
 * Parse an address string into city and state components
 */
function parseAddress(address: string): { city: string } {
  const parts = address.split(',').map((s) => s.trim());
  const city = parts[0] || 'Utah';
  return { city };
}

/**
 * Scrape Utah auctioneer licenses from Division of Professional Licensing search.
 * Public directory — no authentication required.
 * Ingests records into Organizer table with UtahLicensing source attribution.
 */
export async function runUtahLicensingScraper(): Promise<void> {
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[UtahLicensing] Starting auctioneer license scraper');

    // Fetch the search page
    await rateLimiter.waitBeforeRequest(domain);

    const formPageResponse = await fetch(SEARCH_URL, {
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

    // SPA detection: if the page migrated to a React/JS app it won't have VIEWSTATE.
    // Return 0 gracefully rather than throwing to Sentry.
    const viewStateMatch = formHtml.match(/name="__VIEWSTATE"\s+value="([^"]+)"/);
    if (!viewStateMatch) {
      console.warn(
        '[UtahLicensing] No VIEWSTATE found — site may have migrated to a JavaScript SPA. ' +
        'Returning 0 results. TODO: Rewrite with Playwright or REST API.'
      );
      return;
    }
    const eventValidationMatch = formHtml.match(/name="__EVENTVALIDATION"\s+value="([^"]+)"/);

    const viewState = viewStateMatch ? viewStateMatch[1] : '';
    const eventValidation = eventValidationMatch ? eventValidationMatch[1] : '';

    console.log('[UtahLicensing] Extracted form state');

    // Build form data for search
    const formData = new URLSearchParams();
    if (viewState) formData.append('__VIEWSTATE', viewState);
    if (eventValidation) formData.append('__EVENTVALIDATION', eventValidation);
    formData.append('ctl00$ContentPlaceHolder1$ddlProfession', 'Auctioneer');
    formData.append('ctl00$ContentPlaceHolder1$btnSearch', 'Search');

    // Submit search
    await rateLimiter.waitBeforeRequest(domain);

    const searchResponse = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
        Referer: SEARCH_URL,
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(30000),
    });

    if (!searchResponse.ok) {
      throw new Error(`Search failed: ${searchResponse.status}`);
    }

    const html = await searchResponse.text();

    // Parse HTML table rows
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRegex) || [];

    console.log(`[UtahLicensing] Found ${rows.length} table rows`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
      const cells = row.match(cellRegex) || [];

      if (cells.length < 3) {
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
      const addressFull = extractText(cells[2] || '');
      const status = extractText(cells[3] || 'Active');

      if (!name || !licenseNum) {
        continue;
      }

      totalRecords++;

      const { city } = parseAddress(addressFull);

      if (status !== 'Active') {
        console.log(
          `[UtahLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`
        );
        continue;
      }

      console.log(`[UtahLicensing] Processing: ${name} (License ${licenseNum}) in ${city}, UT`);

      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'UtahLicensing',
        city || 'Utah',
        'UT',
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
            licenseState: 'UT',
            isStateLicensed: true,
          },
        });

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[UtahLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[UtahLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    if (isInfrastructureError(error)) {
      console.warn('[UtahLicensing] Infrastructure failure (site moved/unreachable):', (error as Error).message);
      return;
    }
    console.error('[UtahLicensing] Scraper error:', error);
    throw error;
  }
}
