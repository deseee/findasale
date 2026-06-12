/**
 * Fleamapket scraper
 * Source: https://www.fleamapket.com  (MUST use www — bare domain 301s)
 *
 * robots.txt: explicitly ALLOWS /listing/, /listing-category/, /listing-region/
 * ToS: No anti-scraping language found
 *
 * Strategy:
 *   1. Paginate /listing-region/usa/page/{N}/ (max 14 pages, 30/page ≈ 400 US records)
 *   2. Extract listing URL + primary category from each card
 *   3. Skip online-only categories (online-shops, online-antique-store, online-auction-house)
 *   4. Fetch each individual listing page and parse JSON-LD for structured data
 *   5. Upsert via getOrCreateScrapedOrganizer
 *
 * Crawl delay: 2–3 s between requests (polite to WordPress host)
 * ADR-073: Directory Scraper Phase 1
 */

import * as cheerio from 'cheerio';
import { RateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';
import { ScrapeStats } from '../sourceRegistry';

const FMK_BASE_URL = 'https://www.fleamapket.com';
const SOURCE_NAME = 'Fleamapket';
const MAX_INDEX_PAGES = 20; // safety ceiling (confirmed 14 real pages)
const CRAWL_DELAY_MS = 2500; // 2–3 s average

/**
 * Categories that indicate online-only businesses — skip these
 * (no physical venue, not useful for organizer discovery)
 */
const SKIP_CATEGORIES = new Set([
  'online-shops',
  'online-antique-store',
  'online-auction-house',
]);

/**
 * Map Fleamapket listing-category slug → FindA.Sale businessCategory enum value
 */
function mapCategory(categorySlug: string): string {
  switch (categorySlug) {
    case 'flea-markets':
    case 'weekly-flea-market':
    case 'daily-flea-markets':
    case 'monthly-flea-market':
    case 'rare-flea-market':
    case 'highway-yard-sale':
    case 'thrift-shops':
    case 'vintage-clothing':
      return 'FLEA_MARKET';
    case 'antique-malls':
    case 'antique-fairs':
    case 'antique-stores':
    case 'antique-shops':
    case 'city-antique-districts':
      return 'ANTIQUE_MALL';
    case 'auction':
      return 'AUCTION_HOUSE';
    default:
      return 'FLEA_MARKET'; // sensible fallback for unrecognised slugs
  }
}

interface FMKListing {
  url: string;
  categorySlug: string;
}

interface FMKVenue {
  name: string;
  city: string;
  state: string;
  phone?: string;
  website?: string;
  lat?: number;
  lng?: number;
  businessCategory: string;
}

/**
 * US state name → two-letter abbreviation map.
 * Used when parsing the full address string from JSON-LD.
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

/**
 * Parse state abbreviation from a full address string like:
 * "80 Pearl Street, Brooklyn, New York 11201, United States"
 *  → "NY"
 *
 * Format is generally: "Street, City, State Zip, Country"
 * We split by ", " and look for a segment matching "StateName Zip"
 */
function parseStateFromFullAddress(fullAddress: string): string {
  // Split by ", " and inspect each segment
  const parts = fullAddress.split(', ');
  for (const part of parts) {
    // Match "State Name 12345" pattern
    const m = part.match(/^([A-Za-z][A-Za-z\s]+?)\s+\d{5}(?:-\d{4})?$/);
    if (m) {
      const stateName = m[1].trim().toLowerCase();
      const abbr = STATE_NAME_TO_ABBR[stateName];
      if (abbr) return abbr;
    }
  }
  return '';
}

/**
 * Extract a usable website URL from JSON-LD sameAs field.
 * sameAs may be a string or an array of strings (social + website).
 * Returns the first non-social-media URL, or undefined.
 */
function extractWebsite(sameAs: unknown): string | undefined {
  const SOCIAL_DOMAINS = ['facebook.com', 'twitter.com', 'instagram.com', 'x.com', 'linkedin.com', 'youtube.com', 'yelp.com', 'pinterest.com', 'tiktok.com'];

  const isSocial = (url: string) => SOCIAL_DOMAINS.some((d) => url.includes(d));

  if (typeof sameAs === 'string' && sameAs.startsWith('http') && !isSocial(sameAs)) {
    return sameAs;
  }
  if (Array.isArray(sameAs)) {
    for (const url of sameAs) {
      if (typeof url === 'string' && url.startsWith('http') && !isSocial(url)) {
        return url;
      }
    }
  }
  return undefined;
}

/**
 * Parse venue data from an individual listing page HTML.
 * Fleamapket embeds two LocalBusiness JSON-LD blocks:
 *   Block A (@context https://schema.org): has geo.latitude/longitude, address.addressLocality
 *   Block B (@context http://www.schema.org): has address.address (full), address.lat/lng
 * We read both and combine.
 */
function parseListingPage(html: string, categorySlug: string): Omit<FMKVenue, 'businessCategory'> | null {
  const $ = cheerio.load(html);

  let name = '';
  let city = '';
  let state = '';
  let phone: string | undefined;
  let website: string | undefined;
  let lat: number | undefined;
  let lng: number | undefined;

  $('script[type="application/ld+json"]').each((_i, el) => {
    const raw = $(el).html()?.trim() ?? '';
    if (!raw) return;

    let ld: Record<string, unknown>;
    try {
      ld = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    const typeField = ld['@type'];
    const isLocalBusiness =
      typeField === 'LocalBusiness' ||
      (Array.isArray(typeField) && typeField.includes('LocalBusiness'));

    if (!isLocalBusiness) return;

    // Name
    if (!name && typeof ld['name'] === 'string') {
      name = ld['name'].trim();
    }

    // Phone
    if (!phone && typeof ld['telephone'] === 'string') {
      phone = ld['telephone'].trim() || undefined;
    }

    // Website from sameAs
    if (!website) {
      website = extractWebsite(ld['sameAs']);
    }

    // Address object
    const addr = ld['address'];
    if (addr && typeof addr === 'object' && !Array.isArray(addr)) {
      const addrObj = addr as Record<string, unknown>;

      // City from addressLocality (Block A)
      if (!city && typeof addrObj['addressLocality'] === 'string') {
        city = addrObj['addressLocality'].trim();
      }

      // State from full address string (Block B: address.address)
      if (!state && typeof addrObj['address'] === 'string') {
        state = parseStateFromFullAddress(addrObj['address']);
      }

      // Lat/lng from Block B address.lat / address.lng
      if (lat === undefined && typeof addrObj['lat'] === 'string') {
        const parsed = parseFloat(addrObj['lat']);
        if (!isNaN(parsed)) lat = parsed;
      }
      if (lng === undefined && typeof addrObj['lng'] === 'string') {
        const parsed = parseFloat(addrObj['lng']);
        if (!isNaN(parsed)) lng = parsed;
      }
    }

    // Geo from Block A (geo.latitude / geo.longitude)
    const geo = ld['geo'];
    if (geo && typeof geo === 'object' && !Array.isArray(geo)) {
      const geoObj = geo as Record<string, unknown>;
      if (lat === undefined) {
        const rawLat = geoObj['latitude'];
        const parsed = typeof rawLat === 'number' ? rawLat : parseFloat(String(rawLat ?? ''));
        if (!isNaN(parsed)) lat = parsed;
      }
      if (lng === undefined) {
        const rawLng = geoObj['longitude'];
        const parsed = typeof rawLng === 'number' ? rawLng : parseFloat(String(rawLng ?? ''));
        if (!isNaN(parsed)) lng = parsed;
      }
    }
  });

  if (!name || !city) return null;

  return { name, city, state, phone, website, lat, lng };
}

/**
 * Fetch one Fleamapket index page and extract listing URLs + primary categories.
 * The first category in the `.c27-listing-preview-category-list` element of each
 * card is the listing's primary category.
 */
async function fetchIndexPage(pageNum: number): Promise<FMKListing[]> {
  const url = pageNum === 1
    ? `${FMK_BASE_URL}/listing-region/usa/`
    : `${FMK_BASE_URL}/listing-region/usa/page/${pageNum}/`;

  let html: string;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      console.warn(`[Fleamapket] Index page ${pageNum}: HTTP ${response.status}`);
      return [];
    }

    html = await response.text();
  } catch (err) {
    console.warn(`[Fleamapket] Index page ${pageNum} fetch failed:`, err);
    return [];
  }

  const $ = cheerio.load(html);
  const listings: FMKListing[] = [];

  // Each listing card: anchor to /listing/{slug}/ followed by category list
  // The relationship is established by the card container (.job_listing or .listing-card)
  // We find all listing links and their associated first category from the preview list
  $('a[href*="/listing/"]').each((_i, el) => {
    const href = $(el).attr('href') ?? '';
    if (!href.startsWith(`${FMK_BASE_URL}/listing/`)) return;
    if (href === `${FMK_BASE_URL}/listing/`) return; // skip bare /listing/ index link

    // Walk up to the card container and find the first category
    const card = $(el).closest('li, .job-listing, [class*="listing"], article').first();
    let categorySlug = '';

    if (card.length) {
      // Category in .c27-listing-preview-category-list (index page format)
      const catHref = card.find('[class*="category"] a[href*="/listing-category/"]').first().attr('href') ?? '';
      const m = catHref.match(/listing-category\/([^/]+)/);
      if (m) categorySlug = m[1];
    }

    if (!categorySlug) {
      // Fallback: look for any nearby listing-category link after the listing link
      const parent = $(el).parent();
      const nearbycat = parent.find('a[href*="/listing-category/"]').first().attr('href') ?? '';
      const m = nearbycat.match(/listing-category\/([^/]+)/);
      if (m) categorySlug = m[1];
    }

    // Deduplicate by URL
    if (!listings.find((l) => l.url === href)) {
      listings.push({ url: href, categorySlug: categorySlug || 'flea-markets' });
    }
  });

  return listings;
}

/**
 * Fetch an individual listing page and parse venue data.
 */
async function fetchListingPage(
  url: string,
  categorySlug: string,
  rateLimiter: RateLimiter
): Promise<FMKVenue | null> {
  const domain = new URL(FMK_BASE_URL).hostname;
  await rateLimiter.waitBeforeRequest(domain);

  let html: string;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      console.warn(`[Fleamapket] Listing fetch HTTP ${response.status}: ${url}`);
      return null;
    }

    html = await response.text();
  } catch (err) {
    console.warn(`[Fleamapket] Listing fetch failed: ${url}:`, err);
    return null;
  }

  const parsed = parseListingPage(html, categorySlug);
  if (!parsed) return null;

  return {
    ...parsed,
    businessCategory: mapCategory(categorySlug),
  };
}

/**
 * Main entry point for Fleamapket scraper.
 * Paginates all US listing pages, then fetches and ingests each individual listing.
 * Runs as national-once (metro and organizerId params are ignored).
 */
export async function scrapeFleamapket(
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

  await rateLimiter.loadRobotsTxt(FMK_BASE_URL);
  console.log('[Fleamapket] Starting scrape — paginating /listing-region/usa/');

  // Phase 1: collect all listing URLs from index pages
  const allListings: FMKListing[] = [];

  for (let page = 1; page <= MAX_INDEX_PAGES; page++) {
    const domain = new URL(FMK_BASE_URL).hostname;
    await rateLimiter.waitBeforeRequest(domain);

    const listings = await fetchIndexPage(page);

    if (listings.length === 0) {
      console.log(`[Fleamapket] Page ${page}: 0 listings — stopping pagination`);
      break;
    }

    console.log(`[Fleamapket] Page ${page}: found ${listings.length} listing links`);
    allListings.push(...listings);

    // Rate limit between index pages
    await new Promise((resolve) => setTimeout(resolve, CRAWL_DELAY_MS + Math.random() * 500));
  }

  // Deduplicate across pages
  const seen = new Set<string>();
  const uniqueListings = allListings.filter((l) => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });

  console.log(`[Fleamapket] Total unique listings: ${uniqueListings.length}`);

  // Phase 2: fetch each listing and ingest
  for (const listing of uniqueListings) {
    // Skip online-only categories
    if (SKIP_CATEGORIES.has(listing.categorySlug)) {
      console.log(`[Fleamapket] Skipping online-only: ${listing.url} (${listing.categorySlug})`);
      stats.itemsSkipped++;
      continue;
    }

    const venue = await fetchListingPage(listing.url, listing.categorySlug, rateLimiter);

    if (!venue) {
      console.warn(`[Fleamapket] Could not parse venue from: ${listing.url}`);
      stats.itemsFailed++;
      continue;
    }

    if (!venue.state) {
      console.warn(`[Fleamapket] No state parsed for "${venue.name}" (${venue.city}) — ${listing.url} — skipping`);
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
        venue.businessCategory,
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
      console.error(`[Fleamapket] Failed to ingest "${venue.name}" (${venue.city}, ${venue.state}):`, err);
      stats.itemsFailed++;
    }

    // Rate limit between individual listing fetches
    await new Promise((resolve) => setTimeout(resolve, CRAWL_DELAY_MS + Math.random() * 500));
  }

  console.log('[Fleamapket] ─────────────────────────────────────────────────────');
  console.log(`[Fleamapket] TOTAL — found ${stats.itemsFound}, created ${stats.itemsCreated}, skipped ${stats.itemsSkipped}, failed ${stats.itemsFailed}`);
  console.log('[Fleamapket] ─────────────────────────────────────────────────────');

  if (stats.itemsFound === 0) {
    console.warn('[Fleamapket] Completed with zero results — source may be blocked or changed markup');
  }

  return stats;
}
