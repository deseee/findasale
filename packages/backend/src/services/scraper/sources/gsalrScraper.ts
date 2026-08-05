/**
 * Gsalr.com scraper adapter
 * Plain HTTP fetch — site renders server-side HTML, no Puppeteer needed
 * ADR-2026-08-05: Directory Scraper — new free source (approved by findasale-architect,
 * see claude_docs/feature-notes/ADR-2026-08-05-scrapfly-eval-and-new-directory-sources.md)
 * robots.txt verified permissive for listing pages (checked live 2026-08-05 — only
 * /favorites, /dashboard, /neighborhood/manage, /pro-options disallowed, none of which
 * this scraper touches).
 */

/**
 * ENTITY TYPE: Consumer (homeowner yard/garage/estate sale posts)
 * Records from this source are NOT organizer businesses and are excluded from outreach.
 * Consumer sale data is retained for shopper-side discovery value only.
 * See: outreachEmailsCron.ts — directoryMostRecentSource filter (must include 'Gsalr').
 */
import * as cheerio from 'cheerio';
import { RateLimiter } from '../rateLimiter';
import { parseGsalrListing, extractEmails } from '../htmlParser';
import { ingestScrapedListing, flushFreshnessTouches, flushScraperRevalidation, ScrapedItem } from '../index';
import { getRandomUserAgent, jitterDelay } from '../userAgents';
import { safeFetch } from '../safeFetch';

const GSALR_BASE_URL = 'https://gsalr.com';
const GSALR_OWN_DOMAIN = 'gsalr.com';

/**
 * Convert metro slug to Gsalr URL.
 * Metro format: "grand-rapids-mi" → /garage-sales-grand-rapids-mi.html
 */
function metroToUrl(metro: string): string {
  return `${GSALR_BASE_URL}/garage-sales-${metro}.html`;
}

/**
 * Scrape Gsalr.com for a specific metro area.
 */
export async function scrapeGsalr(
  metro: string,
  organizerId: string,
  rateLimiter: RateLimiter
): Promise<{ created: number; updated: number; skipped: number; failed: number }> {
  const stats = { created: 0, updated: 0, skipped: 0, failed: 0 };

  try {
    await rateLimiter.loadRobotsTxt(GSALR_BASE_URL);

    const metroUrl = metroToUrl(metro);
    console.log(`[Gsalr] Fetching metro page: ${metroUrl}`);

    const domain = new URL(metroUrl).hostname;
    await rateLimiter.waitBeforeRequest(domain);

    if (!rateLimiter.isAllowed(metroUrl)) {
      console.warn(`[Gsalr] Robots.txt blocked: ${metroUrl}`);
      return stats;
    }

    const result = await safeFetch(metroUrl, {
      headers: { 'User-Agent': getRandomUserAgent() },
      requireProxy: true,
      timeoutMs: 20000,
    });

    if (result.status !== 'FETCHED') {
      console.warn(`[Gsalr] safeFetch ${result.status} for ${metroUrl} — skipping`);
      return stats;
    }
    const response = result.response!;

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        rateLimiter.recordBackoff(domain, retryAfter ? parseInt(retryAfter) : 60);
      }
      console.warn(`[Gsalr] Metro page returned ${response.status}: ${metroUrl}`);
      return stats;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Sale detail pages end in "-<numeric id>.html" (e.g. huge-yard-sale-2-grand-rapids-mi-38864103.html).
    // Metro/category listing pages have no trailing numeric segment — this pattern excludes them
    // without needing an explicit denylist of known listing-page slugs.
    const saleLinks: string[] = [];
    const seen = new Set<string>();

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      let fullUrl = href.startsWith('http') ? href : `${GSALR_BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
      // Strip query string (e.g. ?gallery=1) before matching/dedup — gallery variant of the
      // same listing should not be treated as a second sale.
      const withoutQuery = fullUrl.split('?')[0];
      if (
        /^https:\/\/gsalr\.com\/[a-z0-9-]+-\d{6,}\.html$/.test(withoutQuery) &&
        !seen.has(withoutQuery)
      ) {
        seen.add(withoutQuery);
        saleLinks.push(withoutQuery);
      }
    });

    console.log(`[Gsalr] Found ${saleLinks.length} sale links in ${metro}`);

    // Cap at 50 per metro per run — matches GarageSaleFinder's existing convention,
    // keeps per-run request volume bounded and predictable for a new, unproven source.
    for (const saleUrl of saleLinks.slice(0, 50)) {
      await jitterDelay(300, 1200);
      const item = await parseGsalrSale(saleUrl, rateLimiter);
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
    await flushFreshnessTouches();
    await flushScraperRevalidation();

    rateLimiter.clearBackoff(domain);
    return stats;
  } catch (error) {
    console.error(`[Gsalr] Scrape failed for ${metro}:`, error);
    throw error;
  }
}

/**
 * Parse a single Gsalr.com sale detail page.
 */
export async function parseGsalrSale(
  saleUrl: string,
  rateLimiter: RateLimiter
): Promise<ScrapedItem | null> {
  try {
    const domain = new URL(saleUrl).hostname;
    await rateLimiter.waitBeforeRequest(domain);

    if (!rateLimiter.isAllowed(saleUrl)) {
      console.warn(`[Gsalr] Robots.txt blocked: ${saleUrl}`);
      return null;
    }

    const result = await safeFetch(saleUrl, {
      headers: { 'User-Agent': getRandomUserAgent() },
      requireProxy: true,
      timeoutMs: 15000,
    });

    if (result.status !== 'FETCHED') {
      console.warn(`[Gsalr] safeFetch ${result.status} for ${saleUrl} — skipping`);
      return null;
    }
    const response = result.response!;

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        rateLimiter.recordBackoff(domain, retryAfter ? parseInt(retryAfter) : 60);
      }
      return null;
    }

    const html = await response.text();
    const parsed = parseGsalrListing(html);

    // address intentionally allowed empty — Gsalr hides street addresses on many listings
    // (same pattern as GarageSaleFinder). ingestScrapedListing handles empty addresses fine.
    if (!parsed || !parsed.title || !parsed.city || !parsed.state || !parsed.startDate || !parsed.endDate) {
      return null;
    }

    const emails = extractEmails(html);
    const idMatch = saleUrl.match(/-(\d{6,})\.html$/);
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
      // organizerName/organizerWebsite intentionally omitted — Gsalr consumer posts don't
      // reliably expose either, and GSALR_OWN_DOMAIN self-domain guard below matters only
      // if a future revision starts scraping an on-page "profile" link back to gsalr.com.
      photoUrls: parsed.photoUrls,
      sourceUrl: saleUrl,
      sourceName: 'Gsalr',
      sourceItemId: `${GSALR_OWN_DOMAIN}:${sourceItemId}`,
      scrapedMetadata: {
        emails,
        originalUrl: saleUrl,
      },
    };
  } catch (error) {
    console.error(`[Gsalr] Parse failed for ${saleUrl}:`, error);
    return null;
  }
}
