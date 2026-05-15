/**
 * New Jersey Office of the Auctioneer — Auctioneer License Scraper
 * Source: https://newjersey.mylicense.com/verification/Search.aspx
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 *
 * Status (S-Cat3): The mylicense.com portal serves HTML with ASP.NET session cookie
 * on first request. However, the profession dropdown does NOT include "Auctioneer"
 * as an option — NJ auctioneers are not regulated through the mylicense.com portal.
 * NJ auctioneer licenses are issued by county clerks, not a state board.
 * Returns gracefully with 0 records rather than throwing.
 * TODO: Investigate county-level auctioneer data or NJ Treasury open data.
 */

const SEARCH_URL = 'https://newjersey.mylicense.com/verification/Search.aspx';

/**
 * Scrape New Jersey auctioneer licenses.
 * Currently returns empty — NJ auctioneers are licensed at county level,
 * not through the state mylicense.com portal (which has no Auctioneer profession entry).
 */
export async function runNewJerseyLicensingScraper(): Promise<void> {
  console.log('[NewJerseyLicensing] Starting auctioneer license scraper');
  console.warn(
    '[NewJerseyLicensing] WARNING: NJ mylicense.com portal does not include ' +
      '"Auctioneer" in its profession dropdown. NJ auctioneer licenses are issued ' +
      `by county clerks, not a state board (checked: ${SEARCH_URL}). ` +
      'Returning 0 records.'
  );
  console.log('[NewJerseyLicensing] Scraper completed: 0 records (county-level licensing — no state portal)');
}
