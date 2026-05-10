/**
 * ADR-073: Directory Scraper — Scheduled Jobs
 * Runs daily scrapes across national metro list.
 * Gated by SCRAPER_ENABLED env var (set to "true" to activate).
 *
 * Schedule:
 *   00:00 UTC — EstateSalesNet (all metros)
 *   06:00 UTC — GarageSaleFinder (all metros)
 *   12:00 UTC — FacebookMarketplace (all metros)
 */

import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { runScrapeRun } from '../services/scraper';
import { SOURCE_REGISTRY } from '../services/scraper/sourceRegistry';

/**
 * ~300 US metros by estate/yard sale activity — all cities 50k+ population.
 * Format: [city-slug]-[state-abbrev]
 */
export const NATIONAL_METROS = [
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

/**
 * Run a source across all metros sequentially.
 * Sequential to respect rate limits — one metro at a time.
 */
async function runSourceAcrossMetros(source: string): Promise<void> {
  console.log(`[scraperCron] Starting ${source} run across ${NATIONAL_METROS.length} metros`);
  let totalFailed = 0;

  for (const metro of NATIONAL_METROS) {
    try {
      await runScrapeRun(source, metro);
    } catch (error) {
      totalFailed++;
      console.error(`[scraperCron] ${source} failed for ${metro}:`, error);
      // Continue to next metro — don't let one failure stop the run
    }
  }

  console.log(`[scraperCron] ${source} complete — ${NATIONAL_METROS.length - totalFailed} metros OK, ${totalFailed} failed`);
}

/**
 * Initialize scraper cron jobs.
 * Called once at server startup via src/index.ts.
 */
export function initScraperCron(): void {
  if (process.env.SCRAPER_ENABLED !== 'true') {
    console.log('[scraperCron] Scraper disabled — set SCRAPER_ENABLED=true to activate');
    return;
  }

  console.log('[scraperCron] Scraper cron initialized');

  // ADR-073: Build cron schedules dynamically from SOURCE_REGISTRY.
  // Only sources with enabled=true and a cronSchedule are registered.
  // EstateSalesNet is skipped if USE_GH_ACTIONS_ESTATESALESNET=true (GitHub Actions handles it).
  const scheduledSources: string[] = [];

  for (const sourceDef of SOURCE_REGISTRY) {
    if (!sourceDef.enabled || !sourceDef.cronSchedule || sourceDef.prohibited) continue;

    // EstateSalesNet gate: GitHub Actions may handle it instead
    if (sourceDef.id === 'EstateSalesNet' && process.env.USE_GH_ACTIONS_ESTATESALESNET === 'true') {
      console.log('[scraperCron] EstateSalesNet skipped — GitHub Actions handles it (USE_GH_ACTIONS_ESTATESALESNET=true)');
      continue;
    }

    const { id, cronSchedule, runMode } = sourceDef;

    cron.schedule(cronSchedule, cronGuard({ jobName: `scraperCron:${id}` }, async () => {
      console.log(`[scraperCron] ${id} scheduled run starting`);
      if (runMode === 'national-once') {
        // national-once: run once with a placeholder metro (ignored by the source)
        await runScrapeRun(id, 'national').catch((err) =>
          console.error(`[scraperCron] ${id} run error:`, err)
        );
      } else {
        // metro-loop: iterate all metros sequentially
        await runSourceAcrossMetros(id).catch((err) =>
          console.error(`[scraperCron] ${id} run error:`, err)
        );
      }
    }));

    scheduledSources.push(`${id} @ ${cronSchedule}`);
  }

  console.log(`[scraperCron] Scheduled ${scheduledSources.length} sources: ${scheduledSources.join(', ')} (${NATIONAL_METROS.length} metros for metro-loop sources)`);
}
