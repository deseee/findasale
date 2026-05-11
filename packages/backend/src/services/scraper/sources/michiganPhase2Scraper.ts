/**
 * Michigan Pawnbroker License Scraper (Phase 2) — SOURCE UNAVAILABLE
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data
 *
 * STATUS: GRACEFUL NO-OP — DIFS pawnbroker page moved/removed; michigan.gov/difs returns 403.
 *
 * Attempted URLs (confirmed 2025-05-11):
 *   - https://difs.state.mi.us/Divisions/BankingBureau/Pages/Pawn.aspx → 404
 *   - https://difs.state.mi.us/Divisions/BankingBureau/ → 404
 *   - https://www.michigan.gov/difs/industry-specific-information/consumer-finance/pawnbrokers → 403
 *
 * Michigan pawnbrokers are licensed under the Pawnbrokers Act (MCL 446.201 et seq.)
 * by the Department of Insurance and Financial Services (DIFS) Banking Bureau.
 *
 * UNBLOCKING:
 *   1. Try the new DIFS portal: https://difs.state.mi.us/ — check for a licensee search section
 *   2. NMLS Consumer Access for MI-licensed lenders (different category but may overlap)
 *   3. Submit a FOIA request to DIFS for pawnbroker licensee list
 *      Contact: https://www.michigan.gov/difs/contact-us
 *
 * MI auctioneer licensing is handled by michiganLicensingScraper.ts (aca3.accela.com/MILARA).
 */

export async function runMichiganPhase2Scraper(): Promise<void> {
  // DIFS pawnbroker page returned 404; michigan.gov/difs page returned 403.
  // Confirmed 2025-05-11. No automated access to MI pawnbroker data is currently possible.
  console.log('[MichiganPhase2] Skipping — DIFS pawnbroker page 404; michigan.gov/difs 403. No MI pawnbroker data available.');
}
