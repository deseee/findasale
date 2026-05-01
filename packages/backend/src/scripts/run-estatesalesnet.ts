/**
 * ADR-076: Standalone EstateSalesNet scraper for GitHub Actions
 * Runs outside Express server, POSTs results to Railway backend
 *
 * Environment variables (from GitHub secrets):
 * - RAILWAY_BACKEND_URL: https://backend-production-xxx.up.railway.app
 * - INTERNAL_SCRAPER_KEY: shared secret for authentication
 * - ESTATESALESNET_ORGANIZER_ID: organizer to attribute scraped listings to
 *
 * Usage: npx ts-node src/scripts/run-estatesalesnet.ts
 */

import { scrapeEstateSalesNetItems } from '../services/scraper/sources/estatesalesnet';
import { RateLimiter } from '../services/scraper/rateLimiter';

// National metros list — copied from scraperCron.ts
const NATIONAL_METROS = [
  // Northeast — New York
  'new-york-ny',
  'buffalo-ny',
  'rochester-ny',
  'yonkers-ny',
  'syracuse-ny',
  'albany-ny',
  'new-rochelle-ny',
  'mount-vernon-ny',
  'schenectady-ny',
  'utica-ny',
  'white-plains-ny',

  // Northeast — Pennsylvania
  'philadelphia-pa',
  'pittsburgh-pa',
  'allentown-pa',
  'erie-pa',
  'reading-pa',
  'scranton-pa',
  'bethlehem-pa',
  'lancaster-pa',
  'harrisburg-pa',
  'york-pa',

  // Northeast — New England
  'boston-ma',
  'worcester-ma',
  'springfield-ma',
  'lowell-ma',
  'cambridge-ma',
  'new-bedford-ma',
  'brockton-ma',
  'quincy-ma',
  'hartford-ct',
  'new-haven-ct',
  'bridgeport-ct',
  'stamford-ct',
  'waterbury-ct',
  'norwalk-ct',
  'providence-ri',
  'cranston-ri',
  'pawtucket-ri',
  'portland-me',
  'manchester-nh',
  'nashua-nh',
  'burlington-vt',

  // Northeast — New Jersey
  'newark-nj',
  'jersey-city-nj',
  'paterson-nj',
  'elizabeth-nj',
  'trenton-nj',
  'camden-nj',
  'clifton-nj',

  // Mid-Atlantic
  'baltimore-md',
  'washington-dc',
  'wilmington-de',

  // Southeast — Virginia
  'virginia-beach-va',
  'norfolk-va',
  'chesapeake-va',
  'richmond-va',
  'newport-news-va',
  'hampton-va',
  'alexandria-va',
  'roanoke-va',

  // Southeast — North Carolina
  'charlotte-nc',
  'raleigh-nc',
  'greensboro-nc',
  'durham-nc',
  'winston-salem-nc',
  'fayetteville-nc',
  'cary-nc',
  'wilmington-nc',
  'high-point-nc',

  // Southeast — South Carolina
  'charleston-sc',
  'columbia-sc',
  'greenville-sc',
  'rock-hill-sc',

  // Southeast — Georgia
  'atlanta-ga',
  'savannah-ga',
  'macon-ga',
  'columbus-ga',
  'augusta-ga',
  'athens-ga',

  // Southeast — Florida
  'miami-fl',
  'fort-lauderdale-fl',
  'orlando-fl',
  'tampa-fl',
  'st-petersburg-fl',
  'jacksonville-fl',
  'hialeah-fl',
  'tallahassee-fl',
  'cape-coral-fl',
  'fort-myers-fl',
  'pembroke-pines-fl',
  'hollywood-fl',
  'gainesville-fl',
  'miramar-fl',
  'coral-springs-fl',
  'clearwater-fl',
  'palm-bay-fl',
  'west-palm-beach-fl',
  'lakeland-fl',
  'pompano-beach-fl',
  'pensacola-fl',
  'port-st-lucie-fl',
  'daytona-beach-fl',
  'sarasota-fl',

  // Southeast — Tennessee
  'nashville-tn',
  'memphis-tn',
  'knoxville-tn',
  'chattanooga-tn',
  'clarksville-tn',
  'murfreesboro-tn',

  // Southeast — Alabama
  'birmingham-al',
  'montgomery-al',
  'huntsville-al',
  'mobile-al',
  'tuscaloosa-al',

  // Southeast — Mississippi
  'jackson-ms',
  'gulfport-ms',

  // Southeast — Louisiana
  'new-orleans-la',
  'baton-rouge-la',
  'shreveport-la',
  'lafayette-la',
  'lake-charles-la',
  'kenner-la',

  // Southeast — Arkansas
  'little-rock-ar',
  'fayetteville-ar',
  'fort-smith-ar',

  // Midwest — Illinois
  'chicago-il',
  'aurora-il',
  'joliet-il',
  'rockford-il',
  'springfield-il',
  'elgin-il',
  'peoria-il',
  'champaign-il',

  // Midwest — Michigan
  'detroit-mi',
  'grand-rapids-mi',
  'warren-mi',
  'sterling-heights-mi',
  'ann-arbor-mi',
  'lansing-mi',
  'flint-mi',
  'dearborn-mi',
  'livonia-mi',
  'westland-mi',
  'clinton-mi',
  'kalamazoo-mi',

  // Midwest — Ohio
  'columbus-oh',
  'cleveland-oh',
  'cincinnati-oh',
  'toledo-oh',
  'akron-oh',
  'dayton-oh',
  'parma-oh',
  'canton-oh',
  'youngstown-oh',
  'lorain-oh',

  // Midwest — Indiana
  'indianapolis-in',
  'fort-wayne-in',
  'evansville-in',
  'south-bend-in',
  'carmel-in',
  'fishers-in',
  'hammond-in',
  'muncie-in',

  // Midwest — Wisconsin
  'milwaukee-wi',
  'madison-wi',
  'green-bay-wi',
  'kenosha-wi',
  'racine-wi',
  'appleton-wi',
  'waukesha-wi',
  'oshkosh-wi',

  // Midwest — Minnesota
  'minneapolis-mn',
  'st-paul-mn',
  'rochester-mn',
  'duluth-mn',
  'bloomington-mn',
  'brooklyn-park-mn',
  'plymouth-mn',

  // Midwest — Missouri
  'st-louis-mo',
  'kansas-city-mo',
  'columbia-mo',
  'springfield-mo',
  'independence-mo',
  'st-joseph-mo',

  // Midwest — Iowa
  'des-moines-ia',
  'cedar-rapids-ia',
  'davenport-ia',
  'sioux-city-ia',
  'iowa-city-ia',
  'waterloo-ia',

  // Midwest — Nebraska
  'omaha-ne',
  'lincoln-ne',

  // Midwest — Kansas
  'wichita-ks',
  'overland-park-ks',
  'kansas-city-ks',
  'topeka-ks',
  'olathe-ks',

  // Midwest — South Dakota / North Dakota
  'sioux-falls-sd',
  'rapid-city-sd',
  'fargo-nd',
  'bismarck-nd',

  // Southwest — Texas
  'houston-tx',
  'san-antonio-tx',
  'dallas-tx',
  'austin-tx',
  'fort-worth-tx',
  'el-paso-tx',
  'arlington-tx',
  'corpus-christi-tx',
  'plano-tx',
  'laredo-tx',
  'lubbock-tx',
  'garland-tx',
  'irving-tx',
  'amarillo-tx',
  'grand-prairie-tx',
  'mckinney-tx',
  'frisco-tx',
  'mesquite-tx',
  'killeen-tx',
  'waco-tx',
  'abilene-tx',
  'beaumont-tx',
  'pasadena-tx',
  'denton-tx',
  'carrollton-tx',
  'midland-tx',
  'odessa-tx',
  'tyler-tx',
  'wichita-falls-tx',

  // Southwest — Arizona
  'phoenix-az',
  'tucson-az',
  'mesa-az',
  'chandler-az',
  'scottsdale-az',
  'tempe-az',
  'gilbert-az',
  'glendale-az',
  'peoria-az',
  'surprise-az',
  'yuma-az',
  'flagstaff-az',

  // Southwest — New Mexico
  'albuquerque-nm',
  'las-cruces-nm',
  'santa-fe-nm',

  // Southwest — Nevada
  'las-vegas-nv',
  'henderson-nv',
  'reno-nv',
  'north-las-vegas-nv',
  'sparks-nv',

  // Southwest — Colorado
  'denver-co',
  'colorado-springs-co',
  'aurora-co',
  'fort-collins-co',
  'lakewood-co',
  'thornton-co',
  'arvada-co',
  'westminster-co',
  'pueblo-co',
  'boulder-co',

  // Southwest — Utah
  'salt-lake-city-ut',
  'west-valley-city-ut',
  'provo-ut',
  'west-jordan-ut',
  'orem-ut',
  'ogden-ut',
  'sandy-ut',

  // Southwest — Oklahoma
  'oklahoma-city-ok',
  'tulsa-ok',
  'norman-ok',
  'broken-arrow-ok',
  'lawton-ok',
  'edmond-ok',

  // Southwest — Idaho
  'boise-id',
  'meridian-id',
  'nampa-id',
  'idaho-falls-id',
  'pocatello-id',

  // West Coast — California
  'los-angeles-ca',
  'san-diego-ca',
  'san-jose-ca',
  'san-francisco-ca',
  'fresno-ca',
  'sacramento-ca',
  'long-beach-ca',
  'bakersfield-ca',
  'anaheim-ca',
  'stockton-ca',
  'riverside-ca',
  'santa-ana-ca',
  'chula-vista-ca',
  'irvine-ca',
  'fremont-ca',
  'san-bernardino-ca',
  'modesto-ca',
  'fontana-ca',
  'moreno-valley-ca',
  'glendale-ca',
  'huntington-beach-ca',
  'santa-clara-ca',
  'garden-grove-ca',
  'santa-rosa-ca',
  'oceanside-ca',
  'elk-grove-ca',
  'salinas-ca',
  'sunnyvale-ca',
  'pomona-ca',
  'escondido-ca',
  'torrance-ca',
  'pasadena-ca',
  'fullerton-ca',
  'ontario-ca',
  'rancho-cucamonga-ca',
  'orange-ca',
  'santa-clarita-ca',
  'hayward-ca',
  'palmdale-ca',
  'concord-ca',
  'visalia-ca',
  'roseville-ca',
  'oxnard-ca',
  'corona-ca',
  'vallejo-ca',
  'lancaster-ca',
  'murrieta-ca',
  'berkeley-ca',
  'san-buenaventura-ca',
  'simi-valley-ca',
  'santa-barbara-ca',
  'richmond-ca',

  // West Coast — Oregon
  'portland-or',
  'eugene-or',
  'salem-or',
  'gresham-or',
  'hillsboro-or',
  'beaverton-or',
  'bend-or',
  'medford-or',

  // West Coast — Washington
  'seattle-wa',
  'spokane-wa',
  'tacoma-wa',
  'vancouver-wa',
  'bellevue-wa',
  'kent-wa',
  'everett-wa',
  'renton-wa',
  'federal-way-wa',
  'yakima-wa',
  'bellingham-wa',

  // Pacific — Alaska & Hawaii
  'anchorage-ak',
  'honolulu-hi',
];

const INGEST_URL = (process.env.RAILWAY_BACKEND_URL || 'http://localhost:3001') + '/api/internal/scraper/ingest';
const SCRAPER_KEY = process.env.INTERNAL_SCRAPER_KEY;
const ORGANIZER_ID = process.env.ESTATESALESNET_ORGANIZER_ID;

async function main() {
  // Validate required env vars
  if (!SCRAPER_KEY) {
    throw new Error('INTERNAL_SCRAPER_KEY environment variable is not set');
  }
  if (!ORGANIZER_ID) {
    throw new Error('ESTATESALESNET_ORGANIZER_ID environment variable is not set');
  }

  console.log(`[run-estatesalesnet] Starting scrape of ${NATIONAL_METROS.length} metros`);
  console.log(`[run-estatesalesnet] Backend URL: ${INGEST_URL}`);

  const rateLimiter = new RateLimiter({ requestsPerSecond: 1, maxRetries: 3 });
  const allItems: any[] = [];
  let successCount = 0;
  let failureCount = 0;

  // Scrape each metro sequentially
  for (const metro of NATIONAL_METROS) {
    try {
      console.log(`[run-estatesalesnet] Scraping ${metro}...`);
      const items = await scrapeEstateSalesNetItems(metro, rateLimiter);
      allItems.push(...items);
      successCount++;
      console.log(`[run-estatesalesnet] ${metro}: ${items.length} items`);
    } catch (error) {
      failureCount++;
      console.error(`[run-estatesalesnet] Failed for ${metro}:`, error instanceof Error ? error.message : String(error));
    }
  }

  console.log(`[run-estatesalesnet] Scraping complete — ${successCount} metros OK, ${failureCount} failed`);
  console.log(`[run-estatesalesnet] Total items collected: ${allItems.length}`);

  // POST to Railway in batches of 25
  const batchSize = 25;
  for (let i = 0; i < allItems.length; i += batchSize) {
    const batch = allItems.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(allItems.length / batchSize);

    try {
      console.log(`[run-estatesalesnet] Posting batch ${batchNum}/${totalBatches} (${batch.length} items)...`);

      const response = await fetch(INGEST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-scraper-key': SCRAPER_KEY,
        },
        body: JSON.stringify({
          items: batch,
          organizerId: ORGANIZER_ID,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`[run-estatesalesnet] Batch ${batchNum} failed with status ${response.status}:`, error);
        continue;
      }

      const result = await response.json() as { stats: { created: number; updated: number; skipped: number; failed: number } };
      console.log(`[run-estatesalesnet] Batch ${batchNum} ingested — ${result.stats.created} created, ${result.stats.skipped} skipped, ${result.stats.failed} failed`);
    } catch (error) {
      console.error(`[run-estatesalesnet] Failed to post batch ${batchNum}:`, error instanceof Error ? error.message : String(error));
    }
  }

  console.log(`[run-estatesalesnet] All batches posted. Done.`);
}

main().catch((error) => {
  console.error('[run-estatesalesnet] Fatal error:', error);
  process.exit(1);
});
