/**
 * Vermont Secretary of State — Auctioneer License Scraper
 *
 * SOURCE CHANGE: The original URL (www.sec.state.vt.us) is dead — DNS ENOTFOUND.
 * Vermont rebranded to sos.vermont.gov, which is behind Imperva/Incapsula bot
 * protection and returns a JS challenge page to all non-browser clients.
 *
 * The licensing portal migrated to a Pega-based system at:
 *   https://secure.professionals.vermont.gov/prweb/PRServletCustom?UserIdentifier=LicenseLookupGuestUser
 * This portal (also behind Imperva) requires:
 *   - Browser-rendered JS to initialize session state and CSRF tokens
 *   - Interactive form submission with encrypted action parameters
 *   - A "Roster Download" flow (NGLPGenerateRosterDownload activity) that opens
 *     a separate authenticated window — not accessible via server-side fetch
 *
 * No public CSV, open-data export, or unauthenticated REST endpoint exists for
 * Vermont auctioneer licenses. This scraper cannot be implemented without a
 * headless browser (Playwright/Puppeteer) or a manual data export arrangement
 * with the Vermont Office of Professional Regulation.
 *
 * This function exits cleanly so the scheduler does not keep firing and logging
 * DNS failures or retry loops.
 *
 * ADR-073: Directory Scraper Phase 1 — State licensing data
 * Blocked: Vermont portal requires headless browser — tracked for Phase 2
 */

/**
 * Vermont auctioneer license scraper — currently non-operational.
 *
 * Vermont's licensing data is behind Imperva bot protection and a Pega-based
 * portal that requires JS session initialization. A simple HTTP fetch cannot
 * access the data. This function exits cleanly rather than retrying dead URLs.
 *
 * To unblock: implement a Playwright-based scraper targeting
 * https://secure.professionals.vermont.gov with the "Roster Download" flow
 * (ProductCategoryID PC021 = Auctioneers), or contact the Vermont Office of
 * Professional Regulation for a direct data export.
 */
export async function runVermontLicensingScraper(): Promise<void> {
  console.warn(
    '[VermontLicensing] Scraper is not operational: Vermont licensing portal ' +
      '(secure.professionals.vermont.gov) requires a headless browser to access. ' +
      'The original URL (www.sec.state.vt.us) is decommissioned — DNS ENOTFOUND. ' +
      'Skipping without error to prevent scheduler retry loops. ' +
      'To fix: implement Playwright-based scraper for NGLPGenerateRosterDownload ' +
      '(ProductCategoryID PC021) or contact Vermont OPR for a data export.'
  );
  // Return cleanly — do not throw, so the scheduler marks this run as completed
  // rather than triggering exponential-backoff retries against a dead host.
}
