/**
 * Newspaper RSS Feed Scraper
 * Parses Oodle and Google News RSS feeds for garage/estate/yard sales
 * ADR-077: Classified RSS scraper — standalone GH Actions adapter
 */

import * as cheerio from 'cheerio';
import { RateLimiter } from '../rateLimiter';
import { ScrapedItem } from '../index';
import { getRandomUserAgent } from '../userAgents';
import { RssFeed } from '../newspaper-feeds';

/**
 * Fetch RSS feed XML with error handling
 */
async function fetchRss(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': getRandomUserAgent() },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`[RssFeed] HTTP ${res.status} for ${url}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.warn(`[RssFeed] Fetch error for ${url}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Strip HTML tags from text
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extract first address-like pattern from text
 */
function extractAddress(text: string): string | undefined {
  // Pattern: "123 Main St, City, State" or similar
  const addressMatch = text.match(/(\d+\s+[A-Za-z]+\s+(?:St|Ave|Rd|Dr|Blvd|Ln|Way|Ct|Pl)[\w\s,]*)/i);
  if (addressMatch) {
    return addressMatch[1].trim();
  }
  return undefined;
}

/**
 * Parse a date string in various formats: M/D/YYYY, M/D/YY, M/D, etc.
 */
function parseDate(dateStr: string, fallbackDate?: Date): Date | undefined {
  if (!dateStr || !dateStr.trim()) {
    return fallbackDate;
  }

  // Try standard date parsing
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return d;
  }

  // Try regex patterns: M/D or M/D/YY or M/D/YYYY
  const match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (match) {
    const month = parseInt(match[1], 10);
    const day = parseInt(match[2], 10);
    let year = match[3] ? parseInt(match[3], 10) : new Date().getFullYear();

    // Adjust 2-digit year to 4-digit
    if (year < 100) {
      year += year < 50 ? 2000 : 1900;
    }

    // If the month is in the past relative to today, bump to next year
    const now = new Date();
    const testDate = new Date(year, month - 1, day);
    if (testDate < now) {
      testDate.setFullYear(year + 1);
    }

    return testDate;
  }

  return fallbackDate;
}

/**
 * Determine saleType from title/description keywords
 */
function determineSaleType(text: string): 'ESTATE' | 'AUCTION' | 'YARD' {
  const lower = (text || '').toLowerCase();

  // Auction takes precedence
  if (lower.includes('auction')) {
    return 'AUCTION';
  }

  if (lower.includes('estate')) {
    return 'ESTATE';
  }

  // Yard/Garage/Moving/Rummage/Tag/Moving
  if (
    lower.includes('yard') ||
    lower.includes('garage') ||
    lower.includes('moving') ||
    lower.includes('rummage') ||
    lower.includes('tag sale')
  ) {
    return 'YARD';
  }

  // Default
  return 'YARD';
}

/**
 * Check if item matches yard/estate/garage/auction keywords
 */
function passesKeywordFilter(title: string, description: string): boolean {
  const combined = `${title} ${description}`.toLowerCase();
  const keywords = [
    'estate sale',
    'yard sale',
    'garage sale',
    'moving sale',
    'tag sale',
    'rummage sale',
    'estate auction',
  ];

  return keywords.some((kw) => combined.includes(kw));
}

/**
 * Main RSS feed scraper
 */
export async function scrapeRssFeed(feed: RssFeed, rateLimiter: RateLimiter): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];

  // Rate limit before fetch
  const domain = new URL(feed.url).hostname;
  await rateLimiter.waitBeforeRequest(domain);

  const xml = await fetchRss(feed.url);
  if (!xml) {
    console.log(`[RssFeed] No content from ${feed.name}`);
    return items;
  }

  try {
    // Parse XML in XML mode (not HTML)
    const $ = cheerio.load(xml, { xmlMode: true });

    $('item').each((_, el) => {
      try {
        // Extract basic RSS fields
        const title = $('title', el).text().trim();
        const descriptionRaw = $('description', el).text().trim();
        const description = stripHtml(descriptionRaw);
        const link = $('link', el).text().trim() || $(el).find('link').attr('href') || '';
        const pubDateStr = $('pubDate', el).text().trim();
        const guid = $('guid', el).text().trim();

        // Validate required fields
        if (!title || !link) {
          return;
        }

        // Keyword filter — skip if doesn't match sale types
        if (!passesKeywordFilter(title, description)) {
          return;
        }

        // Parse dates
        const pubDate = parseDate(pubDateStr);
        const startDate = pubDate || new Date();

        // For end date, try extracting a date range from description, or default to +1 day
        let endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
        endDate.setHours(17, 0, 0, 0); // Default to 5pm

        // Try to extract a second date if present in description
        const dateMatch = description.match(/(\d{1,2})[\/\-](\d{1,2})/g);
        if (dateMatch && dateMatch.length > 1) {
          const endDateParsed = parseDate(dateMatch[1]);
          if (endDateParsed) {
            endDate = endDateParsed;
            endDate.setHours(17, 0, 0, 0);
          }
        }

        // Extract address
        const address = extractAddress(description) || 'See listing for address';

        // Determine sale type
        const saleType = determineSaleType(`${title} ${description}`);

        // Build ScrapedItem
        const item: ScrapedItem = {
          title,
          address,
          city: feed.city,
          state: feed.state,
          zip: undefined,
          startDate,
          endDate,
          description: description.slice(0, 300),
          sourceUrl: link,
          sourceName: 'ClassifiedRSS',
          sourceItemId: guid || link,
          scrapedMetadata: {
            feedName: feed.name,
            feedUrl: feed.url,
            category: feed.category,
          },
          saleType,
        };

        items.push(item);
      } catch (itemError) {
        console.warn('[RssFeed] Error parsing item:', itemError instanceof Error ? itemError.message : itemError);
      }
    });

    console.log(`[RssFeed] ${feed.name}: extracted ${items.length} items`);
    return items;
  } catch (error) {
    console.error(`[RssFeed] Parse error for ${feed.name}:`, error instanceof Error ? error.message : error);
    return items;
  }
}
