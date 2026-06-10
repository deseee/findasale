/**
 * Bid13.com scraper adapter
 * Source: https://bid13.com
 * ToS: Confirmed CLEAR — no anti-scraping language in ToS (reviewed 2026-06-10).
 * robots.txt: Open (disallows only /includes/, /misc/, /modules/, /profiles/,
 *   /scripts/, /themes/, /CHANGELOG.txt, /cron.php — no auction paths blocked).
 *
 * PARKED — Auction listings are loaded via custom AJAX + Socket.io.
 * The site uses a Drupal 7 + custom bid13_search + bid13_live_update module stack.
 * Static HTTP fetch of /auctions or /auction/list/us/[state] returns a shell page
 * with no auction/facility data in the HTML — all listing data is fetched client-side
 * via Drupal AJAX callbacks and Socket.io live updates (bid13_live_update).
 * The bid13_autoban module also implements evercookie fingerprinting to detect bots.
 *
 * No static directory, facility list, or auctioneer listing page was found
 * (2026-06-10): /auctions → empty shell, /auction/list/us/michigan → empty shell,
 * /sitemap.xml → only 9 static pages (home, /auctions, /faq, /user/login, etc.),
 * no facility/auctioneer directory pages.
 *
 * To unpark: implement Playwright/Puppeteer headless rendering, or locate Drupal
 * AJAX endpoint called by bid13_search.js (check Network tab in DevTools for JSON
 * callbacks at bid13.com/search/autocomplete or Views AJAX endpoints).
 *
 * ADR-073: Directory Scraper — Phase 2 candidate
 */

import { RateLimiter } from '../rateLimiter';
import { ScrapeStats } from '../sourceRegistry';

/**
 * Bid13 scraper — parked (AJAX/Socket.io rendered, no static listings).
 * Returns zero stats cleanly. See file header for unpark path.
 */
export async function scrapeBid13(
  _metro: string,
  _organizerId: string,
  _rateLimiter: RateLimiter
): Promise<ScrapeStats> {
  // PARKED: Bid13 auction listings are loaded via Drupal AJAX + Socket.io.
  // Static HTTP fetch returns a shell with no facility or auction records.
  // bid13_autoban module uses evercookie fingerprinting to detect bots.
  // Unpark path: Playwright headless browser or Drupal AJAX endpoint discovery.
  // Verified: 2026-06-10 — /auctions, /auction/list/us/michigan both returned empty shells.
  console.log('[Bid13] PARKED: site uses Drupal AJAX + Socket.io — no static listings available. Exiting cleanly.');

  return {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };
}
