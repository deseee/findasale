/**
 * Arizona Auctioneer License Scraper
 *
 * BLOCKED — 2026-05-15
 * Source URL: https://btr.az.gov/licensee-search
 *
 * Two reasons this scraper cannot function:
 * 1. btr.az.gov (Arizona Board of Technical Registration) does NOT regulate
 *    auctioneers. It covers engineers, architects, geologists, home inspectors,
 *    and land surveyors. There is no state-level auctioneer license in Arizona —
 *    regulation is handled by individual cities/counties (e.g., Phoenix City Clerk).
 * 2. The site returns HTTP 403 from automated requests (WAF/IP-block).
 *
 * Alternatives investigated:
 * - data.gov: no Arizona auctioneer license dataset found
 * - azcommerce.com: no auctioneer licensing data
 * - No state-level open data portal publishes this data because no state license exists
 *
 * Resolution: Return empty array. GitHub Actions step will pass with 0 records.
 * Future path: scrape individual city licensing portals (Phoenix, Tucson, Mesa)
 * if per-city coverage is desired.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const ARIZONA_LICENSE_BASE_URL = 'https://btr.az.gov';
const SEARCH_URL = 'https://btr.az.gov/licensee-search';

/**
 * Arizona does not issue a statewide auctioneer license.
 * This scraper exits gracefully with 0 records.
 * See file header comment for full investigation notes.
 */
export async function runArizonaLicensingScraper(): Promise<void> {
  console.log('[ArizonaLicensing] Skipping: Arizona has no state-level auctioneer license.');
  console.log('[ArizonaLicensing] Regulation is handled at city/county level (e.g., Phoenix City Clerk).');
  console.log('[ArizonaLicensing] Additionally, btr.az.gov blocks automated requests (HTTP 403).');
  console.log('[ArizonaLicensing] Completed with 0 records. No error — graceful skip.');
}
