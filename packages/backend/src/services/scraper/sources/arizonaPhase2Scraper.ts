/**
 * Arizona Department of Financial Institutions — Pawnbroker License Scraper (Phase 2)
 * Scrapes licensed pawnbrokers from Arizona DFI licensee search
 * Source: https://difi.az.gov/
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data
 *
 * NOTE: difi.az.gov is Cloudflare-protected and requires JS rendering.
 * This is a stub implementation. Full scraping requires Playwright/headless browser.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const AZ_DIFI_URL = 'https://difi.az.gov/';

/**
 * Scrape Arizona pawnbroker licenses from Arizona DFI.
 * Portal is Cloudflare-protected — stub implementation until Playwright is available.
 */
export async function runArizonaPhase2Scraper(): Promise<void> {
  const domain = new URL(AZ_DIFI_URL).hostname;

  console.log('[Arizona Phase2] Starting pawnbroker license scraper');

  // Probe the portal to detect Cloudflare block
  try {
    await defaultRateLimiter.waitBeforeRequest(domain);

    const probeResponse = await fetch(AZ_DIFI_URL, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
      },
      signal: AbortSignal.timeout(30000),
    });

    const html = await probeResponse.text();

    const isBlocked =
      probeResponse.status === 403 ||
      probeResponse.status === 503 ||
      html.includes('cf-browser-verification') ||
      html.includes('Just a moment') ||
      html.includes('Checking your browser') ||
      html.includes('_cf_chl_opt');

    if (isBlocked) {
      console.warn(
        '[Arizona Phase2] Portal blocked — TODO: Playwright/headless browser required for difi.az.gov (Cloudflare protection detected)'
      );
      return;
    }

    // If not blocked, portal may be accessible — log for manual follow-up
    console.warn(
      '[Arizona Phase2] Portal accessible but full scraper not yet implemented — TODO: implement pawnbroker search form submission and HTML parsing'
    );
    return;
  } catch (err) {
    console.warn(
      '[Arizona Phase2] Portal blocked — TODO: Playwright/headless browser required for difi.az.gov',
      err
    );
    return;
  }
}
