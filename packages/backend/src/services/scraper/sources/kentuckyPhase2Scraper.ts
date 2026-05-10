/**
 * Kentucky — Secondary Sale License Scraper (Phase 2) — STUB
 *
 * STATUS: No accessible source available from GitHub Actions runners.
 * This scraper returns 0 results cleanly and logs a clear diagnostic message.
 *
 * ATTEMPTED SOURCES (pending investigation):
 *
 *   1. Kentucky Auctioneers Association / KY Board of Auctioneers — kyauctioneers.org
 *      Static HTML; no downloadable licensee CSV or API. Roster is manual/form-gated.
 *
 *   2. Kentucky Secretary of State business search — sos.ky.gov/bus/business/Pages/default.aspx
 *      ASPX portal; 403 or session-cookie required from automated requests.
 *
 *   3. KY Pawnbroker licensing — ky.gov / Office of Financial Institutions
 *      Pawnshop licenses managed by KY OFI. No public API or bulk download confirmed.
 *
 * UNBLOCKING OPTIONS (in priority order):
 *
 *   Option A — KY SOS Bulk Business Data:
 *     Contact Kentucky Secretary of State for bulk entity CSV.
 *       https://www.sos.ky.gov/bus/business/Pages/default.aspx
 *       Phone: (502) 564-3490
 *
 *   Option B — KY OFI Pawnbroker Roster:
 *     File an Open Records request for current active pawnshop licensees.
 *       https://kfi.ky.gov/
 *
 *   Option C — Residential proxy:
 *     Route requests through a residential proxy to bypass cloud-IP blocks.
 *     Gate on: process.env.SCRAPER_API_KEY being set.
 *
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 */

/**
 * Kentucky secondary sale license scraper — Phase 2.
 *
 * Currently a no-op stub. All attempted sources fail from GH Actions runners.
 * See file header for confirmed failure details and unblocking options.
 */
export async function runKentuckyPhase2Scraper(): Promise<void> {
  console.log(
    '[KentuckyPhase2] STUB — no accessible source available from GitHub Actions runners.'
  );
  console.log(
    '[KentuckyPhase2] KY SOS portal requires interactive session. KY OFI pawnshop roster has no public API.'
  );
  console.log(
    '[KentuckyPhase2] See file header for unblocking options (bulk data request, OFI ORA, or proxy).'
  );
  console.log('[KentuckyPhase2] Fetched: 0, Matched: 0, Upserted: 0');
}
