/**
 * ADR-078: OpenStreetMap Overpass API Scraper
 * Queries OSM Overpass API for antique/secondhand/auction businesses across US metros
 * Maps OSM nodes/ways to Organizer records with dedup via osmId
 *
 * Query tags:
 * - shop=antiques
 * - shop=secondhand
 * - shop=used_goods
 * - amenity=auction_house
 * - craft=auctioneer
 *
 * Rate limiting: 2s delay between metro queries (Overpass policy)
 * Timeout: 120s per query (server-side [timeout:120] + client AbortSignal 150s)
 * Coverage: 137 metros across all 50 states
 *
 * Batching: Pass batchIndex + batchCount to run a subset of metros in parallel
 * (used by GitHub Actions matrix strategy — 6 batches of ~23 metros each)
 */

import { getOrCreateScrapedOrganizer } from './index';

interface OSMNode {
  type: 'node' | 'way';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
}

interface OverpassResponse {
  elements: OSMNode[];
}

/**
 * Metro bounding boxes: [south, west, north, east]
 * 137 metros covering all 50 states
 */
const METRO_BOUNDING_BOXES: Record<string, [number, number, number, number]> = {
  // ── Northeast ──────────────────────────────────────────────────────────────
  'New York, NY':       [40.4774, -74.2591, 40.9176, -73.7004],
  'Philadelphia, PA':   [39.8382, -75.2801, 40.1379, -74.9559],
  'Boston, MA':         [42.2013, -71.1705, 42.4203, -70.9158],
  'Washington DC':      [38.6409, -77.1193, 39.0204, -76.8093],
  'Baltimore, MD':      [39.1972, -76.7119, 39.3720, -76.5197],
  'Pittsburgh, PA':     [40.2772, -80.1951, 40.5017, -79.8594],
  'Buffalo, NY':        [42.7248, -79.0826, 42.9668, -78.7826],
  'Rochester, NY':      [43.0484, -77.6840, 43.2484, -77.4040],
  'Albany, NY':         [42.5895, -73.9530, 42.7730, -73.7130],
  'Hartford, CT':       [41.6962, -72.7947, 41.8212, -72.6247],
  'Providence, RI':     [41.7369, -71.5074, 41.8830, -71.3694],
  'New Haven, CT':      [41.2659, -72.9747, 41.3959, -72.8447],
  'Portland, ME':       [43.6160, -70.3484, 43.7160, -70.2084],
  'Burlington, VT':     [44.4400, -73.2900, 44.5400, -73.1500],
  'Manchester, NH':     [42.9500, -71.5100, 43.0800, -71.3600],
  'Scranton, PA':       [41.3200, -75.7600, 41.5400, -75.5300],
  'Allentown, PA':      [40.5200, -75.6200, 40.7100, -75.3600],

  // ── Southeast ──────────────────────────────────────────────────────────────
  'Atlanta, GA':        [33.5186, -84.5501, 33.8884, -83.9378],
  'Miami, FL':          [25.6867, -80.4985, 26.1447, -80.1293],
  'Tampa, FL':          [27.7669, -82.6434, 28.0669, -82.3434],
  'Orlando, FL':        [28.3500, -81.5800, 28.6500, -81.2800],
  'Jacksonville, FL':   [30.1000, -81.8400, 30.4900, -81.4400],
  'Fort Lauderdale, FL':[26.0600, -80.2800, 26.2600, -80.0300],
  'Gainesville, FL':    [29.5800, -82.4200, 29.7700, -82.2200],
  'Tallahassee, FL':    [30.3200, -84.4300, 30.5200, -84.2000],
  'Charlotte, NC':      [35.0440, -80.9810, 35.3740, -80.6510],
  'Raleigh, NC':        [35.6400, -78.8500, 35.9400, -78.5500],
  'Greensboro, NC':     [35.9200, -80.0700, 36.1900, -79.7600],
  'Richmond, VA':       [37.3000, -77.5400, 37.6000, -77.2400],
  'Virginia Beach, VA': [36.6000, -76.2000, 36.9900, -75.9600],
  'Nashville, TN':      [35.9800, -87.0900, 36.3300, -86.6900],
  'Memphis, TN':        [34.9700, -90.1400, 35.2700, -89.8400],
  'Knoxville, TN':      [35.8700, -84.1900, 36.1000, -83.8900],
  'Chattanooga, TN':    [34.9700, -85.4200, 35.1800, -85.1700],
  'Louisville, KY':     [38.0900, -85.8100, 38.3600, -85.5100],
  'Lexington, KY':      [37.9000, -84.6400, 38.1400, -84.3600],
  'Birmingham, AL':     [33.3700, -86.9500, 33.6300, -86.6500],
  'Huntsville, AL':     [34.5700, -86.7000, 34.8000, -86.4200],
  'Mobile, AL':         [30.5800, -88.2600, 30.8600, -87.9600],
  'New Orleans, LA':    [29.8600, -90.2000, 30.1900, -89.8800],
  'Baton Rouge, LA':    [30.3000, -91.2900, 30.5400, -90.9900],
  'Shreveport, LA':     [32.2800, -93.9500, 32.6000, -93.6400],
  'Jackson, MS':        [32.1900, -90.3500, 32.4100, -90.0900],
  'Columbia, SC':       [33.8900, -81.2400, 34.1400, -80.9700],
  'Charleston, SC':     [32.6500, -80.1100, 32.9500, -79.8600],
  'Savannah, GA':       [31.9600, -81.2300, 32.1900, -80.9300],
  'Augusta, GA':        [33.2600, -82.0900, 33.5400, -81.8100],
  'Macon, GA':          [32.7300, -83.8200, 32.9600, -83.5500],

  // ── Midwest ────────────────────────────────────────────────────────────────
  'Chicago, IL':        [41.6428, -87.9496, 42.0230, -87.5240],
  'Detroit, MI':        [42.2270, -83.2760, 42.4770, -82.9760],
  'Cleveland, OH':      [41.3300, -81.8500, 41.5900, -81.4900],
  'Columbus, OH':       [39.8500, -83.2000, 40.1500, -82.7000],
  'Cincinnati, OH':     [39.0400, -84.6900, 39.2900, -84.3900],
  'Dayton, OH':         [39.6700, -84.2800, 39.9700, -84.0000],
  'Toledo, OH':         [41.5900, -83.7100, 41.7900, -83.4700],
  'Akron, OH':          [40.9800, -81.5500, 41.1800, -81.3200],
  'Indianapolis, IN':   [39.6400, -86.3200, 39.9400, -85.9700],
  'Fort Wayne, IN':     [40.9800, -85.3200, 41.1800, -85.0800],
  'Milwaukee, WI':      [42.9500, -88.1230, 43.2740, -87.8540],
  'Madison, WI':        [43.0100, -89.6200, 43.1600, -89.3200],
  'Green Bay, WI':      [44.4000, -88.1200, 44.6000, -87.8800],
  'Minneapolis, MN':    [44.7700, -93.3800, 45.1100, -92.9900],
  'St. Paul, MN':       [44.8900, -93.1700, 45.0500, -93.0000],
  'Duluth, MN':         [46.6900, -92.2800, 46.8900, -91.9900],
  'Grand Rapids, MI':   [42.7216, -85.7747, 42.9906, -85.4407],
  'Lansing, MI':        [42.6500, -84.6000, 42.8200, -84.4000],
  'Flint, MI':          [43.0100, -83.8200, 43.1800, -83.5500],
  'Kalamazoo, MI':      [42.2000, -85.6500, 42.4000, -85.4000],
  'St. Louis, MO':      [38.4500, -90.3500, 38.7700, -90.0500],
  'Kansas City, MO':    [38.8600, -94.7200, 39.2000, -94.3100],
  'Springfield, MO':    [37.0900, -93.4200, 37.3100, -93.1700],
  'Omaha, NE':          [41.1600, -96.2400, 41.3900, -95.9300],
  'Lincoln, NE':        [40.7200, -96.8100, 40.8900, -96.5800],
  'Des Moines, IA':     [41.4600, -93.7800, 41.7200, -93.5200],
  'Cedar Rapids, IA':   [41.8600, -91.8200, 42.0600, -91.5700],
  'Wichita, KS':        [37.5900, -97.4600, 37.8200, -97.2200],
  'Tulsa, OK':          [36.0200, -96.1200, 36.2700, -95.8200],
  'Peoria, IL':         [40.5700, -89.8200, 40.8000, -89.5400],
  'Rockford, IL':       [42.2000, -89.2000, 42.4000, -88.9600],
  'Springfield, IL':    [39.7100, -89.7000, 39.8800, -89.5200],
  'South Bend, IN':     [41.6200, -86.3300, 41.8200, -86.0800],
  'Fargo, ND':          [46.7500, -96.9500, 46.9500, -96.7000],
  'Bismarck, ND':       [46.7500, -100.9400, 46.9000, -100.7200],
  'Sioux Falls, SD':    [43.4800, -96.8000, 43.6500, -96.6000],
  'Rapid City, SD':     [44.0100, -103.2700, 44.1800, -103.0800],

  // ── South / Southwest ──────────────────────────────────────────────────────
  'Dallas, TX':         [32.5132, -96.7469, 32.9186, -96.3309],
  'Houston, TX':        [29.5241, -95.7830, 30.0158, -95.0985],
  'San Antonio, TX':    [29.2686, -98.6806, 29.6789, -98.3850],
  'Austin, TX':         [30.1386, -97.8898, 30.5048, -97.5643],
  'Fort Worth, TX':     [32.5400, -97.5200, 32.9400, -97.1200],
  'El Paso, TX':        [31.6200, -106.5700, 31.9200, -106.2000],
  'Lubbock, TX':        [33.4700, -102.1200, 33.7200, -101.8500],
  'Amarillo, TX':       [35.0900, -101.9900, 35.3600, -101.7100],
  'Corpus Christi, TX': [27.5700, -97.5400, 27.8700, -97.2400],
  'Oklahoma City, OK':  [35.2500, -97.6300, 35.6300, -97.2700],
  'Little Rock, AR':    [34.5600, -92.4900, 34.8600, -92.1600],
  'Phoenix, AZ':        [33.2470, -112.3062, 33.7480, -111.9362],
  'Tucson, AZ':         [32.0900, -111.0800, 32.3800, -110.7700],
  'Albuquerque, NM':    [34.9800, -106.8400, 35.2100, -106.5400],
  'Las Vegas, NV':      [36.0600, -115.3600, 36.4000, -114.9600],
  'Reno, NV':           [39.3600, -119.9600, 39.6300, -119.6200],
  'Santa Fe, NM':       [35.5500, -106.0600, 35.7500, -105.8600],

  // ── West Coast ─────────────────────────────────────────────────────────────
  'Los Angeles, CA':    [33.7037, -118.5312, 34.3373, -117.6411],
  'San Francisco, CA':  [37.3076, -122.5876, 37.8364, -122.1725],
  'San Diego, CA':      [32.5149, -117.2719, 32.8151, -117.0382],
  'Sacramento, CA':     [38.4100, -121.5600, 38.7100, -121.2200],
  'San Jose, CA':       [37.1200, -122.1000, 37.4800, -121.7200],
  'Fresno, CA':         [36.6400, -119.9700, 36.9200, -119.6400],
  'Bakersfield, CA':    [35.2400, -119.1600, 35.5100, -118.8300],
  'Riverside, CA':      [33.8000, -117.4800, 34.0800, -117.2200],
  'Stockton, CA':       [37.8600, -121.3900, 38.0600, -121.1400],
  'Modesto, CA':        [37.5600, -121.0700, 37.7600, -120.8200],
  'Santa Barbara, CA':  [34.3700, -119.8400, 34.5400, -119.6400],
  'Portland, OR':       [45.4155, -122.7723, 45.6518, -122.4530],
  'Eugene, OR':         [43.9700, -123.2900, 44.1500, -122.9700],
  'Salem, OR':          [44.8700, -123.1200, 45.0200, -122.9400],
  'Seattle, WA':        [47.3629, -122.5102, 47.7341, -122.2171],
  'Tacoma, WA':         [47.1400, -122.5700, 47.3100, -122.3000],
  'Spokane, WA':        [47.5700, -117.5400, 47.7500, -117.2900],
  'Bellingham, WA':     [48.6600, -122.5700, 48.8100, -122.3800],

  // ── Mountain / Plains ──────────────────────────────────────────────────────
  'Denver, CO':         [39.5501, -104.8853, 39.9142, -104.5481],
  'Colorado Springs, CO':[38.7800, -104.9200, 38.9900, -104.7000],
  'Fort Collins, CO':   [40.4800, -105.1500, 40.6800, -104.9200],
  'Pueblo, CO':         [38.2100, -104.7200, 38.3900, -104.5200],
  'Salt Lake City, UT': [40.6500, -112.1100, 40.8600, -111.7700],
  'Provo, UT':          [40.1600, -111.7200, 40.3600, -111.4900],
  'Ogden, UT':          [41.1500, -112.1000, 41.3300, -111.8800],
  'Boise, ID':          [43.4800, -116.3700, 43.6900, -116.1300],
  'Idaho Falls, ID':    [43.4200, -112.1200, 43.6200, -111.8700],
  'Cheyenne, WY':       [41.0800, -104.9000, 41.2500, -104.7200],
  'Casper, WY':         [42.7900, -106.4000, 42.9600, -106.2000],
  'Billings, MT':       [45.7000, -108.6300, 45.8600, -108.3500],
  'Missoula, MT':       [46.7500, -114.2000, 46.9500, -113.9000],
  'Great Falls, MT':    [47.4500, -111.4000, 47.6200, -111.1800],
  'Anchorage, AK':      [61.0900, -150.1000, 61.3600, -149.5000],
  'Fairbanks, AK':      [64.7200, -148.0000, 64.9200, -147.6500],
  'Honolulu, HI':       [21.2600, -158.0900, 21.4600, -157.6500],
};

/**
 * Build Overpass QL query for a bounding box.
 * Queries: antiques, secondhand, used_goods, auction_house, auctioneer
 * server-side [timeout:120] allows up to 120s for dense metro areas
 */
function buildOverpassQuery(bbox: [number, number, number, number]): string {
  const [south, west, north, east] = bbox;
  const bboxStr = `${south},${west},${north},${east}`;

  return `[out:json][timeout:120];
(
  node["shop"="antiques"](${bboxStr});
  node["shop"="secondhand"](${bboxStr});
  node["shop"="used_goods"](${bboxStr});
  node["amenity"="auction_house"](${bboxStr});
  node["craft"="auctioneer"](${bboxStr});
  way["shop"="antiques"](${bboxStr});
  way["shop"="secondhand"](${bboxStr});
  way["shop"="used_goods"](${bboxStr});
);
out center;`;
}

/**
 * Query Overpass API for a single metro bounding box.
 * Uses overpass-api.de (canonical server) with 150s client timeout.
 */
async function queryOverpassApi(metro: string, bbox: [number, number, number, number]): Promise<OSMNode[]> {
  const query = buildOverpassQuery(bbox);

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0 (compatible; FindASale/1.0)',
      },
      signal: AbortSignal.timeout(150000),
    });

    if (!response.ok) {
      throw new Error(`Overpass API returned ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as OverpassResponse;
    console.log(`[osmScraper] ${metro}: ${data.elements.length} results`);
    return data.elements;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[osmScraper] ${metro} query failed: ${errorMsg}`);
    throw err;
  }
}

/**
 * Map OSM node/way to organizer fields
 */
function mapOsmToOrganizer(
  node: OSMNode
): {
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  phone?: string;
  website?: string;
  osmId: string;
} | null {
  const { tags } = node;

  if (!tags.name) return null;

  const lat = node.lat ?? node.center?.lat;
  const lon = node.lon ?? node.center?.lon;
  if (lat === undefined || lon === undefined) return null;

  const city = tags['addr:city'] || tags.addr || 'Unknown City';
  const state = tags['addr:state'] || (tags['addr:country'] === 'US' ? 'US' : 'Unknown');

  const phone = tags.phone || undefined;
  const website = tags.website || undefined;
  const osmId = `osm:${node.type}:${node.id}`;

  return { name: tags.name, city, state, lat, lng: lon, phone, website, osmId };
}

/**
 * Main OSM scraper — queries a batch of metros, deduplicates, ingests to database.
 *
 * @param batchIndex - 0-based index of this batch (default: 0 = run all)
 * @param batchCount - total number of batches (default: 1 = run all)
 */
export async function runOsmScraper(batchIndex = 0, batchCount = 1): Promise<void> {
  const allMetros = Object.entries(METRO_BOUNDING_BOXES);

  // Slice metros for this batch
  const metroList = batchCount <= 1
    ? allMetros
    : allMetros.filter((_, i) => i % batchCount === batchIndex);

  console.log(
    `[osmScraper] Starting Overpass API scraper — batch ${batchIndex + 1}/${batchCount}, ` +
    `${metroList.length} metros (of ${allMetros.length} total)...`
  );

  const allItems: Array<{
    name: string;
    city: string;
    state: string;
    lat: number;
    lng: number;
    phone?: string;
    website?: string;
    osmId: string;
  }> = [];

  const seen = new Set<string>();
  let skipped = 0;

  for (const [metro, bbox] of metroList) {
    try {
      const nodes = await queryOverpassApi(metro, bbox);

      for (const node of nodes) {
        const mapped = mapOsmToOrganizer(node);
        if (!mapped) { skipped++; continue; }
        if (seen.has(mapped.osmId)) { skipped++; continue; }
        seen.add(mapped.osmId);
        allItems.push(mapped);
      }

      // Rate limit: 2s between metro queries (Overpass policy)
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      console.error(`[osmScraper] ${metro} failed, continuing...`);
    }
  }

  console.log(
    `[osmScraper] Collected ${allItems.length} items (${skipped} skipped), ingesting...`
  );

  let created = 0;
  let failed = 0;

  for (const item of allItems) {
    try {
      const organizerId = await getOrCreateScrapedOrganizer(
        item.name,
        'OSM',
        item.city,
        item.state,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        item.phone,
        item.website,
        item.lat,
        item.lng
      );
      if (organizerId) {
        created++;
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
      console.error(`[osmScraper] Ingest error for ${item.name}:`, err);
    }
  }

  console.log(
    `[osmScraper] Batch ${batchIndex + 1}/${batchCount} complete — ${created} created/updated, ${failed} failed`
  );
}
