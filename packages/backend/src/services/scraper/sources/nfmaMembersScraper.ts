/**
 * NFMA (National Flea Market Association) member directory scraper adapter
 * Source: https://www.fleamarkets.org/nfma-member-markets
 * Investigation date: 2026-06-10
 *
 * PARKED — member directory is Wix.com JS-rendered; no member data in static HTML.
 *
 * Note on domain: nfma.org is the National Federation of MUNICIPAL ANALYSTS (finance).
 * The correct National Flea Market Association lives at fleamarkets.org (also responds
 * at nationalfleamarketassociation.com which redirects here).
 *
 * robots.txt (fleamarkets.org): "User-agent: * / Allow: / / Disallow: *?lightbox="
 *   — open for crawling. PetalBot blocked; dotbot/AhrefsBot rate-limited.
 *   Listing path /nfma-member-markets is NOT disallowed.
 * ToS / Privacy Policy: No anti-scraping language. Privacy policy covers user data
 *   collection only (COPPA/GDPR). No prohibition on reading public member names.
 * Static HTML: Wix.com Website Builder renders content client-side. The static HTTP
 *   fetch of /nfma-member-markets returns the full page shell with the heading
 *   "Current NFMA Members" but zero member records in the HTML body — all member
 *   data is injected by Wix JavaScript after page load.
 * Sitemap: pages-sitemap.xml lists /nfma-member-markets as a single page — no
 *   individual member sub-pages exist in the sitemap.
 *
 * Scale estimate: NFMA states "over 1100 flea markets" in the US; member markets
 *   are a curated subset (likely 50–200 named venues based on association size).
 *
 * To unpark:
 *   Option A — Playwright/Puppeteer headless: navigate to /nfma-member-markets,
 *     wait for Wix JS to populate the member list, parse rendered DOM.
 *   Option B — Wix Data API: inspect Network tab for Wix backend JSON calls
 *     (Wix typically hits /_api/wix-data-catalog-reader-server/... or similar).
 *     If a public JSON endpoint exists, use it directly (no browser needed).
 *   Option C — Contact NFMA: association is small/friendly; data partnership
 *     possible given mutual benefit.
 *
 * ADR-073: Directory Scraper — Phase 2 candidate (Playwright or Wix API)
 */

import { RateLimiter } from '../rateLimiter';
import { ScrapeStats } from '../sourceRegistry';

/**
 * NFMA (fleamarkets.org) member directory scraper — parked (Wix JS-rendered, no static data).
 * Returns zero stats cleanly. See file header for unpark path.
 */
export async function scrapeNFMAMembers(
  _metro: string,
  _organizerId: string,
  _rateLimiter: RateLimiter
): Promise<ScrapeStats> {
  // PARKED: fleamarkets.org/nfma-member-markets member list is rendered by Wix.com JavaScript.
  // Static HTTP fetch returns page shell with "Current NFMA Members" heading but zero records.
  // robots.txt: OPEN — /nfma-member-markets not disallowed.
  // ToS / Privacy Policy: No anti-scraping language.
  // Unpark path: Playwright headless rendering OR Wix Data API endpoint discovery.
  // Verified: 2026-06-10 — static HTML contained no member names or venue data.
  console.log('[NFMAMembers] PARKED: fleamarkets.org member directory is Wix JS-rendered — no static listings available. Exiting cleanly.');

  return {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };
}
