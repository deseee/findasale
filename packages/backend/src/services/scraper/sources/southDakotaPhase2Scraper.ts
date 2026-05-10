/**
 * South Dakota — Secondary Sale License Scraper (Phase 2) — STUB
 *
 * STATUS: No freely accessible bulk source available.
 * This scraper returns 0 results cleanly and logs a clear diagnostic message.
 *
 * ATTEMPTED SOURCES (confirmed blocked or paid-only):
 *
 *   1. SD Secretary of State bulk business entity download
 *      https://sosenterprise.sd.gov/BusinessServices/Business/FilingSearch.aspx
 *      SOS paid bulk download; no free CSV export.
 *      Per scraper-data-sources-50-states.md: "SOS paid bulk download".
 *
 *   2. SD pawnbroker licensing — municipal only
 *      Pawnbroker licenses in SD are issued at the city/municipal level.
 *      Per scraper-data-sources-50-states.md: "pawn municipal".
 *      No statewide registry exists.
 *
 *   3. SD Division of Banking — pawnbrokers/secondhand dealers
 *      https://dlr.sd.gov/banking/
 *      No public bulk data download; licenses may require records request.
 *
 *   4. NMLS Consumer Access — pawnbrokers
 *      DNS-blocked from GitHub Actions runners (ENOTFOUND).
 *
 * UNBLOCKING OPTIONS (in priority order):
 *
 *   Option A — SD SOS bulk business data purchase:
 *     Purchase bulk entity data from SD SOS.
 *       https://sosenterprise.sd.gov/ | Phone: (605) 773-4845
 *
 *   Option B — SD Division of Banking public records request:
 *     Request active pawnbroker/secondhand dealer list.
 *       https://dlr.sd.gov/banking/
 *
 *   Option C — Priority city-level scraping (Sioux Falls, Rapid City):
 *     Scrape Sioux Falls and Rapid City business license portals directly.
 *
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 */

/**
 * South Dakota secondary sale license scraper — Phase 2.
 *
 * Currently a no-op stub. SOS bulk data is paid; pawnbroker licensing is municipal.
 * See file header for confirmed details and unblocking options.
 */
export async function runSouthDakotaPhase2Scraper(): Promise<void> {
  console.log(
    '[SouthDakotaPhase2] STUB — SOS bulk download is paid; pawnbroker licensing is municipal-level in SD.'
  );
  console.log(
    '[SouthDakotaPhase2] No statewide pawnbroker registry. SD SOS requires paid subscription for bulk data.'
  );
  console.log(
    '[SouthDakotaPhase2] See file header for unblocking options (SOS purchase, banking records request, or city-level scraping).'
  );
  console.log('[SouthDakotaPhase2] Fetched: 0, Matched: 0, Upserted: 0');
}
