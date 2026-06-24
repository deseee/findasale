/**
 * Rhode Island Department of Business Regulation — Auctioneer License Scraper
 * Scrapes licensed auctioneers from Rhode Island DBR auctioneer license search
 * Source: https://dbr.ri.gov/about-dbr/lookup-license (updated 2026 — old URL 404; RI repealed general auctioneer license in 2015)
 * Public directory with auctioneer records
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 */

import { RateLimiter, defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const RHODEISLAND_DBR_BASE_URL = 'https://dbr.ri.gov';
// NOTE: RI repealed the general auctioneer license requirement in 2015. Motor vehicle
// auctioneers may still be licensed. DBR lookup portal moved; old URL was 404.
const SEARCH_URL = 'https://dbr.ri.gov/about-dbr/lookup-license';

/**
 * Parse an address string into city and state components
 */
function parseAddress(address: string): { city: string } {
  const parts = address.split(',').map((s) => s.trim());
  const city = parts[0] || 'Rhode Island';
  return { city };
}

/**
 * Scrape Rhode Island auctioneer licenses from DBR search.
 * Public directory — no authentication required.
 * Ingests records into Organizer table with RhodeIslandLicensing source attribution.
 */
export async function runRhodeIslandLicensingScraper(): Promise<void> {
  // INTENTIONAL_BREAK: Rhode Island repealed its general auctioneer license requirement in 2015.
  // The DBR lookup page (dbr.ri.gov/about-dbr/lookup-license) is a Drupal CMS page —
  // it does not contain ASP.NET ViewState and does not accept POST search submissions.
  // Motor vehicle auctioneers may still be licensed municipally, but no statewide registry exists.
  // Parked 2026-06 — exits cleanly with 0 records so GitHub Actions does not show failure.
  console.log('[RhodeIslandLicensing] PARKED: RI repealed general auctioneer license (2015). DBR lookup page is not a searchable registry. Exiting cleanly.');
  return;

  // --- ORIGINAL CODE BELOW (unreachable, preserved for reference) ---
  const rateLimiter = defaultRateLimiter;
  const domain = new URL(SEARCH_URL).hostname;
  let totalRecords = 0;
  let createdOrganizers = 0;

  try {
    console.log('[RhodeIslandLicensing] Starting auctioneer license scraper');

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

    // Extract form state if present
    const viewStateMatch = formHtml.match(/name="__VIEWSTATE"\s+value="([^"]+)"/);
    const eventValidationMatch = formHtml.match(/name="__EVENTVALIDATION"\s+value="([^"]+)"/);

    const viewState = viewStateMatch?.[1] ?? '';
    const eventValidation = eventValidationMatch?.[1] ?? '';

    console.log('[RhodeIslandLicensing] Extracted form state');

    // Build form data for search
    const formData = new URLSearchParams();
    if (viewState) formData.append('__VIEWSTATE', viewState);
    if (eventValidation) formData.append('__EVENTVALIDATION', eventValidation);
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

    console.log(`[RhodeIslandLicensing] Found ${rows.length} table rows`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/g;
      const cells = row.match(cellRegex) || [];

      if (cells.length < 3) {
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
      const addressFull = extractText(cells[2] || '');
      const status = extractText(cells[3] || 'Active');

      if (!name || !licenseNum) {
        continue;
      }

      totalRecords++;

      const { city } = parseAddress(addressFull);

      if (status !== 'Active') {
        console.log(
          `[RhodeIslandLicensing] Skipping ${name} (license ${licenseNum}): status=${status}`
        );
        continue;
      }

      console.log(`[RhodeIslandLicensing] Processing: ${name} (License ${licenseNum}) in ${city}, RI`);

      const organizerId = await getOrCreateScrapedOrganizer(
        name,
        'RhodeIslandLicensing',
        city || 'Rhode Island',
        'RI',
        undefined,
        undefined,
        undefined,
        undefined,
        'AUCTION_HOUSE',
        undefined
      );

      if (organizerId) {
        await prisma.organizer.update({
          where: { id: organizerId ?? undefined },
          data: {
            licenseNumber: licenseNum,
            licenseState: 'RI',
            isStateLicensed: true,
          },
        });

        createdOrganizers++;

        if (totalRecords % 50 === 0) {
          console.log(
            `[RhodeIslandLicensing] Progress: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
          );
        }
      }
    }

    console.log(
      `[RhodeIslandLicensing] Scraper completed: processed ${totalRecords} records, created/updated ${createdOrganizers} organizers`
    );
  } catch (error) {
    console.error('[RhodeIslandLicensing] Scraper error:', error);
    throw error;
  }
}
