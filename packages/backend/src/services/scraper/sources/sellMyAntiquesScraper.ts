/**
 * SellMyAntiques.com scraper adapter
 * Source: https://www.sellmyantiques.com
 *
 * PARKED — Domain is now a GoDaddy parking page (as of 2026-06-12).
 *   All paths redirect to /lander (wsimg.com parking infrastructure).
 *   Sitemap contains only /lander. Site is dead / domain lapsed.
 *
 * Prior investigation (2026-06-10):
 *   ToS: CLEAR — no anti-scraping clause, no prohibition on automated access.
 *   robots.txt blank (no Disallow rules).
 *   /dealers → Next.js app shell, zero dealer records in HTML (CSR-only).
 *   /dealers/antique-dealers/united-states → same empty shell.
 *   __NEXT_DATA__ present but empty payload (CSR-only rendering).
 *   No public REST API endpoint identified in HTML source.
 *   Would have been strong ANTIQUE_DEALER Phase 2 candidate.
 *
 * Status update (2026-06-12):
 *   Domain parked — www.sellmyantiques.com → GoDaddy /lander on all paths.
 *   Only sitemap entry is /lander (GoDaddy parking infrastructure).
 *   Site is defunct. No scrape possible.
 *
 * To revisit: check if domain is re-registered / site relaunched in future.
 *   If restored: Playwright headless against /dealers/antique-dealers/united-states.
 *
 * ADR-073: Directory Scraper — DEAD (domain parked 2026-06-12)
 */

import { RateLimiter } from '../rateLimiter';
import { ScrapeStats } from '../sourceRegistry';

/**
 * SellMyAntiques.com scraper — domain parked as of 2026-06-12 (GoDaddy lander).
 * Returns zero stats cleanly. See file header for status history.
 */
export async function scrapeSellMyAntiques(
  _metro: string,
  _organizerId: string,
  _rateLimiter: RateLimiter
): Promise<ScrapeStats> {
  // PARKED: SellMyAntiques.com is a Next.js SPA — static HTTP fetch returns shell.
  // No dealer records present in HTML. No REST API endpoint located yet.
  // Unpark path: Playwright headless OR discover/document the REST API via DevTools.
  // ToS CLEAR — strong Phase 2 candidate for ANTIQUE_DEALER ingestion.
  // Verified: 2026-06-10 — /dealers returned Next.js app shell, zero records.
  console.log(
    '[SellMyAntiques] PARKED: domain is a GoDaddy parking page as of 2026-06-12 — all paths redirect to /lander. Exiting cleanly.'
  );

  return {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };
}
