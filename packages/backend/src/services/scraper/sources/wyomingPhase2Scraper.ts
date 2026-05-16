/**
 * Wyoming Division of Banking — Pawnbroker License Scraper (Phase 2)
 * Source: https://wyomingbankingdivision.wyo.gov/consumer-lending/licensee-list
 * ADR-073: Directory Scraper Phase 2 — State pawnbroker licensing data
 *
 * STATUS: DISABLED — source is not scrapeable without a headless browser.
 *
 * Investigation (2026-05-16):
 * - The licensee-list page is hosted on Google Sites (sites.google.com/wyo.gov/banking).
 * - The page is 100% JS-rendered. Static HTML fetch returns only Google Sites shell
 *   with zero licensee data. data-embedded-items-count="15" is populated client-side.
 * - The Google Drive files linked from the consumer-lending page are PDFs unrelated
 *   to the licensee list (PDCC Code Book, Wyoming Telework Memo, etc.).
 * - NMLS Consumer Access API returns 403 for unauthenticated requests.
 * - No downloadable CSV/Excel/JSON endpoint found on any wyo.gov or wyomingbankingdivision.wyo.gov path.
 *
 * To enable this scraper: implement a Playwright/Puppeteer headless fetch of the
 * Google Sites page, wait for JS render, then extract the embedded table content.
 * Register with enabled: true in sourceRegistry.ts once headless support is wired.
 */

import { ScrapeStats } from '../sourceRegistry';

export async function runWyomingPhase2Scraper(): Promise<ScrapeStats> {
  console.log(
    '[WyomingPhase2] Scraper is disabled — source requires headless browser (Google Sites JS-rendered page). No data fetched.'
  );
  return {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };
}
