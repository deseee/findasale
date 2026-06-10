/**
 * Handbid.com scraper adapter
 * Source: https://events.handbid.com/organizations
 * ToS: CLEAR — Handbid End User Terms (April 21, 2026, v2.0) contain zero prohibition
 *   language for scraping, crawling, or automated access. Section 7 (User Conduct)
 *   references an AUP at handbid.com/aup but focuses entirely on bidding conduct,
 *   not data collection. No "scrape", "crawl", "automated", "spider", "bot",
 *   "aggregate", or "harvest" language found anywhere in the ToS.
 *   Verified: 2026-06-10.
 *
 * robots.txt: Fully open — User-agent: * Allow: /. All major bots explicitly allowed
 *   (OAI-SearchBot, GPTBot, Googlebot, Screaming Frog, SEBot-WA).
 *   Verified: 2026-06-10.
 *
 * HTML access: STATIC — events.handbid.com/organizations renders 789 organizations
 *   across 33 pages of plain server-rendered HTML. No JS required. Each entry
 *   contains org name, city, state, and open auction count.
 *   Verified: 2026-06-10.
 *
 * PARKED — WRONG CATEGORY. The 789 Handbid organizations are overwhelmingly
 *   nonprofits, charities, PTAs, school fundraisers, country clubs, sports teams,
 *   and alumni associations — NOT government surplus / municipal auction houses.
 *   FindA.Sale targets organizers running estate sales, yard sales, auctions, and
 *   flea markets. Handbid's user base is a fundraising gala platform with no overlap.
 *
 *   Sample orgs from page 1: "PS 150 Parent Teacher Association", "Jake Owen
 *   Foundation", "Aberdeen Catholic School System", "Aces for Autism",
 *   "Air Force Athletics" (sports, not surplus), "Alexandria Little League".
 *
 * Unpark path: Only relevant if FindA.Sale expands to nonprofit auction events
 *   (benefit galas, school auctions). If that product direction is approved, this
 *   scraper is straightforward: paginate /organizations?page=N, extract org name +
 *   city/state from static HTML. businessCategory would be 'AUCTION_HOUSE'.
 *   Zero technical blockers — purely a product category decision.
 *
 * ADR-073: Directory Scraper — PARKED (wrong category, not gov surplus)
 */

import { RateLimiter } from '../rateLimiter';
import { ScrapeStats } from '../sourceRegistry';

/**
 * Handbid organizations scraper — parked (wrong category).
 * Returns zero stats cleanly. See file header for unpark path.
 */
export async function scrapeHandbid(
  _metro: string,
  _organizerId: string,
  _rateLimiter: RateLimiter,
): Promise<ScrapeStats> {
  // PARKED: Handbid orgs are nonprofits/charities/school PTAs — not government surplus.
  // ToS is CLEAR and HTML is static — technically trivial to build, wrong category.
  // Unpark when FindA.Sale expands to nonprofit fundraising auction events.
  // Verified: 2026-06-10 — 789 orgs across 33 pages, all nonprofit/charity category.
  console.log('[Handbid] PARKED: Wrong category (nonprofits/charities, not gov surplus). Exiting cleanly.');

  return {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };
}
