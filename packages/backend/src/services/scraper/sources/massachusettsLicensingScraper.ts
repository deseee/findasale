/**
 * Massachusetts Auctioneer License Scraper
 * Source: https://openapi.oca.state.ma.us/api/v1/professional-licenses?lictype=AUCTNR
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 *
 * Status (S-Cat3): The OCA API endpoint (openapi.oca.state.ma.us) is currently
 * unreachable — DNS resolution fails (curl exit code 6). The host appears to be
 * decommissioned or renamed. This scraper returns gracefully and logs a warning
 * rather than throwing, so the GitHub Actions step passes with 0 records.
 * NOTE (BLOCKED): Find replacement endpoint when MA OCA publishes a new API.
 */

const MASSACHUSETTS_API_URL =
  'https://openapi.oca.state.ma.us/api/v1/professional-licenses?lictype=AUCTNR';

/**
 * Scrape Massachusetts auctioneer licenses from OCA professional licenses API.
 * Currently returns empty due to endpoint being unreachable.
 */
export async function runMassachusettsLicensingScraper(): Promise<void> {
  console.log('[MassachusettsLicensing] Starting auctioneer license scraper');
  console.warn(
    '[MassachusettsLicensing] WARNING: API endpoint unreachable — ' +
      `${MASSACHUSETTS_API_URL} DNS resolution fails. ` +
      'Skipping scraper and returning 0 records. ' +
      'Update endpoint URL when MA OCA publishes replacement API.'
  );
  console.log('[MassachusettsLicensing] Scraper completed: 0 records (endpoint down)');
}
