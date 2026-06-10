/**
 * VendorsByState scraper adapter
 * Sources tested: https://www.vendorsbystateusa.com / https://www.vendorsbystate.com
 * Investigation date: 2026-06-10
 *
 * PARKED — both domain variants return empty HTTP response on all tested paths.
 *
 * robots.txt: Both variants return empty body — no directives served.
 * ToS: Not accessible — neither domain returns any HTML content.
 * Static HTML: None — fetches return empty body on both www.vendorsbystateusa.com
 *              and www.vendorsbystate.com. Domains appear dead or expired.
 *
 * To unpark: verify if either domain becomes active and serves flea market /
 * vendor market directory data. The domain names suggest a state-by-state
 * vendor/market finder — worth re-checking quarterly.
 *
 * ADR-073: Directory Scraper — Phase 2 candidate (if either domain activates)
 */

import { RateLimiter } from '../rateLimiter';
import { ScrapeStats } from '../sourceRegistry';

/**
 * VendorsByState scraper — parked (both domain variants dead/non-responsive).
 * Returns zero stats cleanly. See file header for unpark path.
 */
export async function scrapeVendorsByState(
  _metro: string,
  _organizerId: string,
  _rateLimiter: RateLimiter
): Promise<ScrapeStats> {
  // PARKED: vendorsbystateusa.com and vendorsbystate.com both return empty HTTP responses.
  // No content served on any tested path — domains appear inactive or expired.
  // Verified: 2026-06-10 — empty body on both apex + www variants, robots.txt also empty.
  console.log('[VendorsByState] PARKED: both vendorsbystateusa.com and vendorsbystate.com return empty responses — domains appear dead. Exiting cleanly.');

  return {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };
}
