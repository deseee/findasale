/**
 * GarageSaleFinder.com scraper adapter
 * Plain HTTP fetch — site renders server-side HTML, no Puppeteer needed
 * ADR-073: Directory Scraper Phase 1
 */

import * as cheerio from 'cheerio';
import { RateLimiter } from '../rateLimiter';
import { parseGarageSalesFinderListing, extractEmails } from '../htmlParser';
import { ingestScrapedListing, ScrapedItem } from '../index';
import { getRandomUserAgent, jitterDelay } from '../userAgents';

const GARAGE_SALES_BASE_URL = 'https://www.garagesalefinder.com';

/**
 * Convert metro slug to GarageSaleFinder URL.
 * Metro format: "grand-rapids-mi" → /garage-sales/US/MI/Grand+Rapids
 */
function metroToUrl(metro: string): string {
  const parts = metro.split('-');
  const state = parts[parts.length - 1].toUpperCase();
  const cityWords = parts.slice(0, -1).map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  const cityEncoded = cityWords.join('+');
  return `${GARAGE_SALES_BASE_URL}/garage-sales/US/${state}/${cityEncoded}`;
}

/**
 * Scrape GarageSaleFinder for a specific metro area.
 */
export async function scrapeGarageSaleFinder(
  metro: string,
  organizerId: string,
  rateLimiter: RateLimiter
): Promise<{ created: number; updated: number; skipped: number; failed: number }> {
  const stats = { created: 0, updated: 0, skipped: 0, failed: 0 };

  try {
    await rateLimiter.loadRobotsTxt(GARAGE_SALES_BASE_URL);

    const metroUrl = metroToUrl(metro);
    console.log(`[GarageSaleFinder] Fetching metro page: ${metroUrl}`);

    const domain = new URL(metroUrl).hostname;
    await rateLimiter.waitBeforeRequest(domain);

    if (!rateLimiter.isAllowed(metroUrl)) {
      console.warn(`[GarageSaleFinder] Robots.txt blocked: ${metroUrl}`);
      return stats;
    }

    const response = await fetch(metroUrl, {
      headers: { 'User-Agent': getRandomUserAgent() },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        rateLimiter.recordBackoff(domain, retryAfter ? parseInt(retryAfter) : 60);
      }
      console.warn(`[GarageSaleFinder] Metro page returned ${response.status}: ${metroUrl}`);
      return stats;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract sale detail links — GarageSaleFinder uses /garage-sales/[id] paths
    const saleLinks: string[] = [];
    const seen = new Set<string>();

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      let fullUrl = href.startsWith('http') ? href : `${GARAGE_SALES_BASE_URL}${href}`;
      // Match detail pages: /garage-sales/12345 or similar numeric paths
      if (
        /\/garage-sales\/\d+/.test(fullUrl) &&
        !seen.has(fullUrl)
      ) {
        seen.add(fullUrl);
        saleLinks.push(fullUrl);
      }
    });

    console.log(`[GarageSaleFinder] Found ${saleLinks.length} sale links in ${metro}`);

    // Process each sale link (cap at 50 per metro per run)
    for (const saleUrl of saleLinks.slice(0, 50)) {
      await jitterDelay(300, 1200);
      const item = await parseGarageSalesFinderSale(saleUrl, rateLimiter);
      if (!item) {
        stats.failed++;
        continue;
      }

      const result = await ingestScrapedListing(item, organizerId);
      if (result.status === 'created') stats.created++;
      else if (result.status === 'updated') stats.updated++;
      else if (result.status === 'skipped') stats.skipped++;
      else stats.failed++;
    }

    rateLimiter.clearBackoff(domain);
    return stats;
  } catch (error) {
    console.error(`[GarageSaleFinder] Scrape failed for ${metro}:`, error);
    throw error;
  }
}

/**
 * Parse a single GarageSaleFinder sale detail page.
 */
export async function parseGarageSalesFinderSale(
  saleUrl: string,
  rateLimiter: RateLimiter
): Promise<ScrapedItem | null> {
  try {
    const domain = new URL(saleUrl).hostname;
    await rateLimiter.waitBeforeRequest(domain);

    if (!rateLimiter.isAllowed(saleUrl)) {
      console.warn(`[GarageSaleFinder] Robots.txt blocked: ${saleUrl}`);
      return null;
    }

    const response = await fetch(saleUrl, {
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
    const parsed = parseGarageSalesFinderListing(html);

    if (!parsed || !parsed.title || !parsed.address || !parsed.city || !parsed.state || !parsed.zip || !parsed.startDate || !parsed.endDate) {
      return null;
    }

    const emails = extractEmails(html);
    const idMatch = saleUrl.match(/\/garage-sales\/(\d+)/);
    const sourceItemId = idMatch ? idMatch[1] : saleUrl.split('/').pop() ?? '';

    rateLimiter.clearBackoff(domain);

    return {
      title: parsed.title,
      address: parsed.address,
      city: parsed.city,
      state: parsed.state,
      zip: parsed.zip,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      description: parsed.description,
      saleType: parsed.saleType ?? 'YARD',
      organizerName: parsed.organizerName,
      organizerEmail: parsed.organizerEmail,
      photoUrls: parsed.photoUrls,
      sourceUrl: saleUrl,
      sourceName: 'GarageSaleFinder',
      sourceItemId: `garagesalefinder.com:${sourceItemId}`,
      scrapedMetadata: {
        emails,
        originalUrl: saleUrl,
      },
    };
  } catch (error) {
    console.error(`[GarageSaleFinder] Parse failed for ${saleUrl}:`, error);
    return null;
  }
}
