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
import { CraigslistSite } from '../craigslist-sites';

/**
 * Fetch HTML from URL with error handling and timeout
 */
async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': getRandomUserAgent() },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`[Craigslist] HTTP ${res.status} for ${url}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.warn(`[Craigslist] Fetch error for ${url}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Parse Craigslist listing search page
 * Extracts individual listings from the HTML using verified selectors
 */
function parseListingPage(html: string, site: CraigslistSite, category: string): ScrapedItem[] {
  const listings: ScrapedItem[] = [];

  try {
    const $ = cheerio.load(html);

    // Verified selectors from S618 live probe
    const rows = $('li.cl-search-result, .cl-static-search-result, [data-pid]');

    rows.each((_, el) => {
      try {
        // Extract pid (data-pid) — required for dedup
        const pid = $(el).attr('data-pid');
        if (!pid) return;

        // Extract title from titlestring link
        const titleEl = $(el).find('a.titlestring').first();
        const title = titleEl.text().trim();
        if (!title) return;

        // Extract href and make absolute
        let href = titleEl.attr('href') ?? '';
        if (!href) return;
        const sourceUrl = href.startsWith('http')
          ? href
          : `https://${site.subdomain}.craigslist.org${href.startsWith('/') ? '' : '/'}${href}`;

        // Extract location and date text
        const locationText = $(el).find('.meta, .result-meta').first().text().trim();

        // Parse dates from location text: format "M/D,M/D,..." represents date range
        let startDate: Date;
        let endDate: Date;

        const dateMatch = locationText.match(/^((?:\d{1,2}\/\d{1,2},?)+)/);
        if (dateMatch) {
          const dateStr = dateMatch[1];
          const dates = dateStr.split(',').map((d) => d.trim()).filter((d) => d.length > 0);

          if (dates.length >= 2) {
            // Parse first and last dates
            const parseMonthDay = (mdStr: string): Date => {
              const [month, day] = mdStr.split('/').map(Number);
              const now = new Date();
              let year = now.getFullYear();

              // If month is in the past relative to current, assume next year
              if (month < now.getMonth() + 1) {
                year++;
              }

              const d = new Date(year, month - 1, day, 0, 0, 0, 0);
              return d;
            };

            startDate = parseMonthDay(dates[0]);
            endDate = parseMonthDay(dates[dates.length - 1]);
            // Set end date to 8pm
            endDate.setHours(20, 0, 0, 0);
          } else if (dates.length === 1) {
            startDate = parseMonthDay(dates[0]);
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
            endDate.setHours(20, 0, 0, 0);
          } else {
            // Fallback: today and tomorrow
            startDate = new Date();
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
          }
        } else {
          // No date match: use today and tomorrow
          startDate = new Date();
          endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + 1);
        }

        // City and state from site
        const city = site.label.split(',')[0].trim();
        const state = site.state;

        // Address: use locationText or fallback
        const address = locationText || 'See listing for address';

        // Infer sale type from category and title
        let saleType = 'YARD'; // default
        if (category === 'est') {
          saleType = 'ESTATE';
        } else if (category === 'gms') {
          const titleLower = title.toLowerCase();
          if (titleLower.includes('yard') || titleLower.includes('garage')) {
            saleType = 'YARD';
          } else if (titleLower.includes('flea')) {
            saleType = 'FLEA_MARKET';
          }
        }

        // Create listing object
        const listing: ScrapedItem = {
          title,
          address,
          city,
          state,
          // zip is intentionally omitted (undefined) — Craigslist has no ZIP data
          startDate,
          endDate,
          description: 'Craigslist listing — see source URL for full details',
          sourceUrl,
          sourceName: 'Craigslist',
          sourceItemId: pid,
          scrapedMetadata: {
            category,
            subdomain: site.subdomain,
            locationRaw: locationText,
          },
          saleType,
        };

        listings.push(listing);
      } catch (err) {
        console.debug('[Craigslist] Failed to parse individual listing:', err);
      }
    });

    console.log(`[Craigslist] Parsed ${listings.length} listings from search page (${site.label}, ${category})`);
  } catch (err) {
    console.error('[Craigslist] Error parsing listing page:', err);
  }

  return listings;
}

/**
 * Scrape Craigslist items for a specific metro site.
 * Returns raw ScrapedItem[] without ingesting to database.
 * Used by GitHub Actions workflow (run-craigslist.ts).
 */
export async function scrapeCraigslistItems(
  site: CraigslistSite,
  rateLimiter: RateLimiter
): Promise<ScrapedItem[]> {
  const allItems: ScrapedItem[] = [];
  const seenPids = new Set<string>(); // Dedup within function by data-pid

  const categories = ['gms', 'est']; // gms = garage/moving sales, est = estate sales

  for (const category of categories) {
    try {
      const url = `https://${site.subdomain}.craigslist.org/search/${category}?sort=date`;

      await rateLimiter.waitBeforeRequest(site.subdomain);

      const html = await fetchHtml(url);
      if (!html) {
        console.warn(`[Craigslist] Failed to fetch ${site.label} (${category})`);
        continue;
      }

      const parsed = parseListingPage(html, site, category);

      // Deduplicate by sourceItemId
      for (const item of parsed) {
        if (item.sourceItemId && !seenPids.has(item.sourceItemId)) {
          seenPids.add(item.sourceItemId);
          allItems.push(item);
        }
      }

      console.log(`[Craigslist] ${site.label} (${category}): ${parsed.length} listings, ${allItems.length} total after dedup`);

      // Jitter between category requests
      await jitterDelay(400, 900);
    } catch (err) {
      console.error(`[Craigslist] Error scraping ${site.label} (${category}):`, err);
    }
  }

  return allItems;
}

/**
 * Scrape Craigslist for a metro and ingest into database.
 * Wrapper called by scraper/index.ts during cron jobs.
 */
export async function scrapeCraigslist(
  metro: string,
  organizerId: string,
  rateLimiter: RateLimiter
): Promise<{ created: number; updated: number; skipped: number; failed: number }> {
  const stats = { created: 0, updated: 0, skipped: 0, failed: 0 };

  // Extract subdomain from metro string: "grand-rapids-mi" → "grandrapids"
  const subdomain = metro.replace(/-[a-z]{2}$/, '').replace(/-/g, '');

  // Extract state: "grand-rapids-mi" → "MI"
  const stateMatch = metro.match(/-([a-z]{2})$/);
  const state = (stateMatch?.[1] ?? 'US').toUpperCase();

  // Construct site object
  const site: CraigslistSite = {
    subdomain,
    label: metro,
    state,
  };

  try {
    console.log(`[Craigslist] Starting scrape for ${metro} (${subdomain}, ${state})`);

    const items = await scrapeCraigslistItems(site, rateLimiter);
    console.log(`[Craigslist] Found ${items.length} items for ${metro}`);

    // Ingest each item
    for (const item of items) {
      const result = await ingestScrapedListing(item, organizerId);
      if (result.status === 'created') stats.created++;
      else if (result.status === 'updated') stats.updated++;
      else if (result.status === 'skipped') stats.skipped++;
      else stats.failed++;
    }

    console.log(`[Craigslist] ${metro} complete — created ${stats.created}, updated ${stats.updated}, skipped ${stats.skipped}, failed ${stats.failed}`);
    return stats;
  } catch (error) {
    console.error(`[Craigslist] Scrape failed for ${metro}:`, error);
    throw error;
  }
}
