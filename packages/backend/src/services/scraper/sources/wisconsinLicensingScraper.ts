/**
 * Wisconsin Department of Safety — Auctioneer License Scraper
 * Source: https://licensesearch.wi.gov/
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 *
 * Status (S-Cat3): licensesearch.wi.gov redirects to license.wi.gov/s/license-lookup
 * which is a Salesforce Experience Cloud SPA. No HTML table rows are available
 * without a headless browser. The old Accela portal (apps.licenseelookup.wi.gov)
 * returns HTTP 000 (connection refused). No DSPS data export was found at
 * dsps.wi.gov (returns 404). This scraper returns an empty array and logs a
 * warning rather than throwing, so the GitHub Actions step passes with 0 records.
 * NOTE (BLOCKED): Investigate Wisconsin DSPS open data or FOIA request for license list.
 */

const WISCONSIN_BASE_URL = 'https://licensesearch.wi.gov/';

/**
 * Scrape Wisconsin auctioneer licenses from state license search directory.
 * Currently returns empty — the portal is a Salesforce SPA that requires
 * a headless browser; no data download or API was found.
 */
export async function runWisconsinLicensingScraper(): Promise<void> {
  console.log('[WisconsinLicensing] Starting auctioneer license scraper');
  console.warn(
    '[WisconsinLicensing] WARNING: Wisconsin license portal redirects to a ' +
      `Salesforce Experience Cloud SPA (${WISCONSIN_BASE_URL} → license.wi.gov/s/license-lookup). ` +
      'No HTML table rows are accessible without a headless browser. ' +
      'No DSPS data export found. Returning 0 records.'
  );
  console.log('[WisconsinLicensing] Scraper completed: 0 records (SPA — no accessible API)');
}
