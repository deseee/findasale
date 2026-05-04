/**
 * ADR-077: Foursquare Places API Business Directory Scraper
 * Ingests secondhand/resale businesses as unmanaged organizer directory entries.
 * Uses Foursquare Places Search API (new places-api.foursquare.com host, max 50 results per query).
 *
 * Businesses sourced here get:
 * - Organizer record with isUnmanagedListing=true, businessCategory
 * - RETAIL (or FLEA_MARKET) Sale record spanning 1 year (auto-renewed by existing RETAIL logic)
 * - Enrichment triggered immediately
 * - Claim email delivered by existing claimEmailService when campaign runs
 *
 * Auth: Service API Key in Authorization: Bearer header + X-Places-Api-Version header.
 * New endpoint: places-api.foursquare.com (migrated from api.foursquare.com/v3).
 * Lat/lng now included in free tier response.
 */

import { ScrapedItem } from '../index';
import { PLACES_QUERIES, GOOGLE_PLACES_METROS } from './googlePlaces';

const FOURSQUARE_API_BASE = 'https://places-api.foursquare.com/places/search';
const FOURSQUARE_API_VERSION = '2025-06-17';
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
  fsq_place_id: string;
  name: string;
  latitude?: number;
  longitude?: number;
  location?: {
    address?: string;
    locality?: string;  // city
    region?: string;    // state
    country?: string;
    postcode?: string;
  };
  categories?: Array<{
    name: string;
  }>;
  tel?: string;
  website?: string;
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

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Places-Api-Version': FOURSQUARE_API_VERSION,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      let body = '(no body)';
      try {
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
 * Fetch detailed information for a single Foursquare place.
 * Retrieves hours, photos, description, and other metadata.
 */
interface FoursquarePlaceDetails {
  hours?: {
    display?: string;
    open_now?: boolean;
    regular?: Array<{ day: number; open: string; close: string }>;
  };
  photos?: Array<{
    prefix: string;
    suffix: string;
    width?: number;
    height?: number;
  }>;
  description?: string;
  rating?: number;
}

async function fetchFoursquareDetails(
  apiKey: string,
  fsqId: string
): Promise<FoursquarePlaceDetails | null> {
  try {
    const url = new URL(`https://places-api.foursquare.com/places/${fsqId}`);
    url.searchParams.set('fields', 'hours,photos,description,rating');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Places-Api-Version': FOURSQUARE_API_VERSION,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      console.warn(`[Foursquare Details] HTTP ${response.status} for fsqId=${fsqId}`);
      return null;
    }

    return (await response.json()) as FoursquarePlaceDetails;
  } catch (err) {
    console.warn(`[Foursquare Details] Fetch error for fsqId=${fsqId}:`, err instanceof Error ? err.message : String(err));
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
  if (place.location?.locality && place.location?.region) {
    return { city: place.location.locality, state: place.location.region };
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
 * Returns up to 50 results per query (new API max per request).
 */
export async function scrapeFoursquareQuery(
  apiKey: string,
  queryConfig: any,
  metro: string
): Promise<ScrapedItem[]> {
  // Parse metro into city and state
  const metroMatch = metro.match(/^(.+),\s*([A-Z]{2,3})$/);
  if (!metroMatch) {
    console.warn(`[Foursquare] Invalid metro format: ${metro}`);
    return [];
  }
  const city = metroMatch[1].trim();
  const state = metroMatch[2];

  const results: ScrapedItem[] = [];
  const seenIds = new Set<string>();

  const response = await fetchFoursquarePage(apiKey, queryConfig.query, city, state);

  if (!response || response.results.length === 0) {
    return results;
  }

  for (const place of response.results) {
    if (seenIds.has(place.fsq_place_id)) continue;
    seenIds.add(place.fsq_place_id);

    // Apply blocklist
    if (queryConfig.blocklist) {
      const nameLower = place.name.toLowerCase();
      if (queryConfig.blocklist.some((block: string) => nameLower.includes(block))) continue;
    }

    const { city: placeCity, state: placeState } = parseCityState(place, metro);
    const now = new Date();
    const endDate = new Date(now);
    endDate.setFullYear(endDate.getFullYear() + 1);

    // Fetch detailed information for this place
    const details = await fetchFoursquareDetails(apiKey, place.fsq_place_id);

    const { city: placeCity, state: placeState } = parseCityState(place, metro);
    const now = new Date();
    const endDate = new Date(now);
    endDate.setFullYear(endDate.getFullYear() + 1);

    // Extract up to 3 photos
    const photoUrls: string[] = [];
    if (details?.photos && details.photos.length > 0) {
      for (let i = 0; i < Math.min(3, details.photos.length); i++) {
        const photo = details.photos[i];
        photoUrls.push(`${photo.prefix}original${photo.suffix}`);
      }
    }

    const item: ScrapedItem = {
      title: place.name,
      address: place.location?.address ?? '',
      city: placeCity,
      state: placeState,
      zip: place.location?.postcode ?? '',
      startDate: now,
      endDate,
      description: details?.description ?? null,
      saleType: queryConfig.saleType,
      organizerName: place.name,
      businessCategory: queryConfig.category,
      sourceName: 'Foursquare',
      sourceUrl: `https://foursquare.com/v/${place.name.replace(/\s+/g, '-').toLowerCase()}/${place.fsq_place_id}`,
      sourceItemId: place.fsq_place_id,
      photoUrls,
      scrapedMetadata: {
        businessCategory: queryConfig.category,
        fsqId: place.fsq_place_id,
        lat: place.latitude ?? null,
        lng: place.longitude ?? null,
        phone: place.tel ?? null,
        website: place.website ?? null,
        formattedAddress: place.location?.address ?? null,
        searchQuery: queryConfig.query,
        hours: details?.hours ?? null,
        hours_display: details?.hours?.display ?? null,
        rating: details?.rating ?? null,
      },
    };

    results.push(item);

    // Rate limiting: 200ms between detail calls
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return results;
}

/**
 * Main scraper function for Foursquare Places
 */
export async function runFoursquareScraper(metros?: string[], batch?: 1 | 2): Promise<ScrapedItem[]> {
  const apiKey = process.env.FOURSQUARE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('FOURSQUARE_API_KEY is not set');
  }

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
