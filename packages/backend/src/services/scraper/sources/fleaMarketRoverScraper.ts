/**
 * FleaMarketRover.com scraper adapter
 * Source: https://www.fleamarketrover.com
 * Investigation date: 2026-06-10
 *
 * PARKED — domain returns empty HTTP response on all tested paths.
 *
 * robots.txt: Returns empty body — no directives served.
 * ToS: Not accessible — site returns no HTML.
 * Static HTML: None — fetch returns empty body on /, /robots.txt, /sitemap.xml.
 *              Domain appears dead, expired, or Cloudflare-gated with no pass-through.
 *
 * To unpark: verify if domain becomes active, inspect for flea market finder structure
 * (the domain name suggests a geo-based flea market search tool).
 *
 * ADR-073: Directory Scraper — Phase 2 candidate (if domain activates)
 */

import { RateLimiter } from '../rateLimiter';
import { ScrapeStats } from '../sourceRegistry';

/**
 * FleaMarketRover.com scraper — parked (domain dead/non-responsive).
 * Returns zero stats cleanly. See file header for unpark path.
 */
export async function scrapeFleaMarketRover(
  _metro: string,
  _organizerId: string,
  _rateLimiter: RateLimiter
): Promise<ScrapeStats> {
  // PARKED: fleamarketrover.com returns empty HTTP response.
  // No content served on any tested path — domain appears inactive.
  // Verified: 2026-06-10 — empty body on /, /robots.txt, /sitemap.xml.
  console.log('[FleaMarketRover] PARKED: domain returns empty response — site appears dead or gated with no content served. Exiting cleanly.');

  return {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };
}
