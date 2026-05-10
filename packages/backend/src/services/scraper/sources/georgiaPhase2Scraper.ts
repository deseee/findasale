/**
 * Georgia — Secondary Sale License Scraper (Phase 2) — STUB
 *
 * STATUS: Both previously attempted sources are unreachable from GitHub Actions runners.
 * This scraper returns 0 results cleanly and logs a clear diagnostic message.
 *
 * CONFIRMED FAILURES (verified May 2026):
 *
 *   1. NMLS Consumer Access API (api.nmlsconsumeraccess.org)
 *      Error: ENOTFOUND — DNS does not resolve from GH Actions runner IPs.
 *      The public NMLS Consumer Access portal requires browser-based session
 *      tokens. The API hostname is not publicly routable from CI environments.
 *
 *   2. GA SOS Auctioneers Commission page (sos.ga.gov/page/auctioneers-and-auction-firms)
 *      Error: HTTP 403 — Cloudflare blocks all non-browser requests.
 *      The sos.ga.gov domain returns 403 for all automated requests regardless
 *      of User-Agent spoofing.
 *
 *   3. data.georgia.gov (Socrata catalog)
 *      Error: SSL cert mismatch (Acquia CMS, not a Socrata portal).
 *      No auctioneer, pawnbroker, or secondhand dealer datasets found.
 *
 *   4. opendata.atlantaga.gov
 *      Error: SSL cert mismatch (Azure). Portal unreachable.
 *
 *   5. GA DOR dealers list (dor.georgia.gov/dealers)
 *      Error: HTTP 404 / Cloudflare-protected Drupal site.
 *
 *   6. api.us.socrata.com catalog search for Georgia licensing data
 *      Result: 0 datasets matching auctioneer, pawnbroker, or secondhand dealer.
 *
 * UNBLOCKING OPTIONS (in priority order):
 *
 *   Option A — GA SOS Bulk Business Data (best path):
 *     The GA Secretary of State sells bulk business entity data as a downloadable
 *     CSV/Excel file. Contact the Corporations Division:
 *       https://sos.ga.gov/page/commercial-bulk-data-sales
 *       Phone: (404) 656-2817
 *     A one-time or annual purchase provides a full CSV of all registered entities
 *     which can be filtered by business name keywords offline and ingested via a
 *     local import script (no GH Actions network dependency).
 *
 *   Option B — GA DOR Pawnbroker Registry (second best):
 *     The Georgia Department of Revenue licenses pawnbrokers. A public list may be
 *     available on request or via an open records request (FOIA/ORA):
 *       https://dor.georgia.gov/dealers
 *     Contact: [email protected]
 *     An ORA request for "current active pawnbroker license holders" as a CSV
 *     should be grantable under GA ORA (O.C.G.A. § 50-18-70 et seq.).
 *
 *   Option C — GA Auctioneers Commission direct data request:
 *     The GA Auctioneers Commission (under GA SOS) maintains a licensee database.
 *     Request the public roster as a CSV or spreadsheet:
 *       https://sos.ga.gov/page/auctioneers-commission
 *       Phone: (478) 207-2440
 *     Public licensee lists are releasable under GA ORA.
 *
 *   Option D — ScraperAPI / residential proxy via SCRAPER_API_KEY env var:
 *     If a paid proxy service is added, sos.ga.gov 403s can likely be bypassed.
 *     The scraper can be unblocked by routing requests through a residential proxy.
 *     Gate on: process.env.SCRAPER_API_KEY being set.
 *
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 */

/**
 * Georgia secondary sale license scraper — Phase 2.
 *
 * Currently a no-op stub. All previously attempted sources fail from GH Actions.
 * See file header for confirmed failure details and unblocking options.
 */
export async function runGeorgiaPhase2Scraper(): Promise<void> {
  console.log(
    '[GeorgiaPhase2] STUB — no accessible source available from GitHub Actions runners.'
  );
  console.log(
    '[GeorgiaPhase2] Both attempted sources fail: NMLS API (ENOTFOUND) and GA SOS page (HTTP 403).'
  );
  console.log(
    '[GeorgiaPhase2] See file header for unblocking options (bulk data purchase, ORA request, or proxy).'
  );
  console.log('[GeorgiaPhase2] Fetched: 0, Matched: 0, Upserted: 0');
}
