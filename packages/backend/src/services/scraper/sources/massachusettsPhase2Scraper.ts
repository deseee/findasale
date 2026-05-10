/**
 * Massachusetts — Secondary Sale License Scraper (Phase 2) — STUB
 *
 * STATUS: No freely accessible bulk source available.
 * This scraper returns 0 results cleanly and logs a clear diagnostic message.
 *
 * ATTEMPTED SOURCES (confirmed blocked or records-request-only):
 *
 *   1. Massachusetts Division of Standards — auctioneer licenses
 *      https://www.mass.gov/orgs/division-of-standards
 *      Licensee CSV requires public records request to Division of Standards.
 *      No public bulk download portal exists.
 *
 *   2. Massachusetts eLicensing portal
 *      https://elicensing.state.ma.us/
 *      Requires interactive session; no API or bulk download available.
 *
 *   3. MA SOS Business Entity Search — corps.sec.state.ma.us
 *      Name-only keyword search, no business category codes; returns too many false positives.
 *
 *   4. NMLS Consumer Access — pawnbrokers
 *      DNS-blocked from GitHub Actions runners (ENOTFOUND).
 *
 * UNBLOCKING OPTIONS (in priority order):
 *
 *   Option A — MA Division of Standards public records request:
 *     Contact Division of Standards for full auctioneer licensee CSV.
 *       https://www.mass.gov/orgs/division-of-standards
 *       Email: dos.media@mass.gov
 *       Per scraper-data-sources-50-states.md: FOIA to Division of Standards is the confirmed path.
 *
 *   Option B — MA SOS bulk corporation data:
 *     https://corp.sec.state.ma.us/CorpWeb/CorpSearch/CorpSearch.aspx
 *     Bulk download may be available via public records request.
 *
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 */

/**
 * Massachusetts secondary sale license scraper — Phase 2.
 *
 * Currently a no-op stub. Division of Standards licensee data requires records request.
 * See file header for confirmed details and unblocking options.
 */
export async function runMassachusettsPhase2Scraper(): Promise<void> {
  console.log(
    '[MassachusettsPhase2] STUB — Division of Standards licensee CSV requires public records request; no free bulk source available.'
  );
  console.log(
    '[MassachusettsPhase2] MA auctioneer licenses managed by Division of Standards. Pawnbroker registry via NMLS (DNS-blocked from CI).'
  );
  console.log(
    '[MassachusettsPhase2] See file header for unblocking options (Division of Standards records request).'
  );
  console.log('[MassachusettsPhase2] Fetched: 0, Matched: 0, Upserted: 0');
}
