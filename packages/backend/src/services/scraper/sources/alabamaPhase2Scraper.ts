/**
 * Alabama — Secondary Sale License Scraper (Phase 2) — STUB
 *
 * STATUS: No accessible source available from GitHub Actions runners.
 * This scraper returns 0 results cleanly and logs a clear diagnostic message.
 *
 * ATTEMPTED SOURCES (pending investigation):
 *
 *   1. Alabama Pawnshop Act licensees — alea.gov / ABD (Alcoholic Beverage Control)
 *      Pawnbroker licenses in AL are issued county-by-county; no statewide portal exists.
 *
 *   2. Alabama Auctioneers Commission — alea.gov/auc
 *      Site requires interactive ASP.NET session; blocked from CI runner IPs.
 *
 *   3. AL SOS Business Entities — arc.sos.alabama.gov
 *      Requires POST-based session cookie; 403 from automated requests.
 *
 * UNBLOCKING OPTIONS (in priority order):
 *
 *   Option A — AL SOS Bulk Business Data:
 *     Contact Alabama Secretary of State Corporations Division for bulk CSV export.
 *       https://www.sos.alabama.gov/government-records/business-entity-records
 *       Phone: (334) 242-5324
 *
 *   Option B — AL Auctioneers Commission licensee list:
 *     File an Open Records request for current active licensee CSV.
 *       https://alea.gov/divisions/auctioneers
 *
 *   Option C — Residential proxy:
 *     Route requests through a residential proxy to bypass cloud-IP blocks.
 *     Gate on: process.env.SCRAPER_API_KEY being set.
 *
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 */

/**
 * Alabama secondary sale license scraper — Phase 2.
 *
 * Currently a no-op stub. All attempted sources fail from GH Actions runners.
 * See file header for confirmed failure details and unblocking options.
 */
export async function runAlabamaPhase2Scraper(): Promise<void> {
  console.log(
    '[AlabamaPhase2] STUB — no accessible source available from GitHub Actions runners.'
  );
  console.log(
    '[AlabamaPhase2] AL pawnbroker licenses are county-issued (no statewide portal). AL Auctioneers portal requires interactive session.'
  );
  console.log(
    '[AlabamaPhase2] See file header for unblocking options (bulk data request, ORA, or proxy).'
  );
  console.log('[AlabamaPhase2] Fetched: 0, Matched: 0, Upserted: 0');
}
