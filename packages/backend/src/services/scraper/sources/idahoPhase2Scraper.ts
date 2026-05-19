/**
 * Idaho DOPL — Auctioneer License Scraper (Phase 2)
 * Source: Idaho Division of Occupational and Professional Licenses (DOPL)
 *   Public license lookup: https://edopl.idaho.gov/OnlineServices/?link=PubListSearch
 *
 * NOTE: Idaho DOPL does NOT regulate auctioneers at the state level — auctioneers
 * are not listed among DOPL boards. The edopl.idaho.gov public search system is a
 * JS-rendered ASP.NET application (FWDC/WDC framework) that requires cookies and
 * interactive JavaScript. The elitepublic.dopl.idaho.gov subdomain does not resolve.
 *
 * This scraper attempts a best-effort approach:
 *   1. Fetches the PubListSearch page with cookie support
 *   2. Looks for any auctioneer-related board/profession options
 *   3. If the page is JS-rendered (no HTML form elements), logs diagnostic and returns
 *
 * UNBLOCKING OPTIONS:
 *   Option A — Playwright/headless browser to render the JS-based search
 *   Option B — Contact DOPL for bulk licensee data (if auctioneers are ever added)
 *     https://dopl.idaho.gov/contact/  Phone: (208) 334-3233
 *   Option C — File a public records request for current licensee roster
 *
 * ADR-073: Directory Scraper Phase 2 — State auctioneer licensing data
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';

const DOPL_DOMAIN = 'edopl.idaho.gov';
const PUB_LIST_SEARCH_URL = 'https://edopl.idaho.gov/OnlineServices/?link=PubListSearch';

// False-positive name fragments — exclude row if business name contains any of these
const EXCLUDE_FRAGMENTS = [
  'real estate',
  'realty',
  'realtor',
  'mortgage',
  'bank',
  'credit union',
  'financial',
  'insurance',
  'law office',
  'attorney',
  'lawyer',
  'dental',
  'dentist',
  'medical',
  'clinic',
  'pharmacy',
  'hospital',
  'restaurant',
  'hotel',
  'motel',
];

/**
 * Return true if the name contains a false-positive fragment.
 */
function nameIsExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Extract text from an HTML cell, stripping tags and decoding entities.
 */
function extractText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/**
 * Idaho DOPL auctioneer license scraper — Phase 2.
 *
 * Attempts to fetch the public list search from edopl.idaho.gov.
 * The system is JS-rendered (ASP.NET FWDC framework), so static HTML
 * parsing is unlikely to yield results. This scraper detects that case
 * and logs diagnostics rather than silently returning zero.
 */
export async function runIdahoPhase2Scraper(): Promise<void> {
  console.log('[Idaho Phase2] Starting auctioneer license scraper — Idaho DOPL');
  console.log(`[Idaho Phase2] Source: ${PUB_LIST_SEARCH_URL}`);

  let totalFetched = 0;
  let totalMatched = 0;
  let totalUpserted = 0;

  try {
    // Step 1: Fetch the public list search page with cookies enabled
    await defaultRateLimiter.waitBeforeRequest(DOPL_DOMAIN);

    const pageResponse = await fetch(PUB_LIST_SEARCH_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
    });

    if (!pageResponse.ok) {
      console.warn(`[Idaho Phase2] DOPL portal returned HTTP ${pageResponse.status}`);
      throw new Error(`Idaho DOPL returned HTTP ${pageResponse.status}`);
    }

    const html = await pageResponse.text();

    // Step 2: Check if the page is JS-rendered (no usable HTML form)
    const isJsRendered =
      html.includes('FWDC.loadManager') ||
      html.includes('Javascript must be enabled') ||
      (html.includes('cookies disabled') && !html.includes('<select'));

    if (isJsRendered) {
      // Check if there are any table rows despite JS rendering
      const hasTable = /<table[\s\S]*?<\/table>/i.test(html);

      if (!hasTable) {
        console.warn(
          '[Idaho Phase2] Portal is JS-rendered (ASP.NET FWDC framework) — no static HTML table available.'
        );
        console.warn(
          '[Idaho Phase2] Idaho DOPL does not list auctioneers among regulated professions.'
        );
        console.warn(
          '[Idaho Phase2] Requires Playwright/headless browser or bulk data request to proceed.'
        );
        throw new Error(
          'Idaho DOPL is JS-rendered and does not regulate auctioneers — no data available via static fetch'
        );
      }
    }

    // Step 3: Look for auctioneer-related content in the page
    const hasAuctioneerContent =
      /auctioneer/i.test(html) || /auction/i.test(html);

    if (!hasAuctioneerContent) {
      console.warn(
        '[Idaho Phase2] No auctioneer-related content found on DOPL search page.'
      );
      console.warn(
        '[Idaho Phase2] Idaho does not regulate auctioneers at the state level via DOPL.'
      );
      throw new Error('No auctioneer licensing data found on Idaho DOPL');
    }

    // Step 4: Parse any HTML table rows that might contain results
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
    const rows = html.match(rowRegex) || [];

    console.log(`[Idaho Phase2] Found ${rows.length} table rows`);

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cellRegex = /<td[^>]*>[\s\S]*?<\/td>/gi;
      const cells = row.match(cellRegex) || [];

      if (cells.length < 2) continue;

      // Try to extract name, license number, city from cells
      // Column order depends on the specific page layout
      const businessName = extractText(cells[0]);
      const licenseNumber = cells.length > 1 ? extractText(cells[1]) : '';
      const city = cells.length > 2 ? extractText(cells[2]) : '';
      const licenseType = cells.length > 3 ? extractText(cells[3]) : '';

      if (!businessName) continue;

      // Filter to auction-related licenses only
      const nameAndType = `${businessName} ${licenseType}`.toLowerCase();
      if (
        !nameAndType.includes('auction') &&
        !nameAndType.includes('auctioneer')
      ) {
        continue;
      }

      // Apply exclude filter
      if (nameIsExcluded(businessName)) continue;

      totalFetched++;
      totalMatched++;

      console.log(
        `[Idaho Phase2] Matched: ${businessName} (License: ${licenseNumber}) in ${city || 'Idaho'}`
      );

      try {
        const orgId = await getOrCreateScrapedOrganizer(
          businessName,             // businessName
          'IdahoPhase2',            // sourceName
          city || 'Idaho',          // city
          'ID',                     // state
          undefined,                // esnOrgId
          undefined,                // googlePlaceId
          undefined,                // foursquareVenueId
          undefined,                // hereBusinessId
          'AUCTION_HOUSE',          // businessCategory
          undefined,                // contactEmail
          undefined,                // phone
          undefined,                // website
          undefined,                // lat
          undefined,                // lng
          true,                     // isStateLicensed
          'Idaho',                  // licenseState
          licenseNumber || undefined, // licenseNumber
          'Idaho DOPL Auctioneer Roster' // sourceLabel
        );
        if (orgId) totalUpserted++;
      } catch (upsertErr) {
        console.error(
          `[Idaho Phase2] Upsert error for "${businessName}":`,
          upsertErr
        );
      }
    }

    if (totalFetched === 0) {
      throw new Error(
        'Idaho Phase2 scraper completed but found zero auctioneer records'
      );
    }

    console.log(
      `[Idaho Phase2] Done — fetched: ${totalFetched}, matched: ${totalMatched}, upserted: ${totalUpserted}`
    );
  } catch (error) {
    console.error('[Idaho Phase2] Scraper error:', error);
    throw error;
  }
}
