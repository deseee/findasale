/**
 * FleaMarketDirectory.com scraper adapter
 * Source: https://www.fleamarketdirectory.com
 * Investigation date: 2026-06-10
 *
 * PARKED — domain redirects to USWantads.com, a general classifieds site,
 * not a flea market directory. No flea market venue data exists at this destination.
 *
 * robots.txt: Returns "User-agent: * / Disallow: " (open) but at USWantads.com after redirect.
 * ToS: Destination site (uswantads.com) is a general want-ads classified platform.
 *      No flea market venue directory was found.
 * Static HTML: After redirect, content is USWantads.com listings (domain names, real estate,
 *              tools) — not flea market venue data.
 * Redirect chain: fleamarketdirectory.com → uswantads.com (WordPress 7.0 classifieds site).
 *
 * To unpark: verify if fleamarketdirectory.com ever points back to a flea market
 * directory. Current redirect destination is irrelevant — do not build against USWantads.com.
 *
 * ADR-073: Directory Scraper — not a candidate (wrong destination)
 */

import { RateLimiter } from '../rateLimiter';
import { ScrapeStats } from '../sourceRegistry';

/**
 * FleaMarketDirectory.com scraper — parked (redirects to unrelated classifieds site).
 * Returns zero stats cleanly. See file header for unpark path.
 */
export async function scrapeFleaMarketDirectory(
  _metro: string,
  _organizerId: string,
  _rateLimiter: RateLimiter
): Promise<ScrapeStats> {
  // PARKED: fleamarketdirectory.com permanently redirects to uswantads.com (general classifieds).
  // No flea market venue directory exists at the redirect destination.
  // Verified: 2026-06-10 — HTTP 301 → uswantads.com, no flea market data found.
  console.log('[FleaMarketDirectory] PARKED: domain redirects to USWantads.com (unrelated classifieds) — no flea market venue data. Exiting cleanly.');

  return {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };
}
