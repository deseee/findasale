/**
 * California Department of Consumer Affairs — Auctioneer License Scraper
 * Source: https://search.dca.ca.gov/
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 *
 * Status (S-Cat3): California DCA does not regulate auctioneers. The DCA dropdown
 * has no "Auctioneer" board entry — only medical, professional, and trade boards.
 * California does not have a statewide auctioneer licensing requirement; auctioneers
 * operate under business/seller permits and are regulated locally.
 * The previous scraper incorrectly POSTed ASP.NET ViewState form data to a React
 * SPA endpoint (search.dca.ca.gov/api/v1/License — which returns 404).
 * Returns gracefully with 0 records rather than throwing.
 * TODO: Investigate California Secretary of State or county-level auction data.
 */

const CALIFORNIA_DCA_URL = 'https://search.dca.ca.gov/';

/**
 * Scrape California auctioneer licenses.
 * Currently returns empty — CA DCA does not license auctioneers; the original
 * endpoint (api/v1/License) returns 404 and no Auctioneer board exists in DCA.
 */
export async function runCaliforniaLicensingScraper(): Promise<void> {
  console.log('[CaliforniaLicensing] Starting auctioneer license scraper');
  console.warn(
    '[CaliforniaLicensing] WARNING: California DCA does not regulate auctioneers. ' +
      `No "Auctioneer" board exists in the DCA dropdown (${CALIFORNIA_DCA_URL}). ` +
      'The previous endpoint (api/v1/License) returns 404. ' +
      'CA has no statewide auctioneer license requirement. ' +
      'Returning 0 records.'
  );
  console.log('[CaliforniaLicensing] Scraper completed: 0 records (no state auctioneer license in CA)');
}
