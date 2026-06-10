/**
 * StorageTreasures scraper adapter
 * Source: https://www.storagetreasures.com
 * ToS: GRAY area — MySpace-era social-platform boilerplate, no explicit anti-scraping clause
 * robots.txt: Open — Allow: / for all agents, only Disallow /account/
 *
 * PARKED — Full SPA (Next.js), no static HTML data; public API key hard-capped at 50 records.
 *
 * Investigation results (2026-06-10):
 *
 * 1. HTML pages (/auctions, /auctions/mi, /facility/*) are Next.js SPA shells.
 *    All __NEXT_DATA__ initialState arrives empty (auctions:[], facility_list:[]).
 *    Data loads entirely via client-side API calls — zero facility records in static HTML.
 *
 * 2. Public API endpoint discovered in appConfig base64:
 *    https://api.st-prd-1.aws.storagetreasures.com/p/
 *    API key (public, embedded in every page): oiXHdXqV7N1hm4y9qA8NGJCqBa9tSs6aU6dBBQCf
 *
 * 3. /p/facilities endpoint confirms 36,943 total US storage facilities exist.
 *    BUT: the public key is hard-capped at 50 records regardless of page/per_page/state params.
 *    All pagination params (page=2, offset=N, state=MI) are silently ignored server-side.
 *    The same 50 IDs return every time.
 *
 * 4. Facility names in the 50-record cap are truncated server-side with literal "..." suffixes
 *    (e.g. "Global Self Storage of...", "Battle Creek Self Stor...", "A Family Storage - Cou...")
 *    making data quality unacceptable for production ingestion.
 *
 * 5. /p/facility/:id (single-facility detail) returns {"message":"Missing Authentication Token"}
 *    — requires authenticated session, not available via public key.
 *
 * To unpark (choose one):
 *   A) Obtain an authenticated API session (register as a storage facility manager, intercept
 *      the Cognito JWT from network traffic, use it for paginated /p/facilities calls).
 *   B) Playwright/Puppeteer headless browser: load /auctions/[state] pages, wait for React
 *      hydration, extract facility names from the rendered DOM.
 *   C) State-by-state auction scrape via /p/auctions?type=state&term=[ST] — also 50-cap but
 *      returns facility_name + city + state per live auction. Useful for active organizers only;
 *      does not cover facilities without current auctions.
 *
 * ADR-073: Directory Scraper — Phase 2 candidate
 */

import { RateLimiter } from '../rateLimiter';
import { ScrapeStats } from '../sourceRegistry';

/**
 * StorageTreasures scraper — parked (SPA + public API capped at 50 truncated records).
 * Returns zero stats cleanly. See file header for unpark paths.
 */
export async function scrapeStorageTreasures(
  _metro: string,
  _organizerId: string,
  _rateLimiter: RateLimiter
): Promise<ScrapeStats> {
  // PARKED: StorageTreasures is a full Next.js SPA — no static HTML data.
  // Public API key (embedded in page HTML) is hard-capped at 50 records with
  // truncated names; pagination and state filters are ignored server-side.
  // 36,943 facilities exist but are inaccessible without an authenticated session.
  // Unpark path: Playwright headless rendering OR authenticated Cognito JWT API access.
  // Verified: 2026-06-10 — /auctions/mi returned empty __NEXT_DATA__, /p/facilities
  // confirmed 36,943 total but returned same 50 truncated records on all param variants.
  console.log(
    '[StorageTreasures] PARKED: Full SPA + public API capped at 50 truncated records. ' +
    '36,943 facilities exist but require authenticated API access. Exiting cleanly.'
  );

  return {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };
}
