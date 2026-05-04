/**
 * Craigslist scraper adapter — RSS-based (bypasses WAF on datacenter IPs)
 * Uses ?format=rss feeds instead of HTML search pages
 * ADR-073: Directory Scraper Phase 2
 * D-073-A: "Beg forgiveness" stance — scrape without permission
 */

import * as cheerio from 'cheerio';
import { RateLimiter } from '../rateLimiter';
import { ingestScrapedListing, ScrapedItem } from '../index';
import { getRandomUserAgent, jitterDelay } from '../userAgents';
import { CraigslistSite } from '../craigslist-sites';

/**
 * Fetch RSS XML from URL
 */
async function fetchRss(url: string): Promise<string | null> {
  // Route through OpenRSS proxy to avoid datacenter IP blocks (Railway/GH Actions IPs are blocklisted by Craigslist)
  const proxyUrl = `https://openrss.org/${url}`;
  for (const attemptUrl of [proxyUrl, url]) {
    try {
      const res = await fetch(attemptUrl, {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        console.warn(`[Craigslist] HTTP ${res.status} for ${attemptUrl}`);
        continue;
      }
      return await res.text();
    } catch (err) {
      console.warn(`[Craigslist] Fetch error for ${attemptUrl}:`, err instanceof Error ? err.message : err);
    }
  }
  return null;
}

/**
 * Extract Craigslist post ID from URL
 * e.g. https://philadelphia.craigslist.org/gms/d/title/1234567890.html → "1234567890"
 */
function extractPidFromUrl(url: string): string | null {
  const match = url.match(/\/(\d+)\.html$/);
  return match ? match[1] : null;
}

/**
 * Extract a sale date from listing title or description text.
 * Looks for patterns like "May 3", "5/3", "Saturday May 3rd", etc.
 */
function extractSaleDateFromText(text: string): Date | null {
  const now = new Date();

  // Month name + day: "May 3", "May 3rd", "Saturday May 3"
  const monthNameMatch = text.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i
  );
  if (monthNameMatch) {
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthIdx = monthNames.findIndex((m) => monthNameMatch[1].toLowerCase().startsWith(m));
    if (monthIdx >= 0) {
      const day = parseInt(monthNameMatch[2], 10);
      const candidate = new Date(now.getFullYear(), monthIdx, day);
      if (candidate < now) candidate.setFullYear(candidate.getFullYear() + 1);
      return candidate;
    }
  }

  // Slash date: M/D or M/D/YY or M/D/YYYY
  const slashMatch = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashMatch) {
    const month = parseInt(slashMatch[1], 10);
    const day = parseInt(slashMatch[2], 10);
    let year = slashMatch[3] ? parseInt(slashMatch[3], 10) : now.getFullYear();
    if (year < 100) year += year < 50 ? 2000 : 1900;
    const candidate = new Date(year, month - 1, day);
    if (candidate < now) candidate.setFullYear(candidate.getFullYear() + 1);
    return candidate;
  }

  return null;
}

/**
 * Infer sale type from title/description keywords
 */
function inferSaleType(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('auction')) return 'AUCTION';
  if (lower.includes('estate')) return 'ESTATE';
  if (lower.includes('flea market') || lower.includes('flea mkt')) return 'FLEA_MARKET';
  return 'YARD';
}

/**
 * Parse Craigslist RSS feed XML into ScrapedItems
 */
function parseRssFeed(xml: string, site: CraigslistSite, category: string): ScrapedItem[] {
  const listings: ScrapedItem[] = [];

  try {
    const $ = cheerio.load(xml, { xmlMode: true });
    const city = site.label.split(',')[0].trim();
    const state = site.state;

    $('item').each((_, el) => {
      try {
        const title = $('title', el).text().trim();
        const link = $('link', el).text().trim();
        const descriptionRaw = $('description', el).text().trim();
        const pubDateStr = $('pubDate', el).text().trim() || $('dc\\:date', el).text().trim();

        if (!title || !link) return;

        // Extract PID from URL for dedup
        const pid = extractPidFromUrl(link);
        if (!pid) return;

        // Strip HTML from description
        const description = descriptionRaw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const fullText = `${title} ${description}`;

        // Parse start date from title/description, fallback to pubDate, fallback to today
        let startDate = extractSaleDateFromText(fullText);
        if (!startDate && pubDateStr) {
          const pub = new Date(pubDateStr);
          if (!isNaN(pub.getTime())) startDate = pub;
        }
        if (!startDate) startDate = new Date();

        // End date: start + 1 day at 5pm
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
        endDate.setHours(17, 0, 0, 0);

        listings.push({
          title,
          address: 'See listing for address',
          city,
          state,
          // zip intentionally omitted — Craigslist RSS has no ZIP data
          startDate,
          endDate,
          description: description.slice(0, 300) || 'Craigslist listing — see source URL for details',
          sourceUrl: link,
          sourceName: 'Craigslist',
          sourceItemId: `cl:${pid}`,
          scrapedMetadata: { category, subdomain: site.subdomain },
          saleType: inferSaleType(fullText),
        });
      } catch (err) {
        console.debug('[Craigslist] Failed to parse RSS item:', err);
      }
    });

    console.log(`[Craigslist] Parsed ${listings.length} listings from RSS (${site.label}, ${category})`);
  } catch (err) {
    console.error('[Craigslist] Error parsing RSS feed:', err);
  }

  return listings;
}

/**
 * Scrape Craigslist items for a specific metro site via RSS feed.
 * Returns raw ScrapedItem[] without ingesting to database.
 * Used by GitHub Actions workflow (run-craigslist.ts).
 */
export async function scrapeCraigslistItems(
  site: CraigslistSite,
  rateLimiter: RateLimiter
): Promise<ScrapedItem[]> {
  const allItems: ScrapedItem[] = [];
  const seenPids = new Set<string>();

  const categories = ['gms', 'est']; // gms = garage/moving sales, est = estate sales

  for (const category of categories) {
    try {
      // RSS feed URL — bypasses WAF that blocks HTML search pages from datacenter IPs
      const url = `https://${site.subdomain}.craigslist.org/search/${category}?format=rss`;

      await rateLimiter.waitBeforeRequest(site.subdomain);

      const xml = await fetchRss(url);
      if (!xml) {
        console.warn(`[Craigslist] Failed to fetch RSS for ${site.label} (${category})`);
        continue;
      }

      const parsed = parseRssFeed(xml, site, category);

      for (const item of parsed) {
        if (item.sourceItemId && !seenPids.has(item.sourceItemId)) {
          seenPids.add(item.sourceItemId);
          allItems.push(item);
        }
      }

      console.log(`[Craigslist] ${site.label} (${category}): ${parsed.length} listings, ${allItems.length} total after dedup`);
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

  const subdomain = metro.replace(/-[a-z]{2}$/, '').replace(/-/g, '');
  const stateMatch = metro.match(/-([a-z]{2})$/);
  const state = (stateMatch?.[1] ?? 'US').toUpperCase();
  const site: CraigslistSite = { subdomain, label: metro, state };

  try {
    const items = await scrapeCraigslistItems(site, rateLimiter);
    for (const item of items) {
      const result = await ingestScrapedListing(item, organizerId);
      if (result.status === 'created') stats.created++;
      else if (result.status === 'updated') stats.updated++;
      else if (result.status === 'skipped') stats.skipped++;
      else stats.failed++;
    }
    return stats;
  } catch (error) {
    console.error(`[Craigslist] Scrape failed for ${metro}:`, error);
    throw error;
  }
}
