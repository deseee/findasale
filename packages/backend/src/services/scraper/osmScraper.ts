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
 * Timeout: 60s per query
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
 * Covers major US metros and secondary markets
 */
const METRO_BOUNDING_BOXES: Record<string, [number, number, number, number]> = {
  'New York, NY': [40.4774, -74.2591, 40.9176, -73.7004],
  'Los Angeles, CA': [33.7037, -118.5312, 34.3373, -117.6411],
  'Chicago, IL': [41.6428, -87.9496, 42.0230, -87.5240],
  'Dallas, TX': [32.5132, -96.7469, 32.9186, -96.3309],
  'Houston, TX': [29.5241, -95.7830, 30.0158, -95.0985],
  'Philadelphia, PA': [39.8382, -75.2801, 40.1379, -74.9559],
  'Phoenix, AZ': [33.2470, -112.3062, 33.7480, -111.9362],
  'San Antonio, TX': [29.2686, -98.6806, 29.6789, -98.3850],
  'San Diego, CA': [32.5149, -117.2719, 32.8151, -117.0382],
  'San Francisco, CA': [37.3076, -122.5876, 37.8364, -122.1725],
  'Austin, TX': [30.1386, -97.8898, 30.5048, -97.5643],
  'Denver, CO': [39.5501, -104.8853, 39.9142, -104.5481],
  'Washington DC, DC': [38.6409, -77.1193, 39.0204, -76.8093],
  'Boston, MA': [42.2013, -71.1705, 42.4203, -70.9158],
  'Atlanta, GA': [33.5186, -84.5501, 33.8884, -83.9378],
  'Miami, FL': [25.6867, -80.4985, 26.1447, -80.1293],
  'Portland, OR': [45.4155, -122.7723, 45.6518, -122.4530],
  'Seattle, WA': [47.3629, -122.5102, 47.7341, -122.2171],
  'Grand Rapids, MI': [42.7216, -85.7747, 42.9906, -85.4407],
  'Milwaukee, WI': [42.9500, -88.1230, 43.2740, -87.8540],
};

/**
 * Build Overpass QL query for a bounding box
 */
function buildOverpassQuery(bbox: [number, number, number, number]): string {
  const [south, west, north, east] = bbox;
  const bboxStr = `${south},${west},${north},${east}`;

  return `[out:json][timeout:60];
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
 * Query Overpass API for a single metro bounding box
 */
async function queryOverpassApi(metro: string, bbox: [number, number, number, number]): Promise<OSMNode[]> {
  const query = buildOverpassQuery(bbox);

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
      signal: AbortSignal.timeout(65000),
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

  return {
    name: tags.name,
    city,
    state,
    lat,
    lng: lon,
    phone,
    website,
    osmId,
  };
}

/**
 * Main OSM scraper — queries all metros, deduplicates, ingests to database
 */
export async function runOsmScraper(): Promise<void> {
  console.log('[osmScraper] Starting Overpass API scraper...');

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

  for (const [metro, bbox] of Object.entries(METRO_BOUNDING_BOXES)) {
    try {
      const nodes = await queryOverpassApi(metro, bbox);

      for (const node of nodes) {
        const mapped = mapOsmToOrganizer(node);
        if (!mapped) {
          skipped++;
          continue;
        }

        if (seen.has(mapped.osmId)) {
          skipped++;
          continue;
        }

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
        undefined
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
    `[osmScraper] Complete — ${created} created/updated, ${failed} failed`
  );
}
