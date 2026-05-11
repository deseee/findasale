/**
 * Missouri Pawnbroker License Scraper (Phase 2) — NO STATE DATA SOURCE
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data
 *
 * STATUS: GRACEFUL NO-OP — Missouri pawnbrokers are licensed at the LOCAL level only.
 *
 * Per finance.mo.gov (confirmed 2025-05-11):
 *   "The Division does not have any regulatory authority over pawnbrokers and pawnshops.
 *    The Missouri Legislature has placed the authority to license and regulate pawnbrokers
 *    and pawnshops with local governments."
 *   See: https://finance.mo.gov/consumer-credit-licensing (Pawn Shops section)
 *        RSMo §§367.011–367.060 (no statewide licensing registry)
 *
 * Previous URLs (both 404 as of 2025-05-11):
 *   - https://finance.mo.gov/banking/pawnbrokers/ → 404
 *   - https://dci.mo.gov/licensing/search → 404
 *
 * UNBLOCKING: No statewide portal exists. Options:
 *   1. Contact MO municipalities individually (Kansas City, St. Louis, etc.)
 *   2. NMLS Consumer Access for MO mortgage lenders (different license category)
 *   3. Accept MO pawnbroker gap — MO auctioneer data available via missouriLicensingScraper.ts
 */

export async function runMissouriPhase2Scraper(): Promise<void> {
  // MO pawnbrokers are licensed at the local/county level only — no statewide registry exists.
  // Confirmed 2025-05-11: finance.mo.gov states regulatory authority is with local government.
  console.log('[MissouriPhase2] Skipping — Missouri pawnbrokers are county-licensed only (no state registry). No data available.');
}
