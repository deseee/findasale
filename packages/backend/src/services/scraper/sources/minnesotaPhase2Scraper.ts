/**
 * Minnesota Pawnbroker License Scraper (Phase 2) — BOT-BLOCKED
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data
 *
 * STATUS: GRACEFUL NO-OP — mn.gov is protected by Radware Bot Manager / ShieldSquare CAPTCHA.
 *
 * Attempted URLs (confirmed 2025-05-11):
 *   - https://mn.gov/commerce/industries/financial-services/pawnbrokers/ → CAPTCHA redirect
 *     (Radware ShieldSquare: validate.perfdrive.com) from non-browser user agents
 *   - https://licenseelookup.dli.mn.gov/ → NXDOMAIN
 *
 * MN pawnbrokers are licensed under MN Stat. § 325J by MN Department of Commerce.
 *
 * UNBLOCKING:
 *   1. File a data/records request to mn.gov Commerce for a pawnbroker licensee list
 *      Contact: https://mn.gov/commerce/contact/
 *   2. NMLS Consumer Access — MN may list regulated lenders (different category)
 *   3. licenseelookup.dli.mn.gov — check if DNS resolves again; DLI covers some Commerce licenses
 *
 * MN auctioneer licensing is handled by minnesotaLicensingScraper.ts.
 */

export async function runMinnesotaPhase2Scraper(): Promise<void> {
  // mn.gov is bot-blocked (Radware ShieldSquare CAPTCHA). licenseelookup.dli.mn.gov is NXDOMAIN.
  // Confirmed 2025-05-11. No automated access to MN pawnbroker data is currently possible.
  console.log('[MinnesotaPhase2] Skipping — mn.gov bot-blocked (ShieldSquare CAPTCHA); licenseelookup.dli.mn.gov NXDOMAIN. No MN pawnbroker data available.');
}
