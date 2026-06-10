/**
 * StorageAuctions.net scraper adapter
 * Source: https://www.storageauctions.net
 * ToS: Confirmed CLEAR — blank robots.txt Disallow, no anti-scraping ToS language
 *
 * PARKED — JS-rendered listings, no static scrape path available.
 *
 * The site's auction listing pages (/allonline, /site-map/us/[state]/[city]/)
 * are rendered by AngularJS (ng-app="allonline", ng-controller="allonline").
 * Static HTTP fetch returns a shell with <div ng-view class="clearfix"></div>
 * and zero facility/auctioneer records in the HTML.
 *
 * The /site-map/us/[state]/ pages list cities but not facility names —
 * each city link resolves to the same JS-rendered view.
 *
 * No static directory or auctioneer listing page was found during investigation
 * (2026-06-10): /auctioneers → 404, /site-map/us/mi/ → city list only (no
 * facility names), /allonline → AngularJS shell.
 *
 * To unpark: implement Playwright/Puppeteer headless rendering, or locate a
 * REST API endpoint called by the AngularJS frontend (check Network tab in
 * DevTools for JSON endpoints at update.storageauctions.net).
 *
 * ADR-073: Directory Scraper — Phase 2 candidate
 */

import { RateLimiter } from '../rateLimiter';
import { ScrapeStats } from '../sourceRegistry';

/**
 * StorageAuctions.net scraper — parked (JS-rendered, no static listings).
 * Returns zero stats cleanly. See file header for unpark path.
 */
export async function scrapeStorageAuctionsNet(
  _metro: string,
  _organizerId: string,
  _rateLimiter: RateLimiter
): Promise<ScrapeStats> {
  // PARKED: StorageAuctions.net auction listings are AngularJS-rendered.
  // Static HTTP fetch returns a shell with no facility records.
  // Unpark path: headless browser (Playwright) or API endpoint discovery.
  // Verified: 2026-06-10 — /allonline returned ng-view shell, zero facility names.
  console.log('[StorageAuctionsNet] PARKED: site is AngularJS-rendered — no static listings available. Exiting cleanly.');

  return {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };
}
