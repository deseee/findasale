/**
 * TheSaleSeker.com scraper adapter
 * Aggregates estate sales, auctions, and secondary sale organizers
 * Uses Playwright for JavaScript-rendered content
 * ADR-073: Directory Scraper Phase 1
 */

import * as cheerio from 'cheerio';
import { RateLimiter } from '../rateLimiter';
import { ingestScrapedListing, ScrapedItem } from '../index';
import { getRandomUserAgent, jitterDelay } from '../userAgents';

const SALE_SEEKER_BASE_URL = 'https://thesaleseeker.com';

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
