/**
 * BidSpotter.com scraper adapter
 * Source: https://www.bidspotter.com/en-us/auctioneers
 * ToS: Confirmed CLEAR — terms at /en-us/about-us/legal/website-terms-and-conditions.
 *   No anti-scraping language. Standard copyright + general use terms only.
 *   Reviewed 2026-06-10.
 * robots.txt: Open — Disallow entries cover only /Account*, /admin, /api, /Search*
 *   path prefixes. /en-us/auctioneers is explicitly crawlable.
 *
 * BidSpotter is a Proxibid subsidiary providing online bidding for general auction houses.
 * The /en-us/auctioneers directory lists all registered auction companies with name,
 * address, city, state, zip, country, and phone — served as static HTML when the
 * X-Requested-With: XMLHttpRequest header is present (otherwise returns 0 bytes).
 *
 * The page is NOT paginated — all ~35 US entries appear on one request.
 * Filter: include only entries with country = "United States".
 * businessCategory: AUCTION_HOUSE (general auction houses, not storage-specific).
 *
 * Rate limit: single-page fetch, minimal load. Still passes through RateLimiter
 * for consistency with the rest of the scraper fleet.
 *
 * ADR-073: Directory Scraper Phase 1
 */

import * as cheerio from 'cheerio';
import { RateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';
import { ScrapeStats } from '../sourceRegistry';

const BIDSPOTTER_BASE_URL = 'https://www.bidspotter.com';
const AUCTIONEERS_PATH = '/en-us/auctioneers';
const BIDSPOTTER_DOMAIN = 'www.bidspotter.com';
const SOURCE_NAME = 'BidSpotter';

/**
 * Fetch the BidSpotter auctioneers directory page.
 * Requires X-Requested-With: XMLHttpRequest header — without it the server returns
 * an empty body (verified 2026-06-10).
 */
async function fetchAuctioneersPage(rateLimiter: RateLimiter): Promise<string> {
  await rateLimiter.waitBeforeRequest(BIDSPOTTER_DOMAIN);

  const url = `${BIDSPOTTER_BASE_URL}${AUCTIONEERS_PATH}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': BIDSPOTTER_BASE_URL,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`[BidSpotter] HTTP ${response.status} fetching ${url}`);
  }

  return response.text();
}

/**
 * Parse a cheerio `<address>` block into city, state, zip, country parts.
 * The address block contains multiple `<span>` elements and text nodes.
 * Structure varies but typically:
 *   <span>Street</span>
 *   <span>City, State Zip</span>
 *   <span>Country</span>
 * or plain text nodes with the same content.
 */
function parseAddress(addressText: string): {
  city: string | null;
  state: string | null;
  country: string | null;
} {
  const lines = addressText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let city: string | null = null;
  let state: string | null = null;
  let country: string | null = null;

  for (const line of lines) {
    // Country line: plain country names
    if (/^United States$/i.test(line) || /^Canada$/i.test(line) || /^Australia$/i.test(line)) {
      country = line;
      continue;
    }

    // City, State Zip pattern: "Grand Rapids, MI 49503"
    const cityStateZip = line.match(/^(.+),\s+([A-Z]{2})\s+\d{5}/);
    if (cityStateZip) {
      city = cityStateZip[1].trim();
      state = cityStateZip[2];
      continue;
    }

    // City, State without zip: "Grand Rapids, MI"
    const cityState = line.match(/^(.+),\s+([A-Z]{2})$/);
    if (cityState) {
      city = cityState[1].trim();
      state = cityState[2];
      continue;
    }
  }

  return { city, state, country };
}

/**
 * Extract a phone number from text content.
 */
function extractPhone(text: string): string | null {
  const match = text.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  return match ? match[0].trim() : null;
}

/**
 * Scrape the BidSpotter auctioneers directory and upsert US auction house organizers.
 * Single-page fetch — no pagination. Filters to United States entries only.
 */
export async function scrapeBidSpotter(
  metro: string,
  _organizerId: string,
  rateLimiter: RateLimiter
): Promise<ScrapeStats> {
  const stats: ScrapeStats = {
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
  };

  console.log(`[BidSpotter] Starting auctioneers directory scrape (metro: ${metro})`);

  let html: string;
  try {
    html = await fetchAuctioneersPage(rateLimiter);
  } catch (err) {
    console.error(`[BidSpotter] Failed to fetch auctioneers page:`, err);
    stats.itemsFailed++;
    return stats;
  }

  const $ = cheerio.load(html);

  // Each auctioneer card contains an h2 > a linking to /en-us/auction-catalogues/SLUG.
  // The container holds address block and phone paragraph as siblings.
  const nameLinks = $('h2 a[href*="/en-us/auction-catalogues/"]');

  if (nameLinks.length === 0) {
    console.warn(`[BidSpotter] No auctioneer cards found — page structure may have changed. Body length: ${html.length}`);
    return stats;
  }

  console.log(`[BidSpotter] Found ${nameLinks.length} auctioneer entries on the directory page`);

  for (let i = 0; i < nameLinks.length; i++) {
    const nameEl = nameLinks.eq(i);
    const name = nameEl.text().trim();
    if (!name) {
      stats.itemsSkipped++;
      continue;
    }

    // Walk up to the containing block to find sibling address and phone elements
    const container = nameEl.closest('div, article, li, section');
    if (!container.length) {
      console.warn(`[BidSpotter] Could not find container for entry: ${name}`);
      stats.itemsSkipped++;
      continue;
    }

    const addressEl = container.find('address');
    const addressText = addressEl.length ? addressEl.text() : '';
    const { city, state, country } = parseAddress(addressText);

    // Filter to US only — skip if country is present and not US
    if (country && !/united states/i.test(country)) {
      stats.itemsSkipped++;
      continue;
    }

    // Skip if no city/state (insufficient data for dedup)
    if (!city || !state) {
      console.warn(`[BidSpotter] Skipping "${name}" — no city/state found in address block`);
      stats.itemsSkipped++;
      continue;
    }

    // Extract phone from any paragraph in the container
    const containerText = container.text();
    const phone = extractPhone(containerText);

    // Profile URL for legalNote/sourceUrl reference
    const profileHref = nameEl.attr('href') || '';
    const _sourceUrl = profileHref.startsWith('http')
      ? profileHref
      : `${BIDSPOTTER_BASE_URL}${profileHref}`;

    stats.itemsFound++;

    try {
      const orgId = await getOrCreateScrapedOrganizer(
        name,
        SOURCE_NAME,
        city,
        state,
        undefined, // esnOrgId
        undefined, // googlePlaceId
        undefined, // foursquareVenueId
        undefined, // hereBusinessId
        'AUCTION_HOUSE',
        undefined, // contactEmail
        phone ?? undefined, // phone
        undefined  // website
      );

      if (orgId === null) {
        stats.itemsSkipped++;
        stats.itemsFound--; // undo: already exists
      } else {
        stats.itemsCreated++;
        console.log(`[BidSpotter] Created: ${name} (${city}, ${state})`);
      }
    } catch (err) {
      console.error(`[BidSpotter] Failed to upsert organizer "${name}":`, err);
      stats.itemsFailed++;
    }

    // Polite delay between DB upserts
    if (i < nameLinks.length - 1) {
      await rateLimiter.waitBeforeRequest(BIDSPOTTER_DOMAIN);
    }
  }

  console.log(
    `[BidSpotter] Complete — found: ${stats.itemsFound}, created: ${stats.itemsCreated}, ` +
    `skipped: ${stats.itemsSkipped}, failed: ${stats.itemsFailed}`
  );

  return stats;
}
