/**
 * FleaMarket.com scraper adapter
 * Source: https://www.fleamarket.com
 * Investigation date: 2026-06-10
 *
 * PARKED — domain returns empty HTTP response (no content, no HTML).
 *
 * robots.txt: Returns empty body — no directives, no content served.
 * ToS: Not accessible — site returns no HTML at root or any tested path.
 * Static HTML: None — fetch returns empty body on both www and apex variants.
 *
 * To unpark: verify if the domain becomes active, inspect for directory listing structure.
 *
 * ADR-073: Directory Scraper — Phase 2 candidate (if domain activates)
 */

import { RateLimiter } from '../rateLimiter';
import { ScrapeStats } from '../sourceRegistry';

/**
 * FleaMarket.com scraper — parked (domain dead/non-responsive).
 * Returns zero stats cleanly. See file header for unpark path.
 */
export async function scrapeFleaMarketCom(
  _metro: string,
  _organizerId: string,
  _rateLimiter: RateLimiter
): Promise<ScrapeStats> {
  // PARKED: fleamarket.com returns empty HTTP response.
  // No content, no robots.txt, no HTML — domain appears inactive or Cloudflare-gated.
  // Verified: 2026-06-10 — fetch returned empty body on both www and apex.
  console.log('[FleaMarketCom] PARKED: domain returns empty response — site appears dead or gated with no content served. Exiting cleanly.');

  return {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };
}
