/**
 * SwapmeetDirectory scraper
 * Source: https://swapmeetdirectory.com (WordPress + GeoDirectory plugin)
 *
 * robots.txt: Fully open — only disallows WooCommerce paths and /wp-admin
 * ToS: No anti-scraping language found
 *
 * Strategy:
 *   1. Paginate /flea-markets/page/N/ (confirmed 89 pages, ~10/page ≈ 890 US records)
 *   2. Extract listing URL and state (category badge) from each index card
 *   3. Fetch each individual listing page and parse:
 *      - City  : <span itemprop="addressLocality">
 *      - State : <span itemprop="addressRegion"> (full state name → abbr)
 *      - Phone : <a href="tel:..."> badge on detail page
 *      - Website: geodir-field-website anchor
 *      - Lat/Lng: data-lat / data-lng on the map div
 *   4. Upsert via getOrCreateScrapedOrganizer
 *
 * Crawl delay: 2–3 s between requests (polite to WordPress host)
 * ADR-073: Directory Scraper Phase 1
 */

import * as cheerio from 'cheerio';
import { RateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';
import { ScrapeStats } from '../sourceRegistry';

const SMD_BASE_URL = 'https://swapmeetdirectory.com';
const SOURCE_NAME = 'SwapmeetDirectory';
const MAX_INDEX_PAGES = 150; // safety ceiling (confirmed ~89 real pages)
const CRAWL_DELAY_MS = 2500; // 2–3 s average

/**
 * US full state name → two-letter abbreviation.
 * SwapmeetDirectory stores full state names in <span itemprop="addressRegion">.
 */
const STATE_NAME_TO_ABBR: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT',
  'district of columbia': 'DC', 'delaware': 'DE', 'florida': 'FL',
  'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL',
  'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS', 'kentucky': 'KY',
  'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD', 'massachusetts': 'MA',
  'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH',
  'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY',
};

interface SMDIndexListing {
  url: string;
  /** Full state name from badge, e.g. "Pennsylvania" (may be empty) */
  stateName: string;
}

interface SMDVenue {
  name: string;
  city: string;
  state: string; // two-letter abbreviation
  phone?: string;
  website?: string;
  lat?: number;
  lng?: number;
}

/**
 * Decode HTML entities in listing names (e.g. &#8217; → ').
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#38;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Fetch one index page (/flea-markets/ or /flea-markets/page/N/) and return
 * listing URLs + state names.
 * Returns [] when the page 404s, is empty, or the listing grid is absent.
 */
async function fetchIndexPage(pageNum: number): Promise<SMDIndexListing[]> {
  const url =
    pageNum === 1
      ? `${SMD_BASE_URL}/flea-markets/`
      : `${SMD_BASE_URL}/flea-markets/page/${pageNum}/`;

  let html: string;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      // 404 signals end of pagination
      if (response.status === 404) {
        console.log(`[SwapmeetDirectory] Index page ${pageNum}: 404 — end of pagination`);
      } else {
        console.warn(`[SwapmeetDirectory] Index page ${pageNum}: HTTP ${response.status}`);
      }
      return [];
    }

    html = await response.text();
  } catch (err) {
    console.warn(`[SwapmeetDirectory] Index page ${pageNum} fetch failed:`, err);
    return [];
  }

  const $ = cheerio.load(html);
  const listings: SMDIndexListing[] = [];

  // Each card: .col.mb-4.geodir-post
  // Title link: .geodir-entry-title a[href]
  // State badge: a[data-badge="default_category"] — text is full state name
  $('.geodir-post').each((_i, card) => {
    const titleAnchor = $(card).find('.geodir-entry-title a').first();
    const href = titleAnchor.attr('href') ?? '';
    if (!href || !href.startsWith(SMD_BASE_URL)) return;

    // State comes from the category badge (full state name, e.g. "Texas")
    const stateName =
      $(card)
        .find('a[data-badge="default_category"]')
        .first()
        .text()
        .trim() ?? '';

    listings.push({ url: href, stateName });
  });

  return listings;
}

/**
 * Fetch an individual listing detail page and parse venue data.
 *
 * Data sources on the detail page:
 *   - Name         : <h1 class="entry-title">
 *   - City         : <span itemprop="addressLocality">
 *   - State (full) : <span itemprop="addressRegion">
 *   - Phone        : <a href="tel:..."> inside .gd-badge-meta
 *   - Website      : .geodir-field-website a[href]
 *   - Lat/Lng      : data-lat / data-lng on .geodir-map-canvas
 */
function parseDetailPage(html: string): Omit<SMDVenue, 'state'> & { stateRaw: string } | null {
  const $ = cheerio.load(html);

  // Name
  const name = decodeHtmlEntities($('h1.entry-title').first().text().trim());
  if (!name) return null;

  // City
  const city = $('span[itemprop="addressLocality"]').first().text().trim();

  // State (full name — will convert to abbr in caller)
  const stateRaw = $('span[itemprop="addressRegion"]').first().text().trim();

  // Phone: href="tel:15551234567" → normalise to "+15551234567"
  let phone: string | undefined;
  const telHref = $('a[href^="tel:"]').first().attr('href') ?? '';
  if (telHref) {
    const digits = telHref.replace('tel:', '').replace(/\D/g, '');
    if (digits.length >= 10) {
      phone = `+${digits}`;
    }
  }

  // Website: .geodir-field-website a
  let website: string | undefined;
  const webHref = $('[class*="geodir-field-website"] a').first().attr('href') ?? '';
  if (webHref && webHref.startsWith('http')) {
    website = webHref;
  }

  // Lat/Lng from map canvas data attributes
  let lat: number | undefined;
  let lng: number | undefined;
  const mapCanvas = $('[data-lat][data-lng]').first();
  if (mapCanvas.length) {
    const rawLat = mapCanvas.attr('data-lat') ?? '';
    const rawLng = mapCanvas.attr('data-lng') ?? '';
    const parsedLat = parseFloat(rawLat);
    const parsedLng = parseFloat(rawLng);
    if (!isNaN(parsedLat)) lat = parsedLat;
    if (!isNaN(parsedLng)) lng = parsedLng;
  }

  if (!city) return null;

  return { name, city, stateRaw, phone, website, lat, lng };
}

/**
 * Fetch one detail page with rate limiting and return a fully resolved SMDVenue,
 * or null if the page is unparseable or state cannot be resolved.
 *
 * State resolution priority:
 *   1. <span itemprop="addressRegion"> on the detail page (most accurate)
 *   2. stateName hint passed in from the index page badge
 */
async function fetchDetailPage(
  url: string,
  stateHint: string,
  rateLimiter: RateLimiter
): Promise<SMDVenue | null> {
  const domain = new URL(SMD_BASE_URL).hostname;
  await rateLimiter.waitBeforeRequest(domain);

  let html: string;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      console.warn(`[SwapmeetDirectory] Detail page HTTP ${response.status}: ${url}`);
      return null;
    }

    html = await response.text();
  } catch (err) {
    console.warn(`[SwapmeetDirectory] Detail page fetch failed: ${url}:`, err);
    return null;
  }

  const parsed = parseDetailPage(html);
  if (!parsed) {
    console.warn(`[SwapmeetDirectory] Could not parse detail page: ${url}`);
    return null;
  }

  // Resolve state abbreviation
  const rawStateName = parsed.stateRaw || stateHint;
  const stateAbbr = STATE_NAME_TO_ABBR[rawStateName.toLowerCase()] ?? '';

  const { stateRaw: _dropped, ...rest } = parsed;
  return { ...rest, state: stateAbbr };
}

/**
 * Main entry point for SwapmeetDirectory scraper.
 * Paginates all /flea-markets/ pages, then fetches each detail page.
 * Runs as national-once (metro and organizerId params are ignored).
 */
export async function scrapeSwapmeetDirectory(
  _metro: string,
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

  await rateLimiter.loadRobotsTxt(SMD_BASE_URL);
  console.log('[SwapmeetDirectory] Starting scrape — paginating /flea-markets/');

  // ── Phase 1: collect all listing URLs from index pages ──────────────────────
  const allListings: SMDIndexListing[] = [];

  for (let page = 1; page <= MAX_INDEX_PAGES; page++) {
    const domain = new URL(SMD_BASE_URL).hostname;
    await rateLimiter.waitBeforeRequest(domain);

    const listings = await fetchIndexPage(page);

    if (listings.length === 0) {
      console.log(`[SwapmeetDirectory] Page ${page}: 0 listings — stopping pagination`);
      break;
    }

    console.log(`[SwapmeetDirectory] Page ${page}: found ${listings.length} listing links`);
    allListings.push(...listings);

    // Polite delay between index pages
    await new Promise((resolve) => setTimeout(resolve, CRAWL_DELAY_MS + Math.random() * 500));
  }

  // Deduplicate across pages
  const seen = new Set<string>();
  const uniqueListings = allListings.filter((l) => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });

  console.log(`[SwapmeetDirectory] Total unique listings: ${uniqueListings.length}`);

  // ── Phase 2: fetch each detail page and ingest ──────────────────────────────
  for (const listing of uniqueListings) {
    const venue = await fetchDetailPage(listing.url, listing.stateName, rateLimiter);

    if (!venue) {
      stats.itemsFailed++;
      continue;
    }

    if (!venue.state) {
      console.warn(
        `[SwapmeetDirectory] No state resolved for "${venue.name}" (${venue.city}) — ${listing.url} — skipping`
      );
      stats.itemsSkipped++;
      continue;
    }

    stats.itemsFound++;

    try {
      const orgId = await getOrCreateScrapedOrganizer(
        venue.name,
        SOURCE_NAME,
        venue.city,
        venue.state,
        undefined, // esnOrgId
        undefined, // googlePlaceId
        undefined, // foursquareVenueId
        undefined, // hereBusinessId
        'FLEA_MARKET',
        undefined, // contactEmail
        venue.phone,
        venue.website,
        venue.lat,
        venue.lng
      );

      if (orgId === null) {
        stats.itemsSkipped++;
      } else {
        stats.itemsCreated++;
      }
    } catch (err) {
      console.error(
        `[SwapmeetDirectory] Failed to ingest "${venue.name}" (${venue.city}, ${venue.state}):`,
        err
      );
      stats.itemsFailed++;
    }

    // Polite delay between detail page fetches
    await new Promise((resolve) => setTimeout(resolve, CRAWL_DELAY_MS + Math.random() * 500));
  }

  console.log('[SwapmeetDirectory] ──────────────────────────────────────────────────────');
  console.log(
    `[SwapmeetDirectory] TOTAL — found ${stats.itemsFound}, created ${stats.itemsCreated}, ` +
    `updated ${stats.itemsUpdated}, skipped ${stats.itemsSkipped}, failed ${stats.itemsFailed}`
  );
  console.log('[SwapmeetDirectory] ──────────────────────────────────────────────────────');

  if (stats.itemsFound === 0) {
    console.warn(
      '[SwapmeetDirectory] Completed with zero results — source may be blocked or changed markup'
    );
  }

  return stats;
}
