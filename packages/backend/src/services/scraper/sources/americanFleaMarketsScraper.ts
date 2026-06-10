/**
 * AmericanFleaMarkets.com scraper adapter
 * Source: https://www.americanfleamarkets.com
 * Investigation date: 2026-06-10
 *
 * PARKED — domain returns empty HTTP response (no content, no headers beyond connection).
 *
 * robots.txt: Fetch timed out / empty response — domain appears to be dead or Cloudflare-gated
 * with no content served to automated requests.
 * ToS: Not accessible — site returns no HTML.
 * Static HTML: None — fetch returns empty body.
 *
 * To unpark: verify domain is live, check robots.txt, inspect HTML for listing structure.
 * If the domain resolves to a new operator, treat as a fresh investigation.
 *
 * ADR-073: Directory Scraper — Phase 2 candidate
 */

import { RateLimiter } from '../rateLimiter';
import { ScrapeStats } from '../sourceRegistry';

/**
 * AmericanFleaMarkets.com scraper — parked (domain dead/non-responsive).
 * Returns zero stats cleanly. See file header for unpark path.
 */
export async function scrapeAmericanFleaMarkets(
  _metro: string,
  _organizerId: string,
  _rateLimiter: RateLimiter
): Promise<ScrapeStats> {
  // PARKED: americanfleamarkets.com returns empty HTTP response.
  // No content, no robots.txt, no HTML — domain appears inactive.
  // Verified: 2026-06-10 — fetch returned empty body on both www and apex.
  console.log('[AmericanFleaMarkets] PARKED: domain returns empty response — site appears dead or Cloudflare-gated with no content. Exiting cleanly.');

  return {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };
}
