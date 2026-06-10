/**
 * LockerFox.com scraper adapter
 * Source: https://www.lockerfox.com
 * ToS: PROHIBITED — §1.4.2 explicitly bans robots/spiders; §1.4.6 explicitly bans
 *   web scraping for commercial use without written permission.
 *   Exact text: "You agree that You will not use robots, spiders or other automatic or
 *   manual processes to monitor or copy our web pages, Content or data without or
 *   express written permission." (§1.4.2) and "Content may not be harvested or
 *   downloaded automatically and used for commercial purposes without the written
 *   permission of Lockerfox." (§1.4.6). Reviewed 2026-06-10.
 * robots.txt: Disallow: /auctions/, /preview/, /public-notices/, /operators/?utm_campaign=Legal
 *   The primary listing path /auctions/ is explicitly blocked.
 *
 * PROHIBITED — ToS has explicit dual prohibition: §1.4.2 bans automated access,
 * §1.4.6 bans commercial harvesting without written permission. robots.txt also
 * blocks the /auctions/ path. Both bars independently prevent scraping.
 *
 * To unpark: requires written data partnership agreement with Lockerfox, LLC
 * (contact: support@lockerfox.com). Company is based in Cornelius, NC.
 *
 * Note: The site does serve static HTML auction listings (confirmed via static page
 * check 2026-06-10 — U-Haul facility names and addresses visible in HTML). The
 * legal prohibition is the blocker, not technical feasibility.
 *
 * ADR-073: Directory Scraper — legal block, do not run
 */

import { RateLimiter } from '../rateLimiter';
import { ScrapeStats } from '../sourceRegistry';

/**
 * LockerFox scraper — prohibited by ToS (§1.4.2 + §1.4.6) and robots.txt.
 * Returns zero stats cleanly. Never enable without written permission from Lockerfox.
 */
export async function scrapeLockerFox(
  _metro: string,
  _organizerId: string,
  _rateLimiter: RateLimiter
): Promise<ScrapeStats> {
  // PROHIBITED: LockerFox ToS §1.4.2 bans automated access; §1.4.6 bans commercial
  // data harvesting without written permission. robots.txt blocks /auctions/.
  // Do NOT run this scraper. Unpark requires written partnership agreement with Lockerfox.
  // Verified: 2026-06-10.
  console.log('[LockerFox] PROHIBITED: ToS §1.4.2 + §1.4.6 explicitly ban automated scraping. Do not run. Exiting cleanly.');

  return {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };
}
