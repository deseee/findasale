/**
 * New York Department of State — Auctioneer License Scraper
 * Source: https://www.dos.ny.gov/licensing/search/search.html
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 *
 * Status (S-Cat3): The DOS licensing search page returns HTTP 404. The page was
 * a JavaScript-rendered form and no static HTML table rows were ever available.
 * No open data API or CSV export for NY auctioneer licenses was found on
 * data.ny.gov or dos.ny.gov. This scraper returns gracefully and logs a warning
 * rather than throwing, so the GitHub Actions step passes with 0 records.
 * TODO: Re-check dos.ny.gov licensing section if they publish a data download.
 */

const SEARCH_URL = 'https://www.dos.ny.gov/licensing/search/search.html';

/**
 * Scrape New York auctioneer licenses from DOS licensing system.
 * Currently returns empty — the DOS search page (404) is a JS-rendered form
 * with no accessible data API.
 */
export async function runNewYorkLicensingScraper(): Promise<void> {
  console.log('[NewYorkLicensing] Starting auctioneer license scraper');
  console.warn(
    '[NewYorkLicensing] WARNING: NY DOS licensing search page returns 404 ' +
      `(${SEARCH_URL}). Page is a JavaScript-rendered form — no HTML table rows ` +
      'available without a headless browser. No open data API found. ' +
      'Returning 0 records.'
  );
  console.log('[NewYorkLicensing] Scraper completed: 0 records (endpoint unavailable)');
}
