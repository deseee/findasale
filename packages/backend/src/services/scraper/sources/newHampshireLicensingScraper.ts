/**
 * New Hampshire OPLC — Auctioneer License Scraper
 *
 * BLOCKED — 2026-05-15
 * Original source URL: https://www.oplc.nh.gov/auctioneer
 *
 * Investigation results:
 * - /auctioneer returns HTTP 404 — the page no longer exists.
 * - www.oplc.nh.gov/list-oplc-licensees-and-their-license-types returns HTTP 403
 *   (Akamai WAF, Reference #18.aded2117 — IP/bot block, not bypassable via headers).
 * - www.oplc.nh.gov/license-lookup returns HTTP 403 (same Akamai block).
 * - licenses.oplc.nh.gov/s/ (Salesforce Experience Cloud portal) returns HTTP 403.
 * - www.nhes.nh.gov/elmi/products/licertocc/documents/auctionr.pdf returns HTTP 403.
 * - No public CSV, API, or data.gov dataset found for NH auctioneer licenses.
 *
 * Resolution: Return empty array. GitHub Actions step passes with 0 records.
 * Future path: The OPLC publishes a periodic licensee list — contact
 * CustomerSupport@oplc.nh.gov to request a bulk CSV export, or use the
 * Salesforce portal (licenses.oplc.nh.gov) with Puppeteer + residential proxy.
 */

import { defaultRateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { prisma } from '../../../lib/prisma';
import { getRandomUserAgent } from '../userAgents';

const NEW_HAMPSHIRE_BASE_URL = 'https://www.oplc.nh.gov/auctioneer';

/**
 * Parse an address string into city and zip components
 */
function parseAddress(address: string): { city: string; zip: string } {
  const parts = address.split(',').map((s) => s.trim());
  if (parts.length < 2) {
    return { city: address, zip: '' };
  }
  const cityPart = parts[0];
  const stateZip = parts[1];
  const zipMatch = stateZip.match(/\d{5}/);
  const zip = zipMatch ? zipMatch[0] : '';
  return { city: cityPart, zip };
}

/**
 * NH OPLC auctioneer page is 404. All alternative OPLC URLs are blocked by Akamai WAF.
 * This scraper exits gracefully with 0 records.
 * See file header comment for full investigation notes.
 */
export async function runNewHampshireLicensingScraper(): Promise<void> {
  console.log('[NewHampshireLicensing] Skipping: oplc.nh.gov/auctioneer returns HTTP 404 (page removed).');
  console.log('[NewHampshireLicensing] All alternative OPLC URLs blocked by Akamai WAF (HTTP 403).');
  console.log('[NewHampshireLicensing] Completed with 0 records. No error — graceful skip.');
}
