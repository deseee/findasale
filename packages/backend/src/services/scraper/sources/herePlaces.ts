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
    // US — Northeast
    'New York, NY':        { lat: 40.7128,  lng: -74.0060  },
    'Buffalo, NY':         { lat: 42.8864,  lng: -78.8784  },
    'Boston, MA':          { lat: 42.3601,  lng: -71.0589  },
    'Hartford, CT':        { lat: 41.7658,  lng: -72.6851  },
    'Providence, RI':      { lat: 41.8240,  lng: -71.4128  },
    'Philadelphia, PA':    { lat: 39.9526,  lng: -75.1652  },
    'Pittsburgh, PA':      { lat: 40.4406,  lng: -79.9959  },
    // US — Mid-Atlantic
    'Baltimore, MD':       { lat: 39.2904,  lng: -76.6122  },
    'Washington, DC':      { lat: 38.9072,  lng: -77.0369  },
    'Richmond, VA':        { lat: 37.5407,  lng: -77.4360  },
    'Norfolk, VA':         { lat: 36.8508,  lng: -76.2859  },
    // US — Midwest
    'Chicago, IL':         { lat: 41.8781,  lng: -87.6298  },
    'Indianapolis, IN':    { lat: 39.7684,  lng: -86.1581  },
    'Columbus, OH':        { lat: 39.9612,  lng: -82.9988  },
    'Cleveland, OH':       { lat: 41.4993,  lng: -81.6944  },
    'Cincinnati, OH':      { lat: 39.1031,  lng: -84.5120  },
    'Dayton, OH':          { lat: 39.7589,  lng: -84.1916  },
    'Toledo, OH':          { lat: 41.6639,  lng: -83.5552  },
    'Akron, OH':           { lat: 41.0814,  lng: -81.5190  },
    'Detroit, MI':         { lat: 42.3314,  lng: -83.0458  },
    'Grand Rapids, MI':    { lat: 42.9632,  lng: -85.6789  },
    'Milwaukee, WI':       { lat: 43.0389,  lng: -87.9065  },
    'Madison, WI':         { lat: 43.0731,  lng: -89.4012  },
    'Minneapolis, MN':     { lat: 44.9778,  lng: -93.2650  },
    'St. Louis, MO':       { lat: 38.6270,  lng: -90.1994  },
    'Kansas City, MO':     { lat: 39.0997,  lng: -94.5786  },
    'Omaha, NE':           { lat: 41.2565,  lng: -95.9345  },
    'Des Moines, IA':      { lat: 41.5868,  lng: -93.6250  },
    'Louisville, KY':      { lat: 38.2527,  lng: -85.7585  },
    'Lexington, KY':       { lat: 38.0406,  lng: -84.5037  },
    'Wichita, KS':         { lat: 37.6872,  lng: -97.3301  },
    // US — Southeast
    'Atlanta, GA':         { lat: 33.7490,  lng: -84.3880  },
    'Savannah, GA':        { lat: 32.0809,  lng: -81.0912  },
    'Charlotte, NC':       { lat: 35.2271,  lng: -80.8431  },
    'Raleigh, NC':         { lat: 35.7796,  lng: -78.6382  },
    'Greensboro, NC':      { lat: 36.0726,  lng: -79.7920  },
    'Greenville, SC':      { lat: 34.8526,  lng: -82.3940  },
    'Columbia, SC':        { lat: 34.0007,  lng: -81.0348  },
    'Charleston, SC':      { lat: 32.7765,  lng: -79.9311  },
    'Nashville, TN':       { lat: 36.1627,  lng: -86.7816  },
    'Memphis, TN':         { lat: 35.1495,  lng: -90.0490  },
    'Knoxville, TN':       { lat: 35.9606,  lng: -83.9207  },
    'Chattanooga, TN':     { lat: 35.0456,  lng: -85.3097  },
    'Birmingham, AL':      { lat: 33.5186,  lng: -86.8104  },
    'Mobile, AL':          { lat: 30.6954,  lng: -88.0399  },
    'New Orleans, LA':     { lat: 29.9511,  lng: -90.0715  },
    'Baton Rouge, LA':     { lat: 30.4515,  lng: -91.1871  },
    'Little Rock, AR':     { lat: 34.7465,  lng: -92.2896  },
    'Jacksonville, FL':    { lat: 30.3322,  lng: -81.6557  },
    'Tampa, FL':           { lat: 27.9506,  lng: -82.4572  },
    'Orlando, FL':         { lat: 28.5383,  lng: -81.3792  },
    'Miami, FL':           { lat: 25.7617,  lng: -80.1918  },
    'Fort Lauderdale, FL': { lat: 26.1224,  lng: -80.1373  },
    // US — South/Central
    'Dallas, TX':          { lat: 32.7767,  lng: -96.7970  },
    'Houston, TX':         { lat: 29.7604,  lng: -95.3698  },
    'San Antonio, TX':     { lat: 29.4241,  lng: -98.4936  },
    'Austin, TX':          { lat: 30.2672,  lng: -97.7431  },
    'El Paso, TX':         { lat: 31.7619,  lng: -106.4850 },
    'Oklahoma City, OK':   { lat: 35.4676,  lng: -97.5164  },
    'Tulsa, OK':           { lat: 36.1540,  lng: -95.9928  },
    'Albuquerque, NM':     { lat: 35.0844,  lng: -106.6504 },
    // US — Mountain/Southwest
    'Phoenix, AZ':         { lat: 33.4484,  lng: -112.0740 },
    'Tucson, AZ':          { lat: 32.2226,  lng: -110.9747 },
    'Denver, CO':          { lat: 39.7392,  lng: -104.9903 },
    'Colorado Springs, CO':{ lat: 38.8339,  lng: -104.8214 },
    'Salt Lake City, UT':  { lat: 40.7608,  lng: -111.8910 },
    'Las Vegas, NV':       { lat: 36.1699,  lng: -115.1398 },
    'Boise, ID':           { lat: 43.6150,  lng: -116.2023 },
    // US — West Coast
    'Los Angeles, CA':     { lat: 34.0522,  lng: -118.2437 },
    'San Diego, CA':       { lat: 32.7157,  lng: -117.1611 },
    'San Francisco, CA':   { lat: 37.7749,  lng: -122.4194 },
    'Sacramento, CA':      { lat: 38.5816,  lng: -121.4944 },
    'Fresno, CA':          { lat: 36.7378,  lng: -119.7871 },
    'Portland, OR':        { lat: 45.5051,  lng: -122.6750 },
    'Spokane, WA':         { lat: 47.6588,  lng: -117.4260 },
    'Seattle, WA':         { lat: 47.6062,  lng: -122.3321 },
    // Canada
    'Toronto, ON':         { lat: 43.6629,  lng: -79.3957  },
    'Ottawa, ON':          { lat: 45.4215,  lng: -75.6972  },
    'Hamilton, ON':        { lat: 43.2557,  lng: -79.8711  },
    'London, ON':          { lat: 42.9849,  lng: -81.2453  },
    'Kitchener, ON':       { lat: 43.4516,  lng: -80.4925  },
    'Windsor, ON':         { lat: 42.3149,  lng: -83.0364  },
    'St. Catharines, ON':  { lat: 43.1594,  lng: -79.2469  },
    'Vancouver, BC':       { lat: 49.2827,  lng: -123.1207 },
    'Victoria, BC':        { lat: 48.4284,  lng: -123.3656 },
    'Kelowna, BC':         { lat: 49.8880,  lng: -119.4960 },
    'Abbotsford, BC':      { lat: 49.0504,  lng: -122.3045 },
    'Calgary, AB':         { lat: 51.0447,  lng: -114.0719 },
    'Edmonton, AB':        { lat: 53.5461,  lng: -113.4938 },
    'Winnipeg, MB':        { lat: 49.8951,  lng: -97.1384  },
    'Saskatoon, SK':       { lat: 52.1332,  lng: -106.6700 },
    'Regina, SK':          { lat: 50.4452,  lng: -104.6189 },
    'Halifax, NS':         { lat: 44.6426,  lng: -63.2181  },
  };

  // Direct lookup
  if (metroLookup[metro]) return metroLookup[metro];

  // Sub-area fallback: "Manhattan, New York, NY" → try "New York, NY"
  // Queue items use format "SubArea, City, ST" — strip the first segment
  const commaIdx = metro.indexOf(', ');
  if (commaIdx !== -1) {
    const baseMetro = metro.slice(commaIdx + 2);
    if (metroLookup[baseMetro]) return metroLookup[baseMetro];
  }

  return null;
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
