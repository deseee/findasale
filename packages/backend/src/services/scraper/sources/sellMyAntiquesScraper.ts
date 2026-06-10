/**
 * SellMyAntiques.com scraper adapter
 * Source: https://www.sellmyantiques.com
 * ToS: Confirmed CLEAR — /terms-of-service page fetched successfully 2026-06-10.
 *   ToS covers user accounts, listings, and payment terms. No anti-scraping clause,
 *   no prohibition on automated access. robots.txt blank (no Disallow rules).
 *
 * PARKED — Fully JS-rendered (Next.js SPA). No static scrape path available.
 *
 * Investigation (2026-06-10):
 *   /dealers → Next.js app shell returned by static fetch. Zero dealer records in HTML.
 *   /dealers/antique-dealers/united-states → same empty shell.
 *   __NEXT_DATA__ present in page source but empty payload (CSR-only rendering).
 *   No public REST API endpoint identified in HTML source.
 *
 * To unpark: inspect Network tab in DevTools on /dealers to identify the REST API
 *   endpoint (likely /api/dealers or similar GraphQL endpoint). Alternatively,
 *   implement Playwright/Puppeteer headless rendering.
 *
 * ToS CLEAR + rich dealer data (antique dealers, auction houses) = strong Phase 2
 * candidate for ANTIQUE_DEALER businessCategory ingestion.
 *
 * ADR-073: Directory Scraper — Phase 2 candidate (JS-rendered, ToS CLEAR)
 */

import { RateLimiter } from '../rateLimiter';
import { ScrapeStats } from '../sourceRegistry';

/**
 * SellMyAntiques.com scraper — parked (fully JS-rendered, no static content).
 * Returns zero stats cleanly. See file header for unpark path.
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
    '[SellMyAntiques] PARKED: site is fully JS-rendered — no static dealer listings available. Exiting cleanly.'
  );

  return {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };
}
