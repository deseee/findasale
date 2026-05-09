/**
 * Kansas Office of the State Bank Commissioner — Pawnbroker License Scraper (Phase 2)
 * Scrapes licensed pawnbrokers from Kansas OSBC licensee search
 * Source: https://www.osbckansas.org/
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data
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
        `[Kansas Phase2] Portal blocked — TODO: Playwright/headless browser required for osbckansas.org. HTTP ${probeResponse.status}`
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
        '[Kansas Phase2] Portal blocked — TODO: Playwright/headless browser required for osbckansas.org (JS-rendered search detected)'
      );
      return;
    }

    console.warn(
      '[Kansas Phase2] Portal accessible but full scraper not yet implemented — TODO: implement pawnbroker license type search and HTML table parsing for osbckansas.org'
    );
    return;
  } catch (err) {
    console.warn(
      '[Kansas Phase2] Portal blocked — TODO: Playwright/headless browser required for osbckansas.org',
      err
    );
    return;
  }
}
