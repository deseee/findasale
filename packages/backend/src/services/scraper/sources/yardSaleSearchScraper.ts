/**
 * YardSaleSearch.com scraper adapter
 * Plain HTTP fetch — site renders server-side HTML, no Puppeteer needed
 * ADR-2026-08-05: Directory Scraper — new free source (approved by findasale-architect,
 * see claude_docs/feature-notes/ADR-2026-08-05-scrapfly-eval-and-new-directory-sources.md)
 * robots.txt verified permissive for listing pages (checked live 2026-08-05 — only
 * jsp utility/admin pages disallowed, none of which this scraper touches).
 *
 * UNLIKE Gsalr/GarageSaleFinder: this site embeds full structured data for every sale
 * directly on the metro listing page (schema.org Event microdata), so only ONE fetch per
 * metro is needed — no separate per-sale detail-page requests. Lower request volume than
 * the other two new sources by design.
 */

/**
 * ENTITY TYPE: Consumer (homeowner yard/garage/estate sale posts)
 * Records from this source are NOT organizer businesses and are excluded from outreach.
 * Consumer sale data is retained for shopper-side discovery value only.
 * See: outreachEmailsCron.ts — directoryMostRecentSource filter (must include 'YardSaleSearch').
 */
import { parseYardSaleSearchMetroPage, extractEmails } from '../htmlParser';
import { ingestScrapedListing, flushFreshnessTouches, flushScraperRevalidation, ScrapedItem } from '../index';
import { RateLimiter } from '../rateLimiter';
import { getRandomUserAgent } from '../userAgents';
import { safeFetch } from '../safeFetch';

const YSS_BASE_URL = 'https://www.yardsalesearch.com';
const YSS_OWN_DOMAIN = 'yardsalesearch.com';

/**
 * Convert metro slug to YardSaleSearch URL.
 * Metro format: "grand-rapids-mi" → /garage-sales-grand-rapids-mi.html
 */
function metroToUrl(metro: string): string {
  return `${YSS_BASE_URL}/garage-sales-${metro}.html`;
}

/**
 * Scrape YardSaleSearch.com for a specific metro area.
 * Single fetch — all listing data is embedded on the metro page itself.
 */
export async function scrapeYardSaleSearch(
  metro: string,
  organizerId: string,
  rateLimiter: RateLimiter
): Promise<{ created: number; updated: number; skipped: number; failed: number }> {
  const stats = { created: 0, updated: 0, skipped: 0, failed: 0 };

  try {
    await rateLimiter.loadRobotsTxt(YSS_BASE_URL);

    const metroUrl = metroToUrl(metro);
    console.log(`[YardSaleSearch] Fetching metro page: ${metroUrl}`);

    const domain = new URL(metroUrl).hostname;
    await rateLimiter.waitBeforeRequest(domain);

    if (!rateLimiter.isAllowed(metroUrl)) {
      console.warn(`[YardSaleSearch] Robots.txt blocked: ${metroUrl}`);
      return stats;
    }

    const result = await safeFetch(metroUrl, {
      headers: { 'User-Agent': getRandomUserAgent() },
      requireProxy: true,
      timeoutMs: 20000,
    });

    if (result.status !== 'FETCHED') {
      console.warn(`[YardSaleSearch] safeFetch ${result.status} for ${metroUrl} — skipping`);
      return stats;
    }
    const response = result.response!;

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        rateLimiter.recordBackoff(domain, retryAfter ? parseInt(retryAfter) : 60);
      }
      console.warn(`[YardSaleSearch] Metro page returned ${response.status}: ${metroUrl}`);
      return stats;
    }

    const html = await response.text();
    const entries = parseYardSaleSearchMetroPage(html);
    console.log(`[YardSaleSearch] Found ${entries.length} sales embedded in ${metro} metro page`);

    for (const entry of entries.slice(0, 50)) {
      if (!entry.title || !entry.city || !entry.state || !entry.startDate || !entry.endDate) {
        stats.failed++;
        continue;
      }

      const sourceUrl = `${YSS_BASE_URL}/yss-garage-sale.jsp?id=${entry.sourceItemId}`;
      const emails = extractEmails(html);

      const item: ScrapedItem = {
        title: entry.title,
        address: entry.address ?? '',
        city: entry.city,
        state: entry.state,
        zip: entry.zip,
        startDate: entry.startDate,
        endDate: entry.endDate,
        description: entry.description,
        saleType: entry.saleType ?? 'YARD',
        sourceUrl,
        sourceName: 'YardSaleSearch',
        sourceItemId: `${YSS_OWN_DOMAIN}:${entry.sourceItemId}`,
        scrapedMetadata: {
          emails,
          originalUrl: sourceUrl,
        },
      };

      const ingestResult = await ingestScrapedListing(item, organizerId);
      if (ingestResult.status === 'created') stats.created++;
      else if (ingestResult.status === 'updated') stats.updated++;
      else if (ingestResult.status === 'skipped') stats.skipped++;
      else stats.failed++;
    }
    await flushFreshnessTouches();
    await flushScraperRevalidation();

    rateLimiter.clearBackoff(domain);
    return stats;
  } catch (error) {
    console.error(`[YardSaleSearch] Scrape failed for ${metro}:`, error);
    throw error;
  }
}
