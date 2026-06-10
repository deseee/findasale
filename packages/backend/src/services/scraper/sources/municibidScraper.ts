/**
 * Municibid scraper adapter
 * Source: https://www.municibid.com
 * ToS: PROHIBITED — explicit anti-scraping language in Section (c) Acceptable Use.
 *
 * PARKED — ToS PROHIBITED. Do not implement or enable without a separate written
 * agreement with Municibid granting automated access rights.
 *
 * Direct quotes from https://info.municibid.com/terms (updated 05/04/26):
 *   "Accessing or attempting to access the Website through automated means"
 *   "Scraping, reproducing, republishing, selling, reselling, duplicating, or
 *    trading the Website or its content"
 * Both are listed under "you are expressly prohibited from" in Section (c).
 *
 * robots.txt is open for main listing pages, but robots.txt permissiveness is
 * overridden by explicit ToS prohibition. The ToS is the controlling document.
 *
 * About Municibid:
 *   - Government-only auction marketplace (municipal agencies, schools, utilities)
 *   - No buyer premium on many auctions — differentiator vs. commercial platforms
 *   - Northeast/Mid-Atlantic focused (PA HQ), national coverage
 *   - Sellers: ~2,000+ government agencies
 *   - businessCategory would be: 'AUCTION_HOUSE' (government auctioneer)
 *
 * Unpark path:
 *   1. Contact Municibid via https://info.municibid.com/contact-us and request a
 *      data partnership or API access agreement in writing.
 *   2. If a written agreement is granted, implement using the static HTML Browse
 *      page (/Listing/Browse) which lists active auctions with agency/seller names,
 *      cities, and states directly in the server-rendered HTML (ASP.NET, Cheerio-parseable).
 *   3. Rate limit to 0.5 req/sec max. Register with enabled: true and the written
 *      agreement reference in legalNote.
 *
 * ADR-073: Directory Scraper — PROHIBITED (ToS explicit ban)
 */

import { RateLimiter } from '../rateLimiter';
import { ScrapeStats } from '../sourceRegistry';

/**
 * Municibid scraper — parked (ToS explicit prohibition on automated access and scraping).
 * Returns zero stats cleanly. See file header for unpark path.
 */
export async function scrapeMunicibid(
  _metro: string,
  _organizerId: string,
  _rateLimiter: RateLimiter
): Promise<ScrapeStats> {
  // PARKED: Municibid ToS Section (c) explicitly prohibits automated access and scraping.
  // Quote: "Accessing or attempting to access the Website through automated means"
  // Quote: "Scraping, reproducing, republishing, selling, reselling, duplicating, or trading the Website or its content"
  // Unpark path: written data partnership agreement with Municibid required.
  // Verified: 2026-06-10 — ToS at https://info.municibid.com/terms (updated 05/04/26).
  console.log('[Municibid] PARKED: ToS explicitly prohibits automated access and scraping. Exiting cleanly.');

  return {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };
}
