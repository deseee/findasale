/**
 * Proxibid.com scraper adapter
 * Source: https://www.proxibid.com
 * ToS: PROHIBITED — Proxibid Unified User Agreement (PDF at /docs/ProxibidUUA.pdf)
 *   contains multiple explicit prohibitions:
 *   - Section 10(h): "scraping, spidering, crawling or otherwise using automated
 *     means to access, retrieve or index any portion of the Site or Content"
 *   - Section 11.1(v): explicit prohibition on scraping in list of prohibited uses
 *   - Section 12: intellectual property protection covering auction data
 *   Fetched and confirmed 2026-06-10 via /docs/ProxibidUUA.pdf.
 *
 * PROHIBITED — legal block. Do not implement. No unpark path available without
 * a written data partnership agreement with Proxibid (Auction Technology Group).
 *
 * Context: Proxibid operates ~30,000 auction houses on their platform (major
 * auction technology provider). Parent company: Auction Technology Group (ATG),
 * also owns BidSpotter (already in fleet, ToS CLEAR, different rules).
 *
 * Note: BidSpotter (also ATG) has separate ToS with no anti-scraping clause —
 * the prohibition applies to Proxibid specifically, not all ATG platforms.
 *
 * ADR-073: Directory Scraper — PROHIBITED (legal block, written agreement required)
 */

import { RateLimiter } from '../rateLimiter';
import { ScrapeStats } from '../sourceRegistry';

/**
 * Proxibid.com scraper — PROHIBITED. This stub should never be called.
 * The registry entry has prohibited: true and enabled: false.
 * Returns zero stats cleanly if somehow invoked.
 */
export async function scrapeProxibid(
  _metro: string,
  _organizerId: string,
  _rateLimiter: RateLimiter
): Promise<ScrapeStats> {
  // PROHIBITED: Proxibid ToS explicitly bans scraping (§10h, §11.1v, §12 of UUA).
  // This scraper must never be called. See sourceRegistry.ts for prohibited: true flag.
  console.warn(
    '[Proxibid] PROHIBITED: Proxibid ToS (§10h, §11.1v, §12) explicitly bans scraping. This scraper must not run. Contact Auction Technology Group for data partnership.'
  );

  return {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };
}
