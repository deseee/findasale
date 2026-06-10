/**
 * FleaMarkets.net scraper adapter
 * Source: https://www.fleamarkets.net
 * Investigation date: 2026-06-10
 *
 * PARKED — domain is a parked/for-sale domain listed on GoDaddy Afternic.
 * No flea market directory content exists at this domain.
 *
 * robots.txt: Returns "User-agent: * / Allow: / / LLM-Policy: /llms.txt" — these are
 *             GoDaddy/Afternic default robots entries for parked domains.
 * ToS: Afternic domain sale page — irrelevant, no directory content.
 * Static HTML: Domain sale landing page on Afternic/GoDaddy — no flea market data.
 *
 * To unpark: not applicable — this domain is for sale and contains no directory data.
 *            If another operator acquires the domain, treat as a fresh investigation.
 *
 * ADR-073: Directory Scraper — not a candidate (parked/for-sale domain)
 */

import { RateLimiter } from '../rateLimiter';
import { ScrapeStats } from '../sourceRegistry';

/**
 * FleaMarkets.net scraper — parked (domain is for sale on Afternic, no directory content).
 * Returns zero stats cleanly. See file header for investigation notes.
 */
export async function scrapeFleaMarketsNet(
  _metro: string,
  _organizerId: string,
  _rateLimiter: RateLimiter
): Promise<ScrapeStats> {
  // PARKED: fleamarkets.net is a parked/for-sale domain on GoDaddy Afternic.
  // No flea market venue directory content exists — domain redirects to Afternic sale page.
  // Verified: 2026-06-10 — HTTP redirect to afternic.com/forsale/fleamarkets.net.
  console.log('[FleaMarketsNet] PARKED: domain is for sale on Afternic — no flea market directory content. Exiting cleanly.');

  return {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };
}
