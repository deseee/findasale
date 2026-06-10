/**
 * GovPlanet.com scraper adapter
 * Source: https://www.govplanet.com
 * ToS: PROHIBITED — Section 1.3(c) of the IronPlanet/GovPlanet Site Usage Terms and
 *   Conditions (revised April 17, 2026) explicitly bans "any robot, spider, scraper,
 *   data mining tool, data gathering or extraction tool, or any other automated means
 *   to access, collect, copy, or record the Services."
 *
 * GovPlanet is operated by IronPlanet, Inc. (a Ritchie Bros. / RB Global subsidiary).
 * It is one of the largest US government surplus equipment auction platforms, listing
 * assets from DoD Disposition Services, municipal fleets, state DOTs, utilities, and
 * other public agencies. The /sellers page contains ~45 named government agencies
 * in static HTML, but the ToS prohibition covers "the Services" broadly and is explicit.
 *
 * robots.txt: Permissive for most paths (only auth/search JSPs disallowed).
 * HTML access: Static — /sellers renders full agency directory without JS.
 *
 * PARKED — ToS PROHIBITED. Do not activate without written data partnership
 * agreement with Ritchie Bros. / IronPlanet, Inc.
 *
 * Unpark path: Negotiate a data partnership with Ritchie Bros. (similar to the
 * route required for Municibid). The /sellers directory is a natural lead-gen
 * page they may agree to syndicate. Contact: customercare@ritchiebros.com.
 *
 * ADR-073: Directory Scraper Phase 2 candidate (partnership required)
 */

import { RateLimiter } from '../rateLimiter';
import { ScrapeStats } from '../sourceRegistry';

/**
 * GovPlanet scraper — parked (ToS PROHIBITED).
 * Returns zero stats cleanly. See file header for unpark path.
 */
export async function scrapeGovPlanet(
  _metro: string,
  _organizerId: string,
  _rateLimiter: RateLimiter,
): Promise<ScrapeStats> {
  // PARKED: GovPlanet ToS Section 1.3(c) explicitly bans automated access.
  // The /sellers page is static HTML with ~45 government agency names,
  // but the IronPlanet Site Usage Terms (Ritchie Bros.) prohibit scraping broadly.
  // Unpark path: data partnership agreement with Ritchie Bros. / IronPlanet, Inc.
  // Verified: 2026-06-10 — ToS confirmed PROHIBITED, /sellers confirmed static.
  console.log('[GovPlanet] PARKED: ToS PROHIBITED (Section 1.3(c) — explicit scraper ban). Exiting cleanly.');

  return {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };
}
