/**
 * FleaMarketZone scraper adapter
 * Source: https://www.fleamarketzone.com
 * ToS: Confirmed CLEAR — no anti-scraping language
 * robots.txt: Open (no Disallow entries affecting listings)
 *
 * Site uses WordPress Business Directory Plugin (wpbdp).
 * US state region pages at /business-directory/wpbdm-region/[state-slug]/
 * Each page lists flea market venues with name, address (city, state) inline.
 * Handles pagination (page/2/ etc.) where more than one page exists.
 *
 * Strategy: iterate known US state region URLs scraped from the region sitemap,
 * parse listing cards inline (no per-listing fetch needed), call
 * getOrCreateScrapedOrganizer for each venue.
 *
 * Rate limit: 3–4 second delays between requests (polite to WordPress host).
 * ADR-073: Directory Scraper Phase 1
 */

import * as cheerio from 'cheerio';
import { RateLimiter } from '../rateLimiter';
import { getOrCreateScrapedOrganizer } from '../index';
import { getRandomUserAgent } from '../userAgents';
import { ScrapeStats } from '../sourceRegistry';

const FMZ_BASE_URL = 'https://fleamarketzone.com';
const SOURCE_NAME = 'FleaMarketZone';

/**
 * US state region slugs as they appear on FleaMarketZone.
 * Derived from https://fleamarketzone.com/wpbdm-region-sitemap.xml (US entries only).
 * 'north-america' and 'usa' are catch-alls — skipped (no city/state extractable).
 */
const US_STATE_REGION_SLUGS: string[] = [
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
  'connecticut', 'd-c', 'delaware', 'florida', 'georgia-usa', 'hawaii',
  'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana',
  'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi',
  'missouri', 'montana', 'nebraska', 'nevada', 'new-hampshire', 'new-jersey',
  'new-mexico', 'new-york', 'north-carolina', 'north-dakota', 'ohio',
  'oklahoma', 'oregon', 'pennsylvania', 'rhode-island', 'south-carolina',
  'south-dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia',
  'washington', 'west-virginia', 'wisconsin', 'wyoming',
];

/**
 * Map FleaMarketZone region slug → two-letter state abbreviation.
 * Used when the inline state field is missing or ambiguous.
 */
const SLUG_TO_STATE_ABBR: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'd-c': 'DC',
  'delaware': 'DE', 'florida': 'FL', 'georgia-usa': 'GA', 'hawaii': 'HI',
  'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME',
  'maryland': 'MD', 'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN',
  'mississippi': 'MS', 'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE',
  'nevada': 'NV', 'new-hampshire': 'NH', 'new-jersey': 'NJ', 'new-mexico': 'NM',
  'new-york': 'NY', 'north-carolina': 'NC', 'north-dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode-island': 'RI',
  'south-carolina': 'SC', 'south-dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX',
  'utah': 'UT', 'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA',
  'west-virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
};

/** Decode common HTML entities in venue names. */
function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&#038;/g, '&')
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

interface FMZVenue {
  name: string;
  city: string;
  state: string; // two-letter abbreviation
}

/**
 * Parse listing cards from a FleaMarketZone region page HTML.
 * Each listing is in a <div id="wpbdp-listing-XXXX"> block.
 * Name: first text node or .listing-title link.
 * City/state: extracted from inline address text pattern "City , StateFullName Zip".
 */
function parseListingCards(html: string, stateAbbr: string): FMZVenue[] {
  const $ = cheerio.load(html);
  const venues: FMZVenue[] = [];

  // Each listing card starts with id="wpbdp-listing-XXXX"
  $('[id^="wpbdp-listing-"]').each((_i, el) => {
    const card = $(el);

    // Name: .listing-title contains the market name as a link or heading
    let name = card.find('.listing-title').first().text().trim();
    if (!name) {
      // Fallback: h2 or h3 inside the card
      name = card.find('h2, h3').first().text().trim();
    }
    name = decodeEntities(name);
    if (!name) return;

    // City/state: the address text appears as "Street City , StateFullName Zip"
    // Extract from the full card text block
    const cardText = card.text();

    // Pattern: "City , StateFullName Zip" or "City, StateName Zip"
    // Example: "Sears , Michigan 49679" → city=Sears, state=MI
    const cityStateMatch = cardText.match(/([A-Za-z][A-Za-z\s\-'\.]+?)\s*,\s*([A-Za-z][A-Za-z\s]+?)\s+\d{5}/);

    let city = '';
    let state = stateAbbr; // default to the region's state

    if (cityStateMatch) {
      city = cityStateMatch[1].trim();
      const stateFull = cityStateMatch[2].trim().toLowerCase();

      // Map full state name back to abbreviation
      const stateMap: Record<string, string> = {
        'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
        'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT',
        'district of columbia': 'DC', 'washington d.c.': 'DC', 'washington dc': 'DC',
        'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI',
        'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
        'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME',
        'maryland': 'MD', 'massachusetts': 'MA', 'michigan': 'MI',
        'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
        'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
        'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM',
        'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
        'ohio': 'OH', 'oklahoma': 'OK', 'oregon': 'OR',
        'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
        'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
        'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA',
        'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
      };
      state = stateMap[stateFull] ?? stateAbbr;
    } else {
      // Fallback: try just "City , StateName" without zip
      const cityStateNoZip = cardText.match(/([A-Za-z][A-Za-z\s\-'\.]+?)\s*,\s*([A-Za-z][A-Za-z\s]+?)(?:\n|\s{2,}|$)/);
      if (cityStateNoZip) {
        city = cityStateNoZip[1].trim();
      }
    }

    // Skip if city is empty or looks like noise
    if (!city || city.length < 2 || city.length > 60) return;

    // Skip if city matches the market name (means no city was parsed)
    if (city.toLowerCase() === name.toLowerCase()) return;

    venues.push({ name, city, state });
  });

  return venues;
}

/**
 * Fetch one FleaMarketZone region page (with pagination).
 * Returns all venues found across all pages.
 */
async function fetchRegionVenues(
  regionSlug: string,
  stateAbbr: string,
  rateLimiter: RateLimiter
): Promise<FMZVenue[]> {
  const domain = new URL(FMZ_BASE_URL).hostname;
  const venues: FMZVenue[] = [];
  let page = 1;
  const MAX_PAGES = 20; // safety ceiling

  while (page <= MAX_PAGES) {
    const url = page === 1
      ? `${FMZ_BASE_URL}/business-directory/wpbdm-region/${regionSlug}/`
      : `${FMZ_BASE_URL}/business-directory/wpbdm-region/${regionSlug}/page/${page}/`;

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

      if (response.status === 404) {
        // No more pages
        break;
      }

      if (!response.ok) {
        console.warn(`[FleaMarketZone] HTTP ${response.status} for ${url} — skipping`);
        break;
      }

      html = await response.text();
    } catch (err) {
      console.warn(`[FleaMarketZone] Fetch failed for ${url}:`, err);
      break;
    }

    const pageVenues = parseListingCards(html, stateAbbr);
    venues.push(...pageVenues);

    console.log(`[FleaMarketZone] ${regionSlug} page ${page}: found ${pageVenues.length} venues`);

    // Check for next page link in the HTML
    const hasNextPage = html.includes(`/page/${page + 1}/`);
    if (!hasNextPage || pageVenues.length === 0) break;

    page++;

    // Rate limit between paginated requests
    await new Promise((resolve) => setTimeout(resolve, 3000 + Math.random() * 1000));
  }

  return venues;
}

/**
 * Main entry point for FleaMarketZone scraper.
 * Iterates all US state region pages, parses venue listings, and upserts organizers.
 * Runs as national-once (metro param is ignored).
 */
export async function scrapeFleaMarketZone(
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

  await rateLimiter.loadRobotsTxt(FMZ_BASE_URL);
  console.log(`[FleaMarketZone] Starting scrape — ${US_STATE_REGION_SLUGS.length} state regions`);

  for (const slug of US_STATE_REGION_SLUGS) {
    const stateAbbr = SLUG_TO_STATE_ABBR[slug];
    if (!stateAbbr) {
      console.warn(`[FleaMarketZone] No state abbr for slug "${slug}" — skipping`);
      continue;
    }

    let venues: FMZVenue[];
    try {
      venues = await fetchRegionVenues(slug, stateAbbr, rateLimiter);
    } catch (err) {
      console.error(`[FleaMarketZone] Failed to fetch region "${slug}":`, err);
      stats.itemsFailed++;
      continue;
    }

    if (venues.length === 0) {
      console.log(`[FleaMarketZone] ${slug}: no venues found — skipping`);
    }

    stats.itemsFound += venues.length;

    for (const venue of venues) {
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
          undefined, // phone
          undefined, // website
          undefined, // lat
          undefined  // lng
        );

        if (orgId === null) {
          stats.itemsSkipped++;
        } else {
          stats.itemsCreated++;
        }
      } catch (err) {
        console.error(`[FleaMarketZone] Failed to ingest "${venue.name}" (${venue.city}, ${venue.state}):`, err);
        stats.itemsFailed++;
      }
    }

    console.log(`[FleaMarketZone] ${slug} (${stateAbbr}): ingested ${venues.length} venues`);

    // Rate limit between state pages — 3–4 second delay
    await new Promise((resolve) => setTimeout(resolve, 3000 + Math.random() * 1000));
  }

  console.log('[FleaMarketZone] ─────────────────────────────────────────────────────');
  console.log(`[FleaMarketZone] TOTAL — found ${stats.itemsFound}, created ${stats.itemsCreated}, skipped ${stats.itemsSkipped}, failed ${stats.itemsFailed}`);
  console.log('[FleaMarketZone] ─────────────────────────────────────────────────────');

  if (stats.itemsFound === 0) {
    console.warn('[FleaMarketZone] Completed with zero results — source may be blocked or changed markup');
  }

  return stats;
}
