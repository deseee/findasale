/**
 * GarageSaleFinder.com scraper adapter
 * Plain HTTP fetch — site renders server-side HTML, no Puppeteer needed
 * ADR-073: Directory Scraper Phase 1
 */

/**
 * ENTITY TYPE: Consumer (homeowner yard sale posts)
 * Records from this source are NOT organizer businesses and are excluded from outreach.
 * Consumer sale data is retained for shopper-side discovery value only.
 * See: outreachEmailsCron.ts — directoryMostRecentSource filter.
 */
import * as cheerio from 'cheerio';
import { RateLimiter } from '../rateLimiter';
import { parseGarageSalesFinderListing, extractEmails } from '../htmlParser';
import { ingestScrapedListing, ScrapedItem } from '../index';
import { getRandomUserAgent, jitterDelay } from '../userAgents';

const GARAGE_SALES_BASE_URL = 'https://www.garagesalefinder.com';

/**
 * Convert metro slug to GarageSaleFinder URL.
 * Metro format: "grand-rapids-mi" → /yard-sales/grand-rapids-mi/
 */
function metroToUrl(metro: string): string {
  return `${GARAGE_SALES_BASE_URL}/yard-sales/${metro}/`;
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
      // Match detail pages: /s/[alphanumeric]/ — exclude /gallery paths
      if (
        /\/s\/[A-Za-z0-9]+\//.test(fullUrl) &&
        !fullUrl.includes('/gallery') &&
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

    // address and zip intentionally omitted — GSF hides street addresses on many
    // listings (empty string). ingestScrapedListing handles empty addresses fine.
    if (!parsed || !parsed.title || !parsed.city || !parsed.state || !parsed.startDate || !parsed.endDate) {
      return null;
    }

    const emails = extractEmails(html);
    const idMatch = saleUrl.match(/\/s\/([A-Za-z0-9]+)\//);
    const sourceItemId = idMatch ? idMatch[1] : saleUrl.split('/').pop() ?? '';

    rateLimiter.clearBackoff(domain);

    return {
      title: parsed.title,
      address: parsed.address ?? '',
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
