/**
 * Tennessee — Secondary Sale License Scraper (Phase 2) — SOURCE MOVED / JS-ONLY
 * ADR-073: Directory Scraper Phase 2 — State business licensing data
 *
 * STATUS: GRACEFUL NO-OP — verify.tn.gov now redirects to a Next.js SPA with no REST API.
 *
 * Previous URL: https://verify.tn.gov/api/v1/licenses/search
 * Current behavior (confirmed 2025-05-11):
 *   - verify.tn.gov now resolves (IP: 170.141.168.24)
 *   - All paths redirect to https://search.cloud.commerce.tn.gov/
 *   - search.cloud.commerce.tn.gov is a Next.js SPA (TDCI license verification portal)
 *   - /api/v1/licenses/search → 404 (old API path no longer exists)
 *   - POST and GET to the old search endpoint both return the 404 Next.js HTML shell
 *
 * UNBLOCKING:
 *   1. Inspect search.cloud.commerce.tn.gov network traffic in a browser DevTools
 *      to find the actual API endpoint the SPA uses
 *   2. TN TDCI likely has a Salesforce/Thentia backend — look for:
 *      - /api/licensees or /api/search in XHR calls
 *      - GraphQL endpoints
 *   3. TN SoS business search: https://tnbear.tn.gov/ecommerce/filesearch.aspx
 *      Keyword search for "auction", "pawn", "estate sale" (HTML-parseable)
 *
 * Pawnbroker note: TN pawnbrokers are licensed at the county level — no statewide portal.
 */

export async function runTennesseePhase2Scraper(): Promise<void> {
  // verify.tn.gov → search.cloud.commerce.tn.gov is a Next.js SPA; old REST API path is 404.
  // Confirmed 2025-05-11. No automated access to TN license data is currently possible.
  console.log('[TennesseePhase2] Skipping — verify.tn.gov moved to Next.js SPA at search.cloud.commerce.tn.gov; API endpoint no longer available.');
}
