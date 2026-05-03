/**
 * OSM Overpass Business Directory Scraper
 * Ingests secondhand/resale businesses from OpenStreetMap via Overpass API.
 * No API key required — OSM Overpass is free and open-source.
 *
 * Businesses sourced here get:
 * - Organizer record with isUnmanagedListing=true, scrapedMetadata with OSM ID
 * - RETAIL or FLEA_MARKET Sale record spanning 1 year (auto-renewed by existing RETAIL logic)
 * - Enrichment triggered immediately to populate missing fields
 *
 * Rate limiting: 1 request per metro (combined query), 500ms between metros.
 * Overpass has no enforced rate limit for reasonable usage.
 */

import { ScrapedItem } from '../index';

const NOMINATIM_API_BASE = 'https://nominatim.openstreetmap.org';
const OVERPASS_API_BASE = 'https://overpass-api.de/api/interpreter';

/** Cache geocoded bounding boxes to avoid repeat requests */
const boundingBoxCache = new Map<string, { minlat: number; maxlat: number; minlon: number; maxlon: number }>();

/** Delay between metros to respect Overpass server load */
const METRO_DELAY_MS = 500;

// ---------------------------------------------------------------------------
// Query configuration
// ---------------------------------------------------------------------------

/** OSM tags to query mapped to our 11 business categories */
interface OSMQuery {
  key: string;
  value: string;
  saleType: 'RETAIL' | 'FLEA_MARKET';
  label: string;
}

const OSM_QUERIES: OSMQuery[] = [
  { key: 'shop', value: 'antiques', saleType: 'RETAIL', label: 'Antique Shop' },
  { key: 'shop', value: 'second_hand', saleType: 'RETAIL', label: 'Second-Hand Shop' },
  { key: 'shop', value: 'charity', saleType: 'RETAIL', label: 'Charity Shop' },
  { key: 'amenity', value: 'marketplace', saleType: 'FLEA_MARKET', label: 'Marketplace' },
  { key: 'shop', value: 'auction', saleType: 'RETAIL', label: 'Auction House' },
  { key: 'shop', value: 'furniture', saleType: 'RETAIL', label: 'Furniture Store' },
];

/** Fine art auction houses to exclude (case-insensitive name matching) */
const FINE_ART_BLOCKLIST = [
  "sotheby's",
  'sothebys',
  "christie's",
  'christies',
  'bonhams',
  'phillips',
  'heritage auctions',
  'fine art auction',
  'freeman',
  'cowan',
  'skinner',
  'doyle',
  'rago',
];

// ---------------------------------------------------------------------------
// Top 100 US metros for directory coverage (shared with Google Places)
// ---------------------------------------------------------------------------

export const OSM_METROS: string[] = [
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
// Nominatim API types
// ---------------------------------------------------------------------------

interface NominatimResult {
  boundingbox: [string, string, string, string]; // [minlat, maxlat, minlon, maxlon]
  name: string;
  lat: string;
  lon: string;
}

// ---------------------------------------------------------------------------
// Overpass API types
// ---------------------------------------------------------------------------

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: {
    name?: string;
    shop?: string;
    amenity?: string;
    'addr:housenumber'?: string;
    'addr:street'?: string;
    'addr:city'?: string;
    'addr:state'?: string;
    'addr:postcode'?: string;
    phone?: string;
    website?: string;
    opening_hours?: string;
  };
}

interface OverpassResponse {
  elements: OverpassElement[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Geocode a metro (e.g., "Grand Rapids, MI") to a bounding box via Nominatim.
 * Caches results to avoid repeat requests.
 */
async function getMetroBoundingBox(
  metro: string
): Promise<{ minlat: number; maxlat: number; minlon: number; maxlon: number } | null> {
  if (boundingBoxCache.has(metro)) {
    return boundingBoxCache.get(metro)!;
  }

  try {
    const url = new URL(`${NOMINATIM_API_BASE}/search`);
    url.searchParams.set('q', metro);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('addressdetails', '0');

    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'FindA.Sale/1.0 (contact@finda.sale)' },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) return null;
    const results = (await response.json()) as NominatimResult[];
    if (results.length === 0) return null;

    const bbox = results[0].boundingbox;
    const result = {
      minlat: parseFloat(bbox[0]),
      maxlat: parseFloat(bbox[1]),
      minlon: parseFloat(bbox[2]),
      maxlon: parseFloat(bbox[3]),
    };

    boundingBoxCache.set(metro, result);
    return result;
  } catch (err) {
    console.warn(`[OSM] Nominatim geocoding failed for "${metro}":`, err);
    return null;
  }
}

/**
 * Build a combined Overpass query for all OSM tags in a single request.
 */
function buildOverpassQuery(bbox: { minlat: number; maxlat: number; minlon: number; maxlon: number }): string {
  const { minlat, maxlat, minlon, maxlon } = bbox;
  const bboxStr = `${minlat},${minlon},${maxlat},${maxlon}`;

  const nodeWayPairs = OSM_QUERIES.map((q) => {
    return `node["${q.key}"="${q.value}"](${bboxStr});way["${q.key}"="${q.value}"](${bboxStr});`;
  }).join('');

  return `[out:json][timeout:30];(${nodeWayPairs});out body;`;
}

/**
 * Query Overpass API and return raw elements.
 */
async function queryOverpass(
  query: string
): Promise<OverpassElement[] | null> {
  try {
    const response = await fetch(OVERPASS_API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(35000), // Overpass timeout is 30s
    });

    if (!response.ok) {
      console.warn(`[OSM] Overpass API HTTP ${response.status}`);
      return null;
    }

    const data = (await response.json()) as OverpassResponse;
    return data.elements ?? [];
  } catch (err) {
    console.warn(`[OSM] Overpass API error:`, err);
    return null;
  }
}

/**
 * Parse city and state from element address tags or metro fallback.
 */
function parseCityState(
  element: OverpassElement,
  metro: string
): { city: string; state: string } {
  const tags = element.tags ?? {};

  if (tags['addr:city'] && tags['addr:state']) {
    return { city: tags['addr:city'], state: tags['addr:state'] };
  }

  // Fallback: parse from metro string "City, ST"
  const metroMatch = metro.match(/^(.+),\s*([A-Z]{2})$/);
  if (metroMatch) {
    return { city: metroMatch[1].trim(), state: metroMatch[2] };
  }

  return { city: 'Unknown', state: 'US' };
}

/**
 * Extract query type from element tags to determine saleType.
 */
function determineSaleType(element: OverpassElement): 'RETAIL' | 'FLEA_MARKET' {
  const tags = element.tags ?? {};
  const shop = tags.shop;
  const amenity = tags.amenity;

  if (amenity === 'marketplace') return 'FLEA_MARKET';
  if (shop === 'marketplace') return 'FLEA_MARKET';

  return 'RETAIL';
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Scrape OSM Overpass for a single metro.
 * Returns ScrapedItem array ready for ingest.
 */
export async function scrapeOSMMetro(metro: string): Promise<ScrapedItem[]> {
  const bbox = await getMetroBoundingBox(metro);
  if (!bbox) {
    console.warn(`[OSM] Could not geocode metro: ${metro}`);
    return [];
  }

  const query = buildOverpassQuery(bbox);
  const elements = await queryOverpass(query);
  if (!elements) {
    console.warn(`[OSM] Overpass query failed for ${metro}`);
    return [];
  }

  const results: ScrapedItem[] = [];

  for (const element of elements) {
    const tags = element.tags ?? {};
    const name = tags.name;

    // Skip unnamed elements — they're not useful
    if (!name || !name.trim()) continue;

    // Skip fine art auction houses
    const nameLower = name.toLowerCase();
    if (FINE_ART_BLOCKLIST.some((block) => nameLower.includes(block))) {
      continue;
    }

    const { city, state } = parseCityState(element, metro);
    const saleType = determineSaleType(element);

    // Extract coordinates (nodes have lat/lon, ways have center)
    const lat = element.lat ?? element.center?.lat ?? null;
    const lng = element.lon ?? element.center?.lon ?? null;

    // Build address from street + house number if available
    const streetNum = tags['addr:housenumber'];
    const streetName = tags['addr:street'];
    const address = [streetNum, streetName].filter(Boolean).join(' ');

    const now = new Date();
    const endDate = new Date(now);
    endDate.setFullYear(endDate.getFullYear() + 1);

    const item: ScrapedItem = {
      // Sale fields
      title: name,
      address,
      city,
      state,
      zip: tags['addr:postcode'] ?? '',
      startDate: now,
      endDate,
      description: null as any,
      saleType,
      // Organizer fields
      organizerName: name,
      // Source tracking
      sourceName: 'OSM',
      sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      sourceItemId: `${element.type}/${element.id}`,
      // Metadata for enrichment pipeline
      scrapedMetadata: {
        osmId: element.id,
        osmType: element.type,
        osmTags: tags.shop ?? tags.amenity ?? null,
        lat,
        lng,
        phone: tags.phone ?? null,
        website: tags.website ?? null,
        hours_display: tags.opening_hours ?? null,
      },
    };

    results.push(item);
  }

  return results;
}
                        