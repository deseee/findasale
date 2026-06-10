/**
 * GovernmentLiquidation.com scraper adapter
 * Source: https://www.governmentliquidation.com
 * ToS: PROHIBITED — GovernmentLiquidation.com is operated by Liquidity Services, Inc.,
 *   the same parent that operates GovDeals.com. Their Terms of Service contain the same
 *   explicit anti-scraping language as GovDeals: automated data collection, crawling,
 *   and scraping are prohibited. The site is also protected by Cloudflare (all automated
 *   HTTP fetches return empty or time out), indicating active bot mitigation at the
 *   network layer in addition to the contractual prohibition.
 *
 * GovernmentLiquidation.com is the primary US DoD surplus disposal contractor,
 * handling property from Defense Logistics Agency (DLA) Disposition Services.
 * It is the DoD-exclusive platform analogous to GovDeals for civilian agencies.
 *
 * robots.txt: Blocked by Cloudflare — could not be fetched programmatically.
 * HTML access: Blocked by Cloudflare — all programmatic fetches timed out or returned
 *   empty. Active bot mitigation prevents static HTML extraction.
 *
 * PARKED — ToS PROHIBITED (same Liquidity Services parent as GovDeals) + Cloudflare
 *   active bot protection. Same legal constraint as GovDeals decision (ADR-073, June 2026).
 *
 * Unpark path: Requires written data partnership with Liquidity Services, Inc.
 *   Contact their Government Services division. Same path as GovDeals.
 *
 * ADR-073: Directory Scraper — PROHIBITED (same parent as GovDeals)
 */

import { RateLimiter } from '../rateLimiter';
import { ScrapeStats } from '../sourceRegistry';

/**
 * GovernmentLiquidation.com scraper — parked (ToS PROHIBITED + Cloudflare).
 * Returns zero stats cleanly. See file header for unpark path.
 */
export async function scrapeGovernmentLiquidation(
  _metro: string,
  _organizerId: string,
  _rateLimiter: RateLimiter,
): Promise<ScrapeStats> {
  // PARKED: GovernmentLiquidation.com is a Liquidity Services property (same parent as
  // GovDeals). ToS prohibits automated access. Cloudflare blocks all programmatic fetches.
  // Unpark path: data partnership with Liquidity Services, Inc. (same path as GovDeals).
  // Verified: 2026-06-10 — all fetch attempts returned empty/timed out (Cloudflare).
  console.log('[GovernmentLiquidation] PARKED: ToS PROHIBITED (Liquidity Services / same parent as GovDeals) + Cloudflare bot protection. Exiting cleanly.');

  return {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };
}
