/**
 * ADR-077: HERE Discover API Business Directory Scraper
 * Ingests secondhand/resale businesses as unmanaged organizer directory entries.
 * Uses HERE Discover API (offset-based pagination, max 2 pages = 200 results per query).
 *
 * Businesses sourced here get:
 * - Organizer record with isUnmanagedListing=true, businessCategory
 * - RETAIL (or FLEA_MARKET) Sale record spanning 1 year (auto-renewed by existing RETAIL logic)
 * - Enrichment triggered immediately
 * - Claim email delivered by existing claimEmailService when campaign runs
 */

import { ScrapedItem } from '../index';
import { PLACES_QUERIES, GOOGLE_PLACES_METROS } from './googlePlaces';

const HERE_API_BASE = 'https://discover.search.hereapi.com/v1/discover';
const MAX_PAGES = 2;
const PAGE_DELAY_MS = 200;

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

interface HEREPlace {
  id: string;
  title: string;
  address?: {
    label?: string;
    city?: string;
    stateCode?: string;
    countryCode?: string;
    postalCode?: string;
  };
  position?: {
    lat: number;
    lng: number;
  };
  categories?: Array<{
    name: string;
  }>;
  contacts?: Array<{
    phone?: Array<{ value: string }>;
    www?: Array<{ value: string }>;
  }>;
}

interface HEREDiscoverResponse {
  items: HEREPlace[];
}

/**
 * Fetch one page of HERE Discover results
 */
async function fetchHEREPage(
  apiKey: string,
  query: string,
  lat: number,
  lng: number,
  offset: number = 0
): Promise<HEREDiscoverResponse | null> {
  try {
    const url = new URL(HERE_API_BASE);
    url.searchParams.set('q', query);
    url.searchParams.set('in', 'countryCode:USA,CAN');
    url.searchParams.set('at', `${lat},${lng}`);
    url.searchParams.set('limit', '100');
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('apiKey', apiKey);

    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(12000) });
    if (!response.ok) return null;
    return (await response.json()) as HEREDiscoverResponse;
  } catch {
    return null;
  }
}

/**
 * Parse city and state from HERE address or metro fallback
 */
function parseCityState(
  place: HEREPlace,
  metroFallback: string
): { city: string; state: string } {
  if (place.address?.city && place.address?.stateCode) {
    return { city: place.address.city, state: place.address.stateCode };
  }
  // Fallback: parse from metro string "City, ST"
  const fallbackMatch = metroFallback.match(/^(.+),\s*([A-Z]{2})$/);
  if (fallbackMatch) {
    return { city: fallbackMatch[1].trim(), state: fallbackMatch[2] };
  }
  return { city: 'Unknown', state: 'US' };
}

/**
 * Get coordinates for a metro. Simple parsing from metro string.
 * For real implementation, would geocode via Nominatim or HERE Geocoding API.
 */
function getMetroCoordinates(metro: string): { lat: number; lng: number } | null {
  const metroLookup: Record<string, { lat: number; lng: number }> = {
    'New York, NY': { lat: 40.7128, lng: -74.006 },
    'Los Angeles, CA': { lat: 34.0522, lng: -118.2437 },
    'Chicago, IL': { lat: 41.8781, lng: -87.6298 },
    'Houston, TX': { lat: 29.7604, lng: -95.3698 },
    'Phoenix, AZ': { lat: 33.4484, lng: -112.074 },
    'Grand Rapids, MI': { lat: 42.9632, lng: -85.6789 },
    'Toronto, ON': { lat: 43.6629, lng: -79.3957 },
    'Vancouver, BC': { lat: 49.2827, lng: -123.1207 },
    'Calgary, AB': { lat: 51.0447, lng: -114.0719 },
    'Edmonton, AB': { lat: 53.5461, lng: -113.4938 },
    'Ottawa, ON': { lat: 45.4215, lng: -75.6972 },
    'Winnipeg, MB': { lat: 49.8951, lng: -97.1384 },
    'Halifax, NS': { lat: 44.6426, lng: -63.2181 },
  };
  return metroLookup[metro] ?? null;
}

/**
 * Scrape HERE Discover for a single query + metro combination.
 * Returns up to 200 results (2 pages × 100).
 */
export async function scrapeHEREQuery(
  apiKey: string,
  queryConfig: any,
  metro: string
): Promise<ScrapedItem[]> {
  const coords = getMetroCoordinates(metro);
  if (!coords) {
    console.warn(`[HEREPlaces] No coordinates for metro: ${metro}`);
    return [];
  }

  const query = `${queryConfig.query} in ${metro}`;
  const results: ScrapedItem[] = [];
  const seenIds = new Set<string>();

  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) {
      await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
    }

    const response = await fetchHEREPage(
      apiKey,
      queryConfig.query,
      coords.lat,
      coords.lng,
      page * 100
    );

    if (!response || response.items.length === 0) {
      break;
    }

    for (const place of response.items) {
      if (seenIds.has(place.id)) continue;
      seenIds.add(place.id);

      // Apply blocklist
      if (queryConfig.blocklist) {
        const nameLower = place.title.toLowerCase();
        if (queryConfig.blocklist.some((block: string) => nameLower.includes(block))) continue;
      }

      const { city, state } = parseCityState(place, metro);
      const now = new Date();
      const endDate = new Date(now);
      endDate.setFullYear(endDate.getFullYear() + 1);

      const phone = place.contacts?.[0]?.phone?.[0]?.value ?? null;
      const website = place.contacts?.[0]?.www?.[0]?.value ?? null;

      const item: ScrapedItem = {
        title: `${place.title} — ${queryConfig.label} in ${city}, ${state}`,
        address: place.address?.label ?? '',
        city,
        state,
        zip: place.address?.postalCode ?? '',
        startDate: now,
        endDate,
        description: null as any,
        saleType: queryConfig.saleType,
        organizerName: place.title,
        businessCategory: queryConfig.category,
        sourceName: 'HEREPlaces',
        sourceUrl: `https://www.here.com/en/search?q=${encodeURIComponent(place.title)}`,
        sourceItemId: place.id,
        scrapedMetadata: {
          businessCategory: queryConfig.category,
          placeId: place.id,
          lat: place.position?.lat ?? null,
          lng: place.position?.lng ?? null,
          phone,
          website,
          formattedAddress: place.address?.label ?? null,
          searchQuery: query,
        },
      };

      results.push(item);
    }
  }

  return results;
}

/**
 * Main scraper function for HERE Places
 */
export async function runHEREPlacesScraper(metros: string[]): Promise<ScrapedItem[]> {
  const apiKey = process.env.HERE_API_KEY;
  if (!apiKey) {
    throw new Error('HERE_API_KEY is not set');
  }

  console.log(`[HEREPlaces] Starting: ${metros.length} metros × ${PLACES_QUERIES.length} queries`);

  const allItems: ScrapedItem[] = [];
  const seenIds = new Set<string>();
  let metroCount = 0;
  let apiErrors = 0;

  for (const metro of metros) {
    metroCount++;
    let metroTotal = 0;

    for (const queryConfig of PLACES_QUERIES) {
      try {
        const items = await scrapeHEREQuery(apiKey, queryConfig, metro);
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
          `[HEREPlaces] Error — metro=${metro} query="${queryConfig.query}":`,
          err instanceof Error ? err.message : String(err)
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    console.log(
      `[HEREPlaces] (${metroCount}/${metros.length}) ${metro}: +${metroTotal} new (total: ${allItems.length})`
    );
  }

  console.log(
    `[HEREPlaces] Scraping complete — ${allItems.length} unique businesses, ${apiErrors} API errors`
  );

  return allItems;
}
