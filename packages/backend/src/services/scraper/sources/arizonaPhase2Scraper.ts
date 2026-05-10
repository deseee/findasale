/**
 * Arizona Department of Financial Institutions — Pawnbroker License Scraper (Phase 2)
 * Source: https://difi.az.gov/
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data
 *
 * DATA SOURCE STATUS (verified 2026-05-09):
 *   - AZ DFI (difi.az.gov) licenses pawnbrokers. Portal returns HTTP 403 (Cloudflare WAF).
 *   - opendata.az.gov returns empty results for all business license / pawnbroker queries.
 *   - No Socrata or CKAN dataset found for AZ pawnbroker or secondhand dealer licenses.
 *   - AZ SOS (azsos.gov) has no public bulk entity API.
 *
 * UNBLOCKING OPTIONS (in priority order):
 *   1. AZ DFI public records request: https://difi.az.gov/contact-us
 *      Request licensed pawnbroker list under ARS §39-121 (public records).
 *      Phone: (602) 771-2800. They may provide a CSV or XLSX.
 *   2. Phoenix city licenses: https://phoenix.gov/pdd/business-services — check if Phoenix
 *      publishes a Socrata dataset with business license types including pawnbroker.
 *   3. Tucson city licenses: https://www.tucsonaz.gov/open-data — similar check.
 *   4. If Cloudflare WAF on difi.az.gov is bypassed, the licensee search form is at:
 *      https://difi.az.gov/licensees — POST with license_type=Pawnbroker.
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
