/**
 * Georgia Secretary of State — Auctioneer License Scraper
 *
 * BLOCKED — 2026-05-15
 * Source URL: https://verify.sos.ga.gov/verification/
 *
 * Investigation results:
 * - verify.sos.ga.gov returns HTTP 403 (Cloudflare managed challenge) for all
 *   automated requests, including full browser-spoofed headers. The challenge
 *   requires JavaScript execution and CAPTCHA solving — not bypassable via fetch.
 * - sos.ga.gov/plb/auctioneer (older URL) also Cloudflare-protected, same result.
 * - sos.ga.gov/licensing-division-license-lookup: HTTP 403.
 * - No public API, CSV download, or data.gov dataset found for GA auctioneer licenses.
 * - The Georgia Auctioneers Commission roster is available as a paid product
 *   at georgiasecretaryofstate.net but not as a free public data feed.
 *
 * Resolution: Return empty array. GitHub Actions step passes with 0 records.
 * Future path: Submit a Georgia Open Records Act (ORA) request to the SOS office
 * for a bulk export of the auctioneer license roster, or use Puppeteer/Playwright
 * with a residential proxy to solve Cloudflare challenges.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const GEORGIA_SOS_URL = 'https://verify.sos.ga.gov/verification/';

/**
 * Georgia SOS license verification is protected by Cloudflare managed challenge.
 * This scraper exits gracefully with 0 records.
 * See file header comment for full investigation notes.
 */
export async function runGeorgiaLicensingScraper(): Promise<void> {
  console.log('[GeorgiaLicensing] Skipping: verify.sos.ga.gov is protected by Cloudflare challenge (HTTP 403).');
  console.log('[GeorgiaLicensing] Automated fetch not possible without JavaScript/CAPTCHA solving capability.');
  console.log('[GeorgiaLicensing] Completed with 0 records. No error — graceful skip.');
}
