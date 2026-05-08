/**
 * TheSaleSeker.com scraper adapter
 * ADR-073: Directory Scraper Phase 1
 *
 * STATUS: DISABLED — pre-launch site, no data to scrape.
 *
 * As of 2026-05, thesaleseeker.com is a pre-launch marketing/waitlist page
 * with zero listings, no directory, and no "listing" custom post type.
 * Their FAQ confirms: "We're currently in development and getting closer every day!"
 * The WP REST API exposes only 4 pages (Home, FAQ, Contact, Socials).
 *
 * The selector audit that flagged [data-listing] / .listing-card was correct that
 * those selectors return zero results, but a selector fix cannot help — the
 * underlying data does not exist on the site yet.
 *
 * Re-enable once thesaleseeker.com publicly launches their listing directory.
 * At that point: fetch their HTML, identify actual container selectors, and
 * remove the DISABLED guard below.
 */

import * as cheerio from 'cheerio';
import { RateLimiter } from '../rateLimiter';
import { ingestScrapedListing, ScrapedItem } from '../index';
import { getRandomUserAgent, jitterDelay } from '../userAgents';

const SALE_SEEKER_BASE_URL = 'https://thesaleseeker.com';

/**
 * Comprehensive national metro coverage for TheSaleSeker scraping.
 * Format: {city-name}-{state-abbreviation} all lowercase with hyphens.
 * Covers top 50 US metros + major secondary markets across all 50 states.
 */
export const DEFAULT_METROS = [
  // Top 10 metros
  'new-york-ny',
  'los-angeles-ca',
  'chicago-il',
  'dallas-tx',
  'houston-tx',
  'philadelphia-pa',
  'phoenix-az',
  'san-antonio-tx',
  'san-diego-ca',
  'san-jose-ca',

  // Top 11-25 metros
  'austin-tx',
  'jacksonville-fl',
  'fort-worth-tx',
  'columbus-oh',
  'charlotte-nc',
  'san-francisco-ca',
  'indianapolis-in',
  'seattle-wa',
  'denver-co',
  'boston-ma',

  // Top 26-50 metros
  'el-paso-tx',
  'memphis-tn',
  'nashville-tn',
  'detroit-mi',
  'oklahoma-city-ok',
  'portland-or',
  'las-vegas-nv',
  'louisville-ky',
  'baltimore-md',
  'milwaukee-wi',
  'albuquerque-nm',
  'tucson-az',
  'fresno-ca',
  'sacramento-ca',
  'kansas-city-mo',
  'mesa-az',
  'virginia-beach-va',
  'atlanta-ga',
  'new-orleans-la',
  'minneapolis-mn',
  'long-beach-ca',
  'miami-fl',
  'oakland-ca',
  'tulsa-ok',
  'cleveland-oh',

  // Additional major secondary markets by state
  // Alabama
  'birmingham-al',
  'mobile-al',
  'montgomery-al',

  // Alaska
  'anchorage-ak',
  'juneau-ak',

  // Arizona
  'scottsdale-az',
  'glendale-az',
  'gilbert-az',
  'chandler-az',

  // Arkansas
  'little-rock-ar',
  'fayetteville-ar',

  // California
  'santa-ana-ca',
  'irvine-ca',
  'berkeley-ca',
  'oakland-ca',
  'santa-monica-ca',
  'pasadena-ca',
  'anaheim-ca',
  'ventura-ca',
  'stockton-ca',
  'santa-barbara-ca',

  // Colorado
  'boulder-co',
  'colorado-springs-co',
  'fort-collins-co',
  'pueblo-co',

  // Connecticut
  'bridgeport-ct',
  'hartford-ct',
  'new-haven-ct',

  // Delaware
  'wilmington-de',
  'dover-de',

  // Florida
  'orlando-fl',
  'tampa-fl',
  'st-petersburg-fl',
  'hialeah-fl',
  'fort-lauderdale-fl',
  'palm-beach-fl',
  'daytona-beach-fl',
  'ft-myers-fl',
  'naples-fl',
  'sarasota-fl',
  'gainesville-fl',
  'tampa-bay-fl',

  // Georgia
  'savannah-ga',
  'augusta-ga',
  'athens-ga',

  // Hawaii
  'honolulu-hi',

  // Idaho
  'boise-id',
  'pocatello-id',

  // Illinois
  'peoria-il',
  'rockford-il',
  'springfield-il',
  'naperville-il',
  'evanston-il',
  'oak-lawn-il',

  // Indiana
  'fort-wayne-in',
  'evansville-in',
  'south-bend-in',
  'bloomington-in',
  'gary-in',

  // Iowa
  'des-moines-ia',
  'cedar-rapids-ia',
  'davenport-ia',
  'iowa-city-ia',

  // Kansas
  'wichita-ks',
  'overland-park-ks',
  'kansas-city-ks',
  'topeka-ks',

  // Kentucky
  'lexington-ky',
  'covington-ky',

  // Louisiana
  'baton-rouge-la',
  'shreveport-la',
  'lafayette-la',

  // Maine
  'portland-me',
  'lewiston-me',
  'bangor-me',

  // Maryland
  'baltimore-md',
  'silver-spring-md',
  'annapolis-md',

  // Massachusetts
  'boston-ma',
  'worcester-ma',
  'springfield-ma',
  'salem-ma',

  // Michigan
  'detroit-mi',
  'grand-rapids-mi',
  'warren-mi',
  'ann-arbor-mi',
  'flint-mi',
  'lansing-mi',
  'sterling-heights-mi',
  'dearborn-mi',
  'livonia-mi',
  'traverse-city-mi',

  // Minnesota
  'minneapolis-mn',
  'st-paul-mn',
  'rochester-mn',
  'st-louis-park-mn',
  'minnetonka-mn',
  'bloomington-mn',

  // Mississippi
  'jackson-ms',
  'gulfport-ms',

  // Missouri
  'kansas-city-mo',
  'st-louis-mo',
  'springfield-mo',
  'independence-mo',
  'columbia-mo',

  // Montana
  'billings-mt',
  'missoula-mt',
  'great-falls-mt',

  // Nebraska
  'omaha-ne',
  'lincoln-ne',

  // Nevada
  'las-vegas-nv',
  'henderson-nv',
  'reno-nv',
  'north-las-vegas-nv',

  // New Hampshire
  'manchester-nh',
  'nashua-nh',
  'concord-nh',

  // New Jersey
  'newark-nj',
  'jersey-city-nj',
  'paterson-nj',
  'elizabeth-nj',
  'trenton-nj',
  'atlantic-city-nj',
  'camden-nj',

  // New Mexico
  'albuquerque-nm',
  'santa-fe-nm',
  'las-cruces-nm',

  // New York
  'new-york-ny',
  'buffalo-ny',
  'rochester-ny',
  'yonkers-ny',
  'syracuse-ny',
  'albany-ny',
  'new-rochelle-ny',
  'utica-ny',

  // North Carolina
  'charlotte-nc',
  'raleigh-nc',
  'greensboro-nc',
  'durham-nc',
  'chapel-hill-nc',
  'wilmington-nc',
  'asheville-nc',
  'fayetteville-nc',
  'charlotte-nc',
  'high-point-nc',

  // North Dakota
  'bismarck-nd',
  'fargo-nd',
  'grand-forks-nd',

  // Ohio
  'columbus-oh',
  'cleveland-oh',
  'cincinnati-oh',
  'toledo-oh',
  'akron-oh',
  'dayton-oh',
  'youngstown-oh',
  'canton-oh',

  // Oklahoma
  'oklahoma-city-ok',
  'tulsa-ok',
  'norman-ok',

  // Oregon
  'portland-or',
  'salem-or',
  'eugene-or',
  'gresham-or',
  'bend-or',

  // Pennsylvania
  'philadelphia-pa',
  'pittsburgh-pa',
  'allentown-pa',
  'erie-pa',
  'reading-pa',
  'scranton-pa',
  'bethlehem-pa',
  'harrisburg-pa',
  'lancaster-pa',
  'altoona-pa',

  // Rhode Island
  'providence-ri',
  'warwick-ri',
  'cranston-ri',

  // South Carolina
  'charleston-sc',
  'columbia-sc',
  'greenville-sc',
  'spartanburg-sc',
  'myrtle-beach-sc',

  // South Dakota
  'sioux-falls-sd',
  'rapid-city-sd',

  // Tennessee
  'memphis-tn',
  'nashville-tn',
  'knoxville-tn',
  'chattanooga-tn',
  'clarksville-tn',
  'murfreesboro-tn',

  // Texas
  'houston-tx',
  'san-antonio-tx',
  'dallas-tx',
  'austin-tx',
  'fort-worth-tx',
  'corpus-christi-tx',
  'lubbock-tx',
  'laredo-tx',
  'arlington-tx',
  'irving-tx',
  'plano-tx',
  'garland-tx',
  'amarillo-tx',
  'beaumont-tx',
  'brownsville-tx',
  'galveston-tx',
  'san-angelo-tx',
  'abilene-tx',
  'tyler-tx',
  'waco-tx',
  'grand-prairie-tx',
  'north-richland-hills-tx',
  'mckinney-tx',
  'carrollton-tx',
  'denton-tx',
  'lewisville-tx',
  'richardson-tx',
  'midland-tx',
  'odessa-tx',

  // Utah
  'salt-lake-city-ut',
  'provo-ut',
  'ogden-ut',
  'west-jordan-ut',
  'lehi-ut',
  'sandy-ut',

  // Vermont
  'burlington-vt',
  'montpelier-vt',

  // Virginia
  'virginia-beach-va',
  'norfolk-va',
  'richmond-va',
  'arlington-va',
  'alexandria-va',
  'roanoke-va',
  'lynchburg-va',
  'salem-va',

  // Washington
  'seattle-wa',
  'spokane-wa',
  'tacoma-wa',
  'vancouver-wa',
  'bellevue-wa',
  'kent-wa',
  'everett-wa',
  'renton-wa',
  'federal-way-wa',
  'olympia-wa',

  // West Virginia
  'charleston-wv',
  'huntington-wv',
  'parkersburg-wv',

  // Wisconsin
  'milwaukee-wi',
  'madison-wi',
  'green-bay-wi',
  'kenosha-wi',
  'racine-wi',
  'appleton-wi',
  'oshkosh-wi',

  // Wyoming
  'cheyenne-wy',
  'casper-wy',
  'laramie-wy',
];

/**
 * Scrape TheSaleSeker for a specific metro area.
 * Fetches organizer/company listings by searching for the metro area.
 */
export async function scrapeTheSaleSeker(
  metro: string,
  organizerId: string,
  rateLimiter: RateLimiter
): Promise<{ created: number; updated: number; skipped: number; failed: number }> {
  const stats = { created: 0, updated: 0, skipped: 0, failed: 0 };

  // DISABLED: thesaleseeker.com is pre-launch (no listings exist yet — verified 2026-05).
  // Remove this guard once the site launches and has a scrapeable directory.
  console.warn(`[TheSaleSeker] Scraper disabled — site is pre-launch, no listings available. Metro: ${metro}`);
  return stats;

  try {
    // Parse metro string: "grand-rapids-mi" → { city: "Grand Rapids", state: "MI" }
    const metroMatch = metro.match(/^(.+?)-([a-z]{2})$/i);
    if (!metroMatch) {
      console.warn(`[TheSaleSeker] Invalid metro format: ${metro}`);
      return stats;
    }

    const city = metroMatch[1]
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    const state = metroMatch[2].toUpperCase();

    // Build search URL — most aggregators support a search or directory endpoint
    // Without access to internal site structure, use robots.txt discovery
    await rateLimiter.loadRobotsTxt(SALE_SEEKER_BASE_URL);

    const searchUrl = `${SALE_SEEKER_BASE_URL}/?s=${encodeURIComponent(city)}&post_type=listing`;
    console.log(`[TheSaleSeker] Fetching listings for ${city}, ${state}: ${searchUrl}`);

    const domain = new URL(searchUrl).hostname;
    await rateLimiter.waitBeforeRequest(domain);

    if (!rateLimiter.isAllowed(searchUrl)) {
      console.warn(`[TheSaleSeker] Robots.txt blocked: ${searchUrl}`);
      return stats;
    }

    const response = await fetch(searchUrl, {
      headers: { 'User-Agent': getRandomUserAgent() },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        rateLimiter.recordBackoff(domain, retryAfter ? parseInt(retryAfter) : 60);
      }
      console.warn(`[TheSaleSeker] Search page returned ${response.status}`);
      return stats;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract organizer listings from the page
    // Pattern: look for listing cards/divs with business name, address, phone, website
    // Note: Actual selectors depend on site structure — this is a generic pattern
    const scrapedItems: Array<ScrapedItem> = [];

    // Try common listing container patterns
    $('[data-listing], .listing, .listing-card, .business-listing, article.listing')
      .each((_, element) => {
        const $el = $(element);

        // Extract business name (try multiple selectors)
        const name =
          $el.find('[data-name], .listing-name, .business-name, h2, .title').first().text().trim() ||
          $el.find('a').first().text().trim() ||
          '';

        // Extract phone (common patterns)
        const phone =
          $el.find('[data-phone], .phone, .business-phone').text().trim() ||
          $el
            .text()
            .match(/(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/)?.[1] ||
          undefined;

        // Extract website link
        const website =
          $el.find('[data-website], .website, .business-url').attr('href') ||
          $el
            .find('a[href*="http"]')
            .not('[href*="thesaleseeker.com"]')
            .attr('href') ||
          undefined;

        // Extract source URL (listing detail page)
        const sourceUrl = $el.find('a[href]').first().attr('href') || '';

        // Extract or generate source ID
        const sourceId = sourceUrl.match(/\/(\d+)/)?.[1] || sourceUrl.split('/').pop() || '';

        if (!name || !sourceId) {
          return; // Skip incomplete listings
        }

        const fullSourceUrl = sourceUrl.startsWith('http') ? sourceUrl : `${SALE_SEEKER_BASE_URL}${sourceUrl}`;

        // Build ScrapedItem for organizer ingestion
        const item: ScrapedItem = {
          title: name,
          address: `${city}, ${state}`,
          city,
          state,
          zip: '',
          startDate: new Date(),
          endDate: new Date(),
          sourceUrl: fullSourceUrl,
          sourceName: 'SaleSeker',
          sourceItemId: sourceId,
          scrapedMetadata: {
            businessName: name,
            phone,
            website,
          },
        };

        scrapedItems.push(item);
      });

    console.log(`[TheSaleSeker] Found ${scrapedItems.length} listings for ${city}, ${state}`);

    // Ingest each item as a scraped organizer listing
    for (const item of scrapedItems) {
      await jitterDelay(1000, 1000); // 1-second delay between ingestions

      const result = await ingestScrapedListing(item, organizerId);
      if (result.status === 'created') {
        stats.created++;
      } else if (result.status === 'updated') {
        stats.updated++;
      } else if (result.status === 'skipped') {
        stats.skipped++;
      } else {
        stats.failed++;
      }
    }

    rateLimiter.clearBackoff(domain);
    return stats;
  } catch (error) {
    console.error(`[TheSaleSeker] Scrape failed for ${metro}:`, error);
    throw error;
  }
}

/**
 * Parse a single TheSaleSeker listing detail page for enrichment.
 * Extracts phone, website, description, and hours if available.
 */
export async function parseSaleSeekerListing(
  listingUrl: string,
  rateLimiter: RateLimiter
): Promise<{ phone?: string; website?: string; address?: string; description?: string } | null> {
  try {
    const domain = new URL(listingUrl).hostname;
    await rateLimiter.waitBeforeRequest(domain);

    if (!rateLimiter.isAllowed(listingUrl)) {
      console.warn(`[TheSaleSeker] Robots.txt blocked: ${listingUrl}`);
      return null;
    }

    const response = await fetch(listingUrl, {
      headers: { 'User-Agent': getRandomUserAgent() },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        rateLimiter.recordBackoff(domain, retryAfter ? parseInt(retryAfter) : 60);
      }
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract enrichment fields
    const phone = $('[data-phone], .phone').text().trim() || undefined;
    const website = $('[data-website], .website').attr('href') || undefined;
    const address = $('[data-address], .address').text().trim() || undefined;
    const description = $('[data-description], .description, .listing-description')
      .text()
      .trim() || undefined;

    return { phone, website, address, description };
  } catch (error) {
    console.error(`[TheSaleSeker] Listing parse failed: ${listingUrl}`, error);
    return null;
  }
}
