/**
 * EstateSales.NET scraper adapter
 * Scrapes estate sales from estatesales.net using Puppeteer (JS-heavy site)
 * ADR-073: Directory Scraper Phase 1
 */

import puppeteer, { type Browser } from 'puppeteer';
import { RateLimiter } from '../rateLimiter';
import { parseEstateSalesNetListing, extractEmails } from '../htmlParser';
import { ingestScrapedListing, ScrapedItem } from '../index';

const ESTATESALES_BASE_URL = 'https://www.estatesales.net';
const USER_AGENT = 'FindASaleBot/1.0 (+https://finda.sale/bot)';

/**
 * Convert a metro string like "grand-rapids-mi" into a city URL path.
 * Metro format: "[city-slug]-[state]" e.g. "grand-rapids-mi"
 * EstateSales.NET URL: /MI/Grand-Rapids
 */
function metroToUrl(metro: string): string {
  // Format: "grand-rapids-mi" → state = "mi", city = "Grand-Rapids"
  const parts = metro.split('-');
  const state = parts[parts.length - 1].toUpperCase();
  const citySlug = parts.slice(0, -1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('-');
  return `${ESTATESALES_BASE_URL}/${state}/${citySlug}`;
}

/**
 * Scrape EstateSales.NET for a specific metro area.
 * Uses Puppeteer because the site requires JS to render sale cards.
 */
export async function scrapeEstateSalesNet(
  metro: string,
  organizerId: string,
  rateLimiter: RateLimiter
): Promise<{ created: number; updated: number; skipped: number; failed: number }> {
  let browser: Browser | null = null;
  const stats = { created: 0, updated: 0, skipped: 0, failed: 0 };

  try {
    await rateLimiter.loadRobotsTxt(ESTATESALES_BASE_URL);

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const metroUrl = metroToUrl(metro);
    console.log(`[EstateSalesNet] Fetching metro page: ${metroUrl}`);

    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);

    // Navigate to metro listing page
    const response = await page.goto(metroUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    if (!response || response.status() === 404) {
      console.warn(`[EstateSalesNet] Metro page not found: ${metroUrl}`);
      return stats;
    }

    // Wait for sale cards to render
    await page.waitForSelector('a[href*="/sales/"]', { timeout: 10000 }).catch(() => {
      console.warn(`[EstateSalesNet] No sale links found on ${metroUrl}`);
    });

    // Extract all sale detail URLs from the listing page
    const saleLinks: string[] = await page.evaluate((baseUrl) => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const seen = new Set<string>();
      const links: string[] = [];
      for (const a of anchors) {
        const href = (a as HTMLAnchorElement).href;
        // Match sale detail URLs: /XX/City/some-sale-slug/12345
        if (
          href &&
          href.startsWith(baseUrl) &&
          /\/[A-Z]{2}\/[^/]+\/[^/]+-\d+\/?$/.test(href) &&
          !seen.has(href)
        ) {
          seen.add(href);
          links.push(href);
        }
      }
      return links.slice(0, 50); // Cap at 50 per metro per run
    }, ESTATESALES_BASE_URL);

    console.log(`[EstateSalesNet] Found ${saleLinks.length} sale links in ${metro}`);

    await page.close();

    // Process each sale link
    for (const saleUrl of saleLinks) {
      const item = await parseEstateSalesNetSale(saleUrl, rateLimiter);
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

    return stats;
  } catch (error) {
    console.error(`[EstateSalesNet] Scrape failed for ${metro}:`, error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Parse a single EstateSales.NET sale detail page using plain fetch.
 * The listing page uses Puppeteer; individual detail pages are static enough for fetch.
 */
export async function parseEstateSalesNetSale(
  saleUrl: string,
  rateLimiter: RateLimiter
): Promise<ScrapedItem | null> {
  try {
    const domain = new URL(saleUrl).hostname;
    await rateLimiter.waitBeforeRequest(domain);

    if (!rateLimiter.isAllowed(saleUrl)) {
      console.warn(`[EstateSalesNet] Robots.txt blocked: ${saleUrl}`);
      return null;
    }

    const response = await fetch(saleUrl, {
      headers: { 'User-Agent': USER_AGENT },
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
    const parsed = parseEstateSalesNetListing(html);

    if (!parsed || !parsed.title || !parsed.address || !parsed.city || !parsed.state || !parsed.zip || !parsed.startDate || !parsed.endDate) {
      return null;
    }

    const emails = extractEmails(html);
    // Extract numeric sale ID from URL tail e.g. /TX/Austin/jones-estate-12345 → "12345"
    const idMatch = saleUrl.match(/-(\d+)\/?$/);
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
      saleType: parsed.saleType ?? 'ESTATE',
      organizerName: parsed.organizerName,
      organizerEmail: parsed.organizerEmail,
      photoUrls: parsed.photoUrls,
      sourceUrl: saleUrl,
      sourceName: 'EstateSalesNet',
      sourceItemId: `estatesales.net:${sourceItemId}`,
      scrapedMetadata: {
        emails,
        originalUrl: saleUrl,
      },
    };
  } catch (error) {
    console.error(`[EstateSalesNet] Parse failed for ${saleUrl}:`, error);
    return null;
  }
}
