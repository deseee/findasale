/**
 * New Hampshire — Secondary Sale License Scraper (Phase 2) — STUB
 *
 * STATUS: No freely accessible bulk source available from GitHub Actions runners.
 * This scraper returns 0 results cleanly and logs a clear diagnostic message.
 *
 * ATTEMPTED SOURCES (confirmed blocked or limited):
 *
 *   1. NH Office of Professional Licensure and Certification (OPLC) — auctioneers
 *      https://www.oplc.nh.gov/auctioneers
 *      Auctioneer list is published as a basic HTML lookup (lplb.nh.gov/lookup).
 *      No bulk download; requires individual lookups per credential type.
 *
 *   2. NH pawnbroker licensing
 *      Pawnbroker licenses are issued at the municipal level in NH (no state registry).
 *      No statewide data source exists.
 *
 *   3. NH SOS Business Entity Search — quickstart.sos.nh.gov
 *      Keyword search only; no bulk export or CSV download.
 *
 * UNBLOCKING OPTIONS (in priority order):
 *
 *   Option A — OPLC public records request for auctioneer licensee list:
 *     Contact NH OPLC for bulk CSV of active auctioneer credentials.
 *       https://www.oplc.nh.gov/
 *       Email: oplc@oplc.nh.gov | Phone: (603) 271-2152
 *
 *   Option B — NH SOS bulk business entity data:
 *     NH SOS may provide bulk data on request.
 *       https://sos.nh.gov/corporations/
 *
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 */

/**
 * New Hampshire secondary sale license scraper — Phase 2.
 *
 * Currently a no-op stub. OPLC auctioneer list has no bulk download;
 * pawnbroker licensing is municipal only.
 * See file header for confirmed details and unblocking options.
 */
export async function runNewHampshirePhase2Scraper(): Promise<void> {
  console.log(
    '[NewHampshirePhase2] STUB — OPLC auctioneer list has no bulk download; pawn licensing is municipal-only in NH.'
  );
  console.log(
    '[NewHampshirePhase2] NH auctioneers regulated by OPLC (oplc.nh.gov). No statewide pawnbroker registry.'
  );
  console.log(
    '[NewHampshirePhase2] See file header for unblocking options (OPLC records request).'
  );
  console.log('[NewHampshirePhase2] Fetched: 0, Matched: 0, Upserted: 0');
}
