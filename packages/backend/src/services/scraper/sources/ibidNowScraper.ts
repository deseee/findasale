/**
 * iBidNow.com scraper adapter
 * Source: https://www.ibidnow.com
 * ToS: N/A — site is not a live product.
 * robots.txt: Allow: / (with LLM-Policy header — GoDaddy Afternic domain parking page).
 *
 * PARKED — ibidnow.com is a parked/for-sale domain hosted on GoDaddy Afternic.
 * Every page path redirects to /lander which serves the Afternic domain sale page.
 * The domain is NOT a functioning storage auction platform.
 *
 * To unpark: monitor Afternic/domain listings to see if this domain is ever developed
 * into an actual product. Re-investigate if future search returns a live auction site.
 *
 * Verified: 2026-06-10 — robots.txt served from Afternic infrastructure
 * (afternic-antares v27 prod CSS), all pages return /lander redirect with
 * GoDaddy domain sale UI.
 *
 * ADR-073: Directory Scraper — not a viable source
 */

import { RateLimiter } from '../rateLimiter';
import { ScrapeStats } from '../sourceRegistry';

/**
 * iBidNow scraper — parked (domain is a GoDaddy Afternic for-sale page, not a product).
 * Returns zero stats cleanly.
 */
export async function scrapeIBidNow(
  _metro: string,
  _organizerId: string,
  _rateLimiter: RateLimiter
): Promise<ScrapeStats> {
  // PARKED: ibidnow.com is a GoDaddy Afternic parked/for-sale domain — not a live product.
  // Every URL redirects to /lander (Afternic domain sale page). No auction data exists.
  // Verified: 2026-06-10 — robots.txt = Afternic CSS, all paths → /lander.
  console.log('[iBidNow] PARKED: domain is a GoDaddy Afternic for-sale page — not a live product. Exiting cleanly.');

  return {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };
}
