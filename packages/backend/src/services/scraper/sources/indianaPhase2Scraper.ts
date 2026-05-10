/**
 * Indiana — Secondary Sale License Scraper (Phase 2) — STUB
 *
 * STATUS: No freely accessible source available.
 * This scraper returns 0 results cleanly and logs a clear diagnostic message.
 *
 * ATTEMPTED SOURCES (confirmed blocked or paid-only):
 *
 *   1. Indiana Professional Licensing Agency (PLA) — auctioneers
 *      https://www.in.gov/pla/professions/auctioneer/
 *      PLA licensee list downloads require paid subscription or records request.
 *      Interactive search only at: https://mylicense.in.gov/
 *
 *   2. Indiana SOS Business Entity Search
 *      https://bsd.sos.in.gov/publicbusinesssearch
 *      Requires interactive ASP.NET session; no bulk CSV download available.
 *
 *   3. NMLS Consumer Access — pawnbrokers
 *      DNS-blocked from GitHub Actions runners (ENOTFOUND).
 *
 * UNBLOCKING OPTIONS (in priority order):
 *
 *   Option A — Indiana PLA bulk licensee data:
 *     File a public records request for current auctioneer licensee CSV.
 *       Indiana PLA: https://www.in.gov/pla/
 *       Email: pla8@pla.in.gov
 *
 *   Option B — Indiana SOS bulk business data:
 *     Contact Indiana SOS for bulk CSV export of business entities.
 *       https://www.in.gov/sos/business/
 *
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 */

/**
 * Indiana secondary sale license scraper — Phase 2.
 *
 * Currently a no-op stub. PLA licensee downloads require paid access.
 * See file header for confirmed details and unblocking options.
 */
export async function runIndianaPhase2Scraper(): Promise<void> {
  console.log(
    '[IndianaPhase2] STUB — PLA licensee list download is paid-only; no free bulk source available.'
  );
  console.log(
    '[IndianaPhase2] Indiana auctioneer licenses managed by PLA (mylicense.in.gov). Pawnbroker registry via NMLS (DNS-blocked from CI).'
  );
  console.log(
    '[IndianaPhase2] See file header for unblocking options (PLA records request or SOS bulk data).'
  );
  console.log('[IndianaPhase2] Fetched: 0, Matched: 0, Upserted: 0');
}
