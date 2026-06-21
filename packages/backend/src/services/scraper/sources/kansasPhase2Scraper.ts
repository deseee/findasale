/**
 * Kansas Office of the State Bank Commissioner — Pawnbroker License Scraper (Phase 2)
 * Source: https://www.osbckansas.org/
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data
 *
 * DATA SOURCE STATUS (verified 2026-05-09):
 *   - KS OSBC (osbckansas.org) licenses pawnbrokers. Portal is WordPress-based; the
 *     licensee search page returns HTML but results are JS-rendered (no static table).
 *   - data.kansas.gov / data.ks.gov — both return HTTP 000 (DNS not found / offline).
 *   - opendata.ks.gov — no response; KS has no active public Socrata portal.
 *   - KS Dept of Agriculture auctioneer licensing page returns HTTP 403.
 *
 * UNBLOCKING OPTIONS (in priority order):
 *   1. KS OSBC public records request: https://www.osbckansas.org/about/contact-us/
 *      Request licensed pawnbroker list under KSA §45-215 (Kansas Open Records Act).
 *      Phone: (785) 296-2266. They may provide a CSV or XLSX.
 *   2. KS Dept of Agriculture auctioneer list: https://www.agriculture.ks.gov/divisions-programs/aad/auctioneer-licensing
 *      Page returns 403 to bots; try via browser or public records request for licensee list.
 *   3. Wichita city licenses: https://www.wichita.gov/opendata — check for business license
 *      datasets with pawnbroker/secondhand dealer categories.
 *   4. NMLS (nmlsconsumeraccess.org) — probe for KS pawnbroker license type coverage
 *      (consumer lending search returns 403 currently).
 *
 * NOTE: osbckansas.org uses a JS-rendered licensee search portal.
 * This is a stub implementation. Full scraping requires Playwright/headless browser.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const KS_OSBC_URL = 'https://www.osbckansas.org/';
const KS_SEARCH_URL = 'https://www.osbckansas.org/consumerlending/cl_licensee_search.html';

/**
 * Scrape Kansas pawnbroker licenses from Kansas OSBC.
 * Portal is JS-rendered — stub implementation until Playwright is available.
 */
export async function runKansasPhase2Scraper(): Promise<void> {
  const domain = new URL(KS_OSBC_URL).hostname;

  console.log('[Kansas Phase2] Starting pawnbroker license scraper');

  try {
    await defaultRateLimiter.waitBeforeRequest(domain);

    const probeResponse = await fetch(KS_SEARCH_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!probeResponse.ok) {
      console.warn(
        `[Kansas Phase2] Portal blocked — NOTE (BLOCKED): Playwright/headless browser required for osbckansas.org. HTTP ${probeResponse.status}`
      );
      return;
    }

    const html = await probeResponse.text();

    // Detect JS-rendered or Cloudflare-protected content
    const isJsRendered =
      html.includes('cf-browser-verification') ||
      html.includes('Just a moment') ||
      html.includes('Checking your browser') ||
      html.includes('_cf_chl_opt') ||
      html.includes('ng-app') ||
      html.includes('data-react') ||
      html.includes('__NEXT_DATA__') ||
      html.trim().length < 1000;

    if (isJsRendered) {
      console.warn(
        '[Kansas Phase2] Portal blocked — NOTE (BLOCKED): Playwright/headless browser required for osbckansas.org (JS-rendered search detected)'
      );
      return;
    }

    console.warn(
      '[Kansas Phase2] Portal accessible but full scraper not yet implemented — NOTE (BLOCKED): implement pawnbroker license type search and HTML table parsing for osbckansas.org'
    );
    return;
  } catch (err) {
    console.warn(
      '[Kansas Phase2] Portal blocked — NOTE (BLOCKED): Playwright/headless browser required for osbckansas.org',
      err
    );
    return;
  }
}
