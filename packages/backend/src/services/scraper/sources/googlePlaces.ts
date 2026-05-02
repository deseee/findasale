/**
 * ADR-077: Google Places Business Directory Scraper
 * Ingests secondhand/resale businesses as unmanaged organizer directory entries.
 * Uses Google Places Text Search API (paginated, up to 3 pages = 60 results per query).
 *
 * Businesses sourced here get:
 * - Organizer record with isUnmanagedListing=true, googlePlaceId, businessCategory
 * - RETAIL (or FLEA_MARKET) Sale record spanning 1 year (auto-renewed by existing RETAIL logic)
 * - Enrichment triggered immediately (rating, phone, website populated from placeId)
 * - Claim email delivered by existing claimEmailService when campaign runs
 */

import { ScrapedItem } from '../index';

const PLACES_API_BASE = 'https://maps.googleapis.com/maps/api/place';
/** Google allows up to 3 pages (20 results each = 60 max) per text search */
const MAX_PAGES = 3;
/** Delay between paginated requests — required by Google (next_page_token not immediately valid) */
const PAGE_TOKEN_DELAY_MS = 2000;

// ---------------------------------------------------------------------------
// Query configuration
// ---------------------------------------------------------------------------

/** Business category values stored on Organizer.businessCategory (ADR-077) */
export type BusinessCategory =
  | 'ANTIQUE_MALL'
  | 'ANTIQUE_DEALER'
  | 'CONSIGNMENT'
  | 'THRIFT_STORE'
  | 'FLEA_MARKET'
  | 'AUCTION_HOUSE'
  | 'VINTAGE'
  | 'ESTATE_SALE_CO'
  | 'LIQUIDATION'
  | 'USED_FURNITURE';

interface QueryConfig {
  /** Search term sent to Google Places Text Search */
  query: string;
  /** Category stored on Organizer.businessCategory */
  category: BusinessCategory;
  /** FindA.Sale saleType for the created Sale record */
  saleType: 'RETAIL' | 'FLEA_MARKET';
  /** Optional Google Places type filter to narrow results */
  googleType?: string;
  /** Lowercase name fragments to exclude (fine art auction houses, etc.) */
  blocklist?: string[];
  /** Human-readable category label used in the sale title */
  label: string;
}

/** 11 search queries covering the full secondhand/resale market (ADR-077 Innovation review) */
export const PLACES_QUERIES: QueryConfig[] = [
  { query: 'antique mall', category: 'ANTIQUE_MALL', saleType: 'RETAIL', label: 'Antique Mall' },
  { query: 'antique dealer', category: 'ANTIQUE_DEALER', saleType: 'RETAIL', label: 'Antique Dealer' },
  { query: 'consignment shop', category: 'CONSIGNMENT', saleType: 'RETAIL', label: 'Consignment Shop' },
  {
    query: 'thrift store',
    category: 'THRIFT_STORE',
    saleType: 'RETAIL',
    googleType: 'thrift_store',
    label: 'Thrift Store',
  },
  {
    query: 'flea market',
    category: 'FLEA_MARKET',
    saleType: 'FLEA_MARKET',
    googleType: 'flea_market',
    label: 'Flea Market',
  },
  {
    query: 'auction house',
    category: 'AUCTION_HOUSE',
    saleType: 'RETAIL',
    // Exclude fine art auction houses — outside FindA.Sale's market
    blocklist: [
      "sotheby's", 'sothebys', "christie's", 'christies',
      'bonhams', 'phillips', 'heritage auctions', 'fine art auction',
      'freeman', 'cowan', 'skinner', 'doyle', 'rago',
    ],
    label: 'Auction House',
  },
  { query: 'vintage shop', category: 'VINTAGE', saleType: 'RETAIL', label: 'Vintage Shop' },
  { query: 'estate sale company', category: 'ESTATE_SALE_CO', saleType: 'RETAIL', label: 'Estate Sale Company' },
  { query: 'liquidation store', category: 'LIQUIDATION', saleType: 'RETAIL', label: 'Liquidation Store' },
  {
    query: 'swap meet',
    category: 'FLEA_MARKET',
    saleType: 'FLEA_MARKET',
    googleType: 'flea_market',
    label: 'Swap Meet / Flea Market',
  },
  {
    query: 'used furniture store',
    category: 'USED_FURNITURE',
    saleType: 'RETAIL',
    googleType: 'furniture_store',
    label: 'Used Furniture Store',
  },
];

// ---------------------------------------------------------------------------
// Top 100 US metros for directory coverage
// ---------------------------------------------------------------------------

export const GOOGLE_PLACES_METROS: string[] = [
  'New York, NY',
  'Los Angeles, CA',
  'Chicago, IL',
  'Houston, TX',
  'Phoenix, AZ',
  'Philadelphia, PA',
  'San Antonio, TX',
  'San Diego, CA',
  'Dallas, TX',
  'San Jose, CA',
  'Austin, TX',
  'Jacksonville, FL',
  'Fort Worth, TX',
  'Columbus, OH',
  'Charlotte, NC',
  'Indianapolis, IN',
  'San Francisco, CA',
  'Seattle, WA',
  'Denver, CO',
  'Nashville, TN',
  'Oklahoma City, OK',
  'El Paso, TX',
  'Washington, DC',
  'Boston, MA',
  'Memphis, TN',
  'Las Vegas, NV',
  'Louisville, KY',
  'Baltimore, MD',
  'Milwaukee, WI',
  'Albuquerque, NM',
  'Tucson, AZ',
  'Fresno, CA',
  'Mesa, AZ',
  'Kansas City, MO',
  'Atlanta, GA',
  'Sacramento, CA',
  'Colorado Springs, CO',
  'Omaha, NE',
  'Raleigh, NC',
  'Long Beach, CA',
  'Virginia Beach, VA',
  'Minneapolis, MN',
  'Tampa, FL',
  'New Orleans, LA',
  'Arlington, TX',
  'Bakersfield, CA',
  'Wichita, KS',
  'Aurora, CO',
  'Anaheim, CA',
  'Santa Ana, CA',
  'Corpus Christi, TX',
  'Riverside, CA',
  'St. Louis, MO',
  'Lexington, KY',
  'Pittsburgh, PA',
  'Stockton, CA',
  'Cincinnati, OH',
  'St. Paul, MN',
  'Toledo, OH',
  'Greensboro, NC',
  'Newark, NJ',
  'Plano, TX',
  'Henderson, NV',
  'Lincoln, NE',
  'Buffalo, NY',
  'Fort Wayne, IN',
  'Jersey City, NJ',
  'Chandler, AZ',
  'St. Petersburg, FL',
  'Laredo, TX',
  'Norfolk, VA',
  'Madison, WI',
  'Durham, NC',
  'Lubbock, TX',
  'Winston-Salem, NC',
  'Garland, TX',
  'Glendale, AZ',
  'Hialeah, FL',
  'Reno, NV',
  'Baton Rouge, LA',
  'Irvine, CA',
  'Chesapeake, VA',
  'Irving, TX',
  'Scottsdale, AZ',
  'North Las Vegas, NV',
  'Fremont, CA',
  'Gilbert, AZ',
  'San Bernardino, CA',
  'Birmingham, AL',
  'Boise, ID',
  'Rochester, NY',
  'Richmond, VA',
  'Spokane, WA',
  'Des Moines, IA',
  'Montgomery, AL',
  'Modesto, CA',
  'Fayetteville, NC',
  'Tacoma, WA',
  'Akron, OH',
  'Grand Rapids, MI',
];

// ---------------------------------------------------------------------------
// Google Places API types
// ---------------------------------------------------------------------------

interface PlaceResult {
  place_id: string;
  name: string;
  formatted_address?: string;
  business_status?: string;
  geometry?: { location: { lat: number; lng: number } };
  rating?: number;
  user_ratings_total?: number;
}

interface PlacesTextSearchResponse {
  results: PlaceResult[];
  next_page_token?: string;
  status: string;
  error_message?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fetch one page of Google Places Text Search results */
async function fetchPlacesPage(
  apiKey: string,
  query: string,
  googleType: string | undefined,
  pageToken?: string
): Promise<PlacesTextSearchResponse | null> {
  try {
    const url = new URL(`${PLACES_API_BASE}/textsearch/json`);
    if (pageToken) {
      // When using pagetoken, only key + pagetoken are allowed
      url.searchParams.set('pagetoken', pageToken);
      url.searchParams.set('key', apiKey);
    } else {
      url.searchParams.set('query', query);
      if (googleType) url.searchParams.set('type', googleType);
      url.searchParams.set('key', apiKey);
    }

    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(12000) });
    if (!response.ok) return null;
    return (await response.json()) as PlacesTextSearchResponse;
  } catch {
    return null;
  }
}

/**
 * Parse city and state from a Google formatted_address string.
 * Falls back to the metro query string on parse failure.
 * Input: "Store Name, 123 Main St, Grand Rapids, MI 49503, USA"
 * Output: { city: "Grand Rapids", state: "MI" }
 */
function parseCityState(
  formattedAddress: string | undefined,
  metroFallback: string
): { city: string; state: string } {
  if (formattedAddress) {
    const parts = formattedAddress.split(',').map((p) => p.trim());
    // Work backwards: look for "ST 12345" or bare "ST" before USA
    for (let i = parts.length - 1; i >= 1; i--) {
      const withZip = parts[i].match(/^([A-Z]{2})\s+\d{5}/);
      const bare = parts[i].match(/^([A-Z]{2})$/);
      const match = withZip || bare;
      if (match) {
        return { city: parts[i - 1], state: match[1] };
      }
    }
  }
  // Fallback: parse from metro string "City, ST"
  const fallbackMatch = metroFallback.match(/^(.+),\s*([A-Z]{2})$/);
  if (fallbackMatch) {
    return { city: fallbackMatch[1].trim(), state: fallbackMatch[2] };
  }
  return { city: 'Unknown', state: 'US' };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Scrape Google Places for a single query + metro combination.
 * Returns up to 60 results (3 pages × 20).
 * Filters: OPERATIONAL status only; blocklisted names excluded.
 */
export async function scrapeGooglePlacesQuery(
  apiKey: string,
  queryConfig: QueryConfig,
  metro: string
): Promise<ScrapedItem[]> {
  const fullQuery = `${queryConfig.query} in ${metro}`;
  const results: ScrapedItem[] = [];
  let pageToken: string | undefined;
  let pagesFetched = 0;

  while (pagesFetched < MAX_PAGES) {
    if (pageToken && pagesFetched > 0) {
      await new Promise((resolve) => setTimeout(resolve, PAGE_TOKEN_DELAY_MS));
    }

    const response = await fetchPlacesPage(apiKey, fullQuery, queryConfig.googleType, pageToken);
    if (!response) {
      console.warn(`[GooglePlaces] No response for "${fullQuery}" page ${pagesFetched + 1}`);
      break;
    }
    if (response.status === 'ZERO_RESULTS') break;
    if (response.status !== 'OK') {
      console.warn(
        `[GooglePlaces] API status ${response.status} for "${fullQuery}": ${response.error_message ?? ''}`
      );
      break;
    }

    pagesFetched++;

    for (const place of response.results) {
      // Skip non-operational businesses (temporarily/permanently closed)
      if (place.business_status && place.business_status !== 'OPERATIONAL') continue;

      // Apply name blocklist (case-insensitive)
      if (queryConfig.blocklist) {
        const nameLower = place.name.toLowerCase();
        if (queryConfig.blocklist.some((block) => nameLower.includes(block))) continue;
      }

      const { city, state } = parseCityState(place.formatted_address, metro);
      const now = new Date();
      const endDate = new Date(now);
      endDate.setFullYear(endDate.getFullYear() + 1);

      const item: ScrapedItem = {
        // Sale fields
        title: `${place.name} — ${queryConfig.label} in ${city}, ${state}`,
        address: '',        // Street address not returned by Text Search
        city,
        state,
        zip: '',
        startDate: now,
        endDate,
        description: null as any,
        saleType: queryConfig.saleType,
        // Organizer fields
        organizerName: place.name,
        googlePlaceId: place.place_id,
        businessCategory: queryConfig.category,
        // Source tracking
        sourceName: 'GooglePlaces',
        sourceUrl: `https://maps.google.com/?cid=${place.place_id}`,
        sourceItemId: place.place_id,  // Primary dedup key
        // Metadata for enrichment pipeline
        scrapedMetadata: {
          businessCategory: queryConfig.category,
          placeId: place.place_id,
          lat: place.geometry?.location.lat ?? null,
          lng: place.geometry?.location.lng ?? null,
          googleRating: place.rating ?? null,
          googleRatingCount: place.user_ratings_total ?? null,
          formattedAddress: place.formatted_address ?? null,
          searchQuery: fullQuery,
        },
      };

      results.push(item);
    }

    pageToken = response.next_page_token;
    if (!pageToken) break;
  }

  return results;
}
