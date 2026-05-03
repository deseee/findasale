/**
 * ADR-077: Foursquare v3 API Business Directory Scraper
 * Ingests secondhand/resale businesses as unmanaged organizer directory entries.
 * Uses Foursquare Places Search API (cursor-based pagination, max 2 pages = 100 results per query).
 *
 * Businesses sourced here get:
 * - Organizer record with isUnmanagedListing=true, businessCategory
 * - RETAIL (or FLEA_MARKET) Sale record spanning 1 year (auto-renewed by existing RETAIL logic)
 * - Enrichment triggered immediately
 * - Claim email delivered by existing claimEmailService when campaign runs
 *
 * Note: Foursquare API v3 auth uses raw API key in Authorization header (not Bearer).
 */

import { ScrapedItem } from '../index';
import { PLACES_QUERIES, GOOGLE_PLACES_METROS } from './googlePlaces';

const FOURSQUARE_API_BASE = 'https://api.foursquare.com/v3/places/search';
const MAX_PAGES = 2;
const REQUEST_DELAY_MS = 300;

// Canadian metros (excluding Montreal/Quebec City per suppressOutreach policy at DB level)
const CANADIAN_METROS = [
  'Toronto, ON',
  'Vancouver, BC',
  'Calgary, AB',
  'Edmonton, AB',
  'Ottawa, ON',
  'Winnipeg, MB',
  'Halifax, NS',
];

interface FoursquarePlace {
  fsq_id: string;
  name: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
  categories?: Array<{
    name: string;
  }>;
  tel?: string;
  website?: string;
  closed_bucket?: 'Closed' | 'VeryLikelyClosed' | 'LikelyClosed' | 'TemporarilyClosed' | 'LikelyOpen';
}

interface FoursquarePlacesResponse {
  results: FoursquarePlace[];
  context?: {
    geo_bounds?: any;
  };
}

/**
 * Fetch one page of Foursquare Places Search results
 */
async function fetchFoursquarePage(
  apiKey: string,
  query: string,
  city: string,
  state: string,
  limit: number = 50
): Promise<FoursquarePlacesResponse | null> {
  try {
    const url = new URL(FOURSQUARE_API_BASE);
    url.searchParams.set('query', query);
    url.searchParams.set('near', `${city}, ${state}`);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('fields', 'fsq_id,name,location,categories,tel,website,closed_bucket');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: apiKey,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      let body = '(no body)';
      try {
        // Use a separate controller so body read isn't killed by the fetch AbortSignal
        body = await Promise.race([
          response.text(),
          new Promise<string>((_, rej) => setTimeout(() => rej(new Error('body timeout')), 5000)),
        ]);
      } catch (e) {
        body = `(body read failed: ${e instanceof Error ? e.message : String(e)})`;
      }
      console.warn(`[Foursquare] HTTP ${response.status} for "${query}" in ${city}, ${state} — ${body.slice(0, 400)}`);
      return null;
    }
    return (await response.json()) as FoursquarePlacesResponse;
  } catch (err) {
    console.warn(`[Foursquare] Fetch error for "${query}":`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Parse city and state from Foursquare location or metro fallback
 */
function parseCityState(
  place: FoursquarePlace,
  metroFallback: string
): { city: string; state: string } {
  if (place.location?.city && place.location?.state) {
    return { city: place.location.city, state: place.location.state };
  }
  // Fallback: parse from metro string "City, ST"
  const fallbackMatch = metroFallback.match(/^(.+),\s*([A-Z]{2})$/);
  if (fallbackMatch) {
    return { city: fallbackMatch[1].trim(), state: fallbackMatch[2] };
  }
  return { city: 'Unknown', state: 'US' };
}

/**
 * Scrape Foursquare for a single query + metro combination.
 * Returns up to 100 results (2 pages × 50).
 * Filters out closed businesses.
 */
export async function scrapeFoursquareQuery(
  apiKey: string,
  queryConfig: any,
  metro: string
): Promise<ScrapedItem[]> {
  // Parse metro into city and state
  const metroMatch = metro.match(/^(.+),\s*([A-Z]{2})$/);
  if (!metroMatch) {
    console.warn(`[Foursquare] Invalid metro format: ${metro}`);
    return [];
  }
  const city = metroMatch[1].trim();
  const state = metroMatch[2];

  const results: ScrapedItem[] = [];
  const seenIds = new Set<string>();

  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) {
      await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
    }

    const response = await fetchFoursquarePage(apiKey, queryConfig.query, city, state);

    if (!response || response.results.length === 0) {
      break;
    }

    for (const place of response.results) {
      // Skip closed businesses
      if (place.closed_bucket === 'Closed' || place.closed_bucket === 'VeryLikelyClosed') {
        continue;
      }

      if (seenIds.has(place.fsq_id)) continue;
      seenIds.add(place.fsq_id);

      // Apply blocklist
      if (queryConfig.blocklist) {
        const nameLower = place.name.toLowerCase();
        if (queryConfig.blocklist.some((block: string) => nameLower.includes(block))) continue;
      }

      const { city: placeCity, state: placeState } = parseCityState(place, metro);
      const now = new Date();
      const endDate = new Date(now);
      endDate.setFullYear(endDate.getFullYear() + 1);

      const item: ScrapedItem = {
        title: `${place.name} — ${queryConfig.label} in ${placeCity}, ${placeState}`,
        address: place.location?.address ?? '',
        city: placeCity,
        state: placeState,
        zip: place.location?.postcode ?? '',
        startDate: now,
        endDate,
        description: null as any,
        saleType: queryConfig.saleType,
        organizerName: place.name,
        businessCategory: queryConfig.category,
        sourceName: 'Foursquare',
        sourceUrl: `https://foursquare.com/v/${place.name.replace(/\s+/g, '-').toLowerCase()}/${place.fsq_id}`,
        sourceItemId: place.fsq_id,
        scrapedMetadata: {
          businessCategory: queryConfig.category,
          fsqId: place.fsq_id,
          lat: null, // Foursquare v3 doesn't return lat/lng without paid tier
          lng: null,
          phone: place.tel ?? null,
          website: place.website ?? null,
          formattedAddress: place.location?.address ?? null,
          searchQuery: queryConfig.query,
        },
      };

      results.push(item);
    }
  }

  return results;
}

/**
 * Main scraper function for Foursquare Places
 * Supports METRO_BATCH env var: "1" for metros 0-49, "2" for metros 50-99, or empty for all
 */
export async function runFoursquareScraper(metros?: string[], batch?: 1 | 2): Promise<ScrapedItem[]> {
  const apiKey = process.env.FOURSQUARE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('FOURSQUARE_API_KEY is not set');
  }
  console.log(`[Foursquare] Key: length=${apiKey.length}, prefix=${apiKey.substring(0, 4)}, suffix=${apiKey.slice(-4)}`);

  const allMetros = metros && metros.length > 0 ? metros : [...GOOGLE_PLACES_METROS, ...CANADIAN_METROS];

  // Apply batch filtering if specified
  let targetMetros = allMetros;
  if (batch === 1) {
    targetMetros = allMetros.slice(0, 50);
  } else if (batch === 2) {
    targetMetros = allMetros.slice(50, 100);
  }

  console.log(
    `[Foursquare] Starting: ${targetMetros.length} metros × ${PLACES_QUERIES.length} queries (batch: ${batch ?? 'all'})`
  );

  const allItems: ScrapedItem[] = [];
  const seenIds = new Set<string>();
  let metroCount = 0;
  let apiErrors = 0;

  for (const metro of targetMetros) {
    metroCount++;
    let metroTotal = 0;

    for (const queryConfig of PLACES_QUERIES) {
      try {
        const items = await scrapeFoursquareQuery(apiKey, queryConfig, metro);
        for (const item of items) {
          const itemId = item.sourceItemId;
          if (itemId && !seenIds.has(itemId)) {
            seenIds.add(itemId);
            allItems.push(item);
            metroTotal++;
          }
        }
      } catch (err) {
        apiErrors++;
        console.error(
          `[Foursquare] Error — metro=${metro} query="${queryConfig.query}":`,
          err instanceof Error ? err.message : String(err)
        );
      }

      await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
    }

    console.log(
      `[Foursquare] (${metroCount}/${targetMetros.length}) ${metro}: +${metroTotal} new (total: ${allItems.length})`
    );
  }

  console.log(
    `[Foursquare] Scraping complete — ${allItems.length} unique businesses, ${apiErrors} API errors`
  );

  return allItems;
}
