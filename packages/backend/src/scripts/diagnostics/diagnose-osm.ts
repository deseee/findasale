// DIAGNOSTIC ONLY — dry-run, no DB writes
/**
 * diagnose-osm.ts
 * Hits the Overpass API exactly as osmScraper.ts does.
 * Tests ONE metro (Grand Rapids, MI) to keep runtime under 10s.
 * Prints: response status, element count, sample element, filter pass/fail.
 *
 * Run: npx tsx src/scripts/diagnostics/diagnose-osm.ts
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Same bbox as osmScraper for Grand Rapids, MI
const TEST_METRO = 'Grand Rapids, MI';
const TEST_BBOX: [number, number, number, number] = [42.7216, -85.7747, 42.9906, -85.4407];

// Same tags as osmScraper
const SALE_TAGS = ['shop=antiques', 'shop=secondhand', 'shop=used_goods', 'amenity=auction_house', 'craft=auctioneer'];

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

function wouldPassFilter(node: OSMNode): boolean {
  // Same logic as mapOsmToOrganizer: needs a name + coordinates
  const lat = node.lat ?? node.center?.lat;
  const lon = node.lon ?? node.center?.lon;
  return !!(node.tags?.name && lat !== undefined && lon !== undefined);
}

async function main() {
  console.log('=== diagnose-osm.ts — DRY RUN ===');
  console.log(`Target: Overpass API — ${TEST_METRO}`);
  console.log(`Endpoint: ${OVERPASS_URL}`);
  console.log(`BBox: ${TEST_BBOX.join(', ')}`);
  console.log(`Tags queried: ${SALE_TAGS.join(', ')}`);
  console.log('');

  const query = buildOverpassQuery(TEST_BBOX);

  let elements: OSMNode[] = [];

  try {
    const start = Date.now();
    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0 (compatible; FindASale/1.0)',
      },
      signal: AbortSignal.timeout(65000),
    });
    const elapsed = Date.now() - start;

    console.log(`Response status : ${response.status} ${response.statusText}`);
    console.log(`Response time   : ${elapsed}ms`);
    console.log(`Content-Type    : ${response.headers.get('content-type') ?? 'unknown'}`);

    if (!response.ok) {
      const body = await response.text();
      console.error(`\nError body (first 500 chars):\n${body.slice(0, 500)}`);
      console.log('\nRESULT: BROKEN — Overpass API returned non-200 status');
      process.exit(1);
    }

    const data = (await response.json()) as OverpassResponse;
    elements = data.elements ?? [];

    console.log(`\nElements returned: ${elements.length}`);

    if (elements.length === 0) {
      console.log('\nRESULT: EMPTY — Overpass returned 0 elements for Grand Rapids bbox');
      process.exit(0);
    }

    // Show sample element
    const sample = elements[0];
    console.log('\n--- Sample element (element[0]) ---');
    console.log(JSON.stringify(sample, null, 2));

    // Filter analysis
    const passing = elements.filter(wouldPassFilter);
    const failingNoName = elements.filter((e: OSMNode) => !e.tags?.name);
    const failingNoCoords = elements.filter((e: OSMNode) => {
      const lat = e.lat ?? e.center?.lat;
      const lon = e.lon ?? e.center?.lon;
      return e.tags?.name && (lat === undefined || lon === undefined);
    });

    console.log('\n--- Filter analysis ---');
    console.log(`Would pass filter (has name + coords) : ${passing.length}`);
    console.log(`Would be skipped (no name)            : ${failingNoName.length}`);
    console.log(`Would be skipped (no coords)          : ${failingNoCoords.length}`);

    // Show first 5 names
    if (passing.length > 0) {
      console.log('\nSample passing records:');
      passing.slice(0, 5).forEach((e: OSMNode, i: number) => {
        const lat = e.lat ?? e.center?.lat;
        const lon = e.lon ?? e.center?.lon;
        console.log(`  [${i + 1}] "${e.tags.name}" — ${e.tags['addr:city'] ?? 'city?'}, ${e.tags['addr:state'] ?? 'state?'} (${lat?.toFixed(4)}, ${lon?.toFixed(4)})`);
      });
    }

    const insertable = passing.length > 0;
    console.log(`\nInsertable: ${insertable ? 'YES' : 'NO'} — ${passing.length} records would be upserted`);

    if (passing.length > 0) {
      console.log('\nRESULT: WORKING — Overpass returned data, filter passes, insertable');
    } else {
      console.log('\nRESULT: EMPTY — Elements returned but none pass name+coords filter');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nFetch threw: ${msg}`);
    console.log('\nRESULT: BROKEN — Network error or timeout reaching Overpass API');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
