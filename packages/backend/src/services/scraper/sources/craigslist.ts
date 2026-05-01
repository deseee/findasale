/**
 * Craigslist scraper adapter — Phase 2 Full Implementation
 * Scrapes estate/yard/garage sales from Craigslist using Cheerio + fetch
 * ADR-073: Directory Scraper Phase 2
 * D-073-A: "Beg forgiveness" stance — scrape without permission
 */

import * as cheerio from 'cheerio';
import { RateLimiter } from '../rateLimiter';
import { ingestScrapedListing, ScrapedItem } from '../index';
import { getRandomUserAgent, jitterDelay } from '../userAgents';

/**
 * Craigslist metro slug mapping for subdomain URLs
 * Format: "city-state-abbrev" → craigslist subdomain
 */
const CRAIGSLIST_METRO_MAP: Record<string, string> = {
  'chicago-il': 'chicago',
  'detroit-mi': 'detroit',
  'cleveland-oh': 'cleveland',
  'columbus-oh': 'columbus',
  'cincinnati-oh': 'cincinnati',
  'indianapolis-in': 'indianapolis',
  'milwaukee-wi': 'milwaukee',
  'minneapolis-mn': 'minneapolis',
  'st-louis-mo': 'stlouis',
  'kansas-city-mo': 'kansascity',
  'nashville-tn': 'nashville',
  'louisville-ky': 'louisville',
  'memphis-tn': 'memphis',
  'atlanta-ga': 'atlanta',
  'charlotte-nc': 'charlotte',
  'pittsburgh-pa': 'pittsburgh',
  'buffalo-ny': 'buffalo',
  'richmond-va': 'richmond',
  'baltimore-md': 'baltimore',
  'grand-rapids-mi': 'grandrapids',
  'denver-co': 'denver',
  'phoenix-az': 'phoenix',
  'portland-or': 'portland',
  'seattle-wa': 'seattle',
  'boston-ma': 'boston',
  'philadelphia-pa': 'philadelphia',
  'new-york-ny': 'newyork',
  'los-angeles-ca': 'losangeles',
  'san-francisco-ca': 'sfbay',
  'san-diego-ca': 'sandiego',
  'houston-tx': 'houston',
  'dallas-tx': 'dallas',
  'austin-tx': 'austin',
};

/**
 * Scrape Craigslist for a specific metro area.
 * Searches for estate/yard/garage/flea market sales.
 */
export async function scrapeCraigslist(
  metro: string,
  organizerId: string,
  rateLimiter: RateLimiter
): Promise<{ created: number; updated: number; skipped: number; failed: number }> {
  const stats = { created: 0, updated: 0, skipped: 0, failed: 0 };

  const craigslistMetro = CRAIGSLIST_METRO_MAP[metro];
  if (!craigslistMetro) {
    console.warn(`[Craigslist] No mapping for metro: ${metro} — skipping`);
    return stats;
  }

  try {
    console.log(`[Craigslist] Starting scrape for ${metro} (${craigslistMetro})`);

    // Try multiple search queries to capture different sale types
    const searchQueries = ['estate sale', 'yard sale', 'garage sale', 'flea market'];

    for (const query of searchQueries) {
      try {
        const listings = await scrapeQuery(craigslistMetro, query, rateLimiter);
        console.log(`[Craigslist] Found ${listings.length} listings for "${query}" in ${craigslistMetro}`);

        for (const listing of listings) {
          const result = await ingestScrapedListing(listing, organizerId);
          if (result.status === 'created') stats.created++;
          else if (result.status === 'updated') stats.updated++;
          else if (result.status === 'skipped') stats.skipped++;
          else stats.failed++;
        }
      } catch (err) {
        console.error(`[Craigslist] Query failed for "${query}" in ${craigslistMetro}:`, err);
        stats.failed++;
      }

      // Rate limiting: random jitter between metro requests
      await jitterDelay(400, 1000);
    }

    console.log(`[Craigslist] ${metro} complete — created ${stats.created}, skipped ${stats.skipped}, failed ${stats.failed}`);
    return stats;
  } catch (error) {
    console.error(`[Craigslist] Scrape failed for ${metro}:`, error);
    throw error;
  }
}

/**
 * Scrape a single Craigslist search query in a metro area
 */
async function scrapeQuery(
  craigslistMetro: string,
  query: string,
  rateLimiter: RateLimiter
): Promise<ScrapedItem[]> {
  const listings: ScrapedItem[] = [];
  const domain = `${craigslistMetro}.craigslist.org`;

  // Craigslist uses multiple search categories; try 'gms' (garage/moving sales) and 'sss' (services)
  const searchPaths = [
    `/search/gms?query=${encodeURIComponent(query)}&sort=date`,
    `/search/sss?query=${encodeURIComponent(query)}&sort=date`,
  ];

  for (const path of searchPaths) {
    const url = `https://${domain}${path}`;

    try {
      await rateLimiter.waitBeforeRequest(domain);

      const response = await fetch(url, {
        headers: { 'User-Agent': getRandomUserAgent() },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          rateLimiter.recordBackoff(domain, retryAfter ? parseInt(retryAfter) : 60);
        }
        console.warn(`[Craigslist] Bad response for ${url}: ${response.status}`);
        continue;
      }

      const html = await response.text();
      const parsed = parseListingPage(html, domain, query);

      listings.push(...parsed);

      // Small delay with jitter between searches
      await jitterDelay(200, 600);
    } catch (err) {
      console.warn(`[Craigslist] Failed to fetch ${url}:`, err);
    }
  }

  return listings;
}

/**
 * Parse Craigslist listing search page
 * Extracts individual listing links and details from the HTML
 */
function parseListingPage(html: string, domain: string, query: string): ScrapedItem[] {
  const listings: ScrapedItem[] = [];

  try {
    const $ = cheerio.load(html);

    // Craigslist uses .cl-search-result or similar containers
    // Look for listing row containers — selectors vary by Craigslist category
    const rows = $('.cl-search-result, .result-row, [data-id]');

    rows.each((_, el) => {
      try {
        const titleEl = $(el).find('a.titlestring, a[href*="/"], .title a').first();
        const title = titleEl.text().trim();
        const listingUrl = titleEl.attr('href') || '';

        if (!title || !listingUrl) return;

        // Make URL absolute if relative
        const sourceUrl = listingUrl.startsWith('http')
          ? listingUrl
          : `https://${domain}${listingUrl.startsWith('/') ? '' : '/'}${listingUrl}`;

        const priceText = $(el).find('.price, [class*="price"]').text().trim();
        const locationText = $(el).find('.location, [class*="location"]').text().trim();
        const dateText = $(el).find('.date, time, [class*="date"]').text().trim();

        // Fallback: use query type to infer sale type
        let saleType = 'ESTATE';
        if (query.toLowerCase().includes('yard')) saleType = 'YARD';
        else if (query.toLowerCase().includes('garage')) saleType = 'YARD';
        else if (query.toLowerCase().includes('flea')) saleType = 'FLEA_MARKET';

        // Create minimal listing object
        // Location parsing: "Grand Rapids, MI" or similar
        const locationMatch = locationText.match(/^(.+?),\s*([A-Z]{2})$/);
        const city = locationMatch ? locationMatch[1].trim() : 'Unknown';
        const state = locationMatch ? locationMatch[2] : 'MI';

        // Generate synthetic dates (sale tomorrow and day after)
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() + 1);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);

        // Create listing object with minimal required fields
        // Craigslist doesn't provide detailed location info, so we use city-level data
        const listing: ScrapedItem = {
          title,
          address: locationText || 'See listing for details',
          city,
          state,
          zip: '00000', // Craigslist doesn't provide ZIP; placeholder
          startDate,
          endDate,
          description: `Price: ${priceText || 'Contact seller'} | Posted: ${dateText}`,
          sourceUrl,
          sourceName: 'Craigslist',
          sourceItemId: listingUrl.split('/').pop() || undefined,
          scrapedMetadata: {
            query,
            priceText,
            datePosted: dateText,
          },
          saleType,
        };

        listings.push(listing);
      } catch (err) {
        console.debug('[Craigslist] Failed to parse individual listing:', err);
      }
    });

    console.log(`[Craigslist] Parsed ${listings.length} listings from search page`);
  } catch (err) {
    console.error('[Craigslist] Error parsing listing page:', err);
  }

  return listings;
}

