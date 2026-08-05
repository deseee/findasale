/**
 * YardSales.net scraper adapter
 * Plain HTTP fetch — site renders server-side HTML, no Puppeteer needed
 * ADR-2026-08-05: Directory Scraper — new free source (approved by findasale-architect,
 * see claude_docs/feature-notes/ADR-2026-08-05-scrapfly-eval-and-new-directory-sources.md)
 * robots.txt verified fully open (checked live 2026-08-05 — "Disallow:" blank).
 *
 * COVERAGE LIMITATION (verified, not assumed): unlike Gsalr/YardSaleSearch/GarageSaleFinder,
 * this site does NOT have a metro landing page for every U.S. metro — its homepage nav lists
 * only ~78 major-metro landing pages (see SUPPORTED_METROS below, scraped live 2026-08-05).
 * Blindly registering this as a full national metro-loop source (like the other new sources)
 * would mean requesting a metro page for ~2,000+ metros this site doesn't have every single
 * day — exactly the repeated-404-at-volume pattern that caused the bid13.com Railway abuse
 * complaint (S1133/S1134, 2026-07-17). To avoid repeating that, this scraper SKIPS any metro
 * not in the confirmed-supported allowlist with ZERO network requests — no fetch, no 404, no
 * wasted request against a site we don't yet have an established relationship with. This is
 * self-contained to this file; it does not touch the shared metro-loop orchestration.
 */

/**
 * ENTITY TYPE: Consumer (homeowner yard/garage/estate sale posts)
 * Records from this source are NOT organizer businesses and are excluded from outreach.
 * Consumer sale data is retained for shopper-side discovery value only.
 * See: outreachEmailsCron.ts — directoryMostRecentSource filter (must include 'YardSalesNet').
 */
import * as cheerio from 'cheerio';
import { RateLimiter } from '../rateLimiter';
import { parseYardSalesNetListing, extractEmails } from '../htmlParser';
import { ingestScrapedListing, flushFreshnessTouches, flushScraperRevalidation, ScrapedItem } from '../index';
import { getRandomUserAgent, jitterDelay } from '../userAgents';
import { safeFetch } from '../safeFetch';

const YARDSALES_NET_BASE_URL = 'https://yardsales.net';
const YARDSALES_NET_OWN_DOMAIN = 'yardsales.net';

/**
 * Confirmed-supported metro slugs, scraped live from yardsales.net's own homepage nav
 * (2026-08-05). Re-verify periodically — the site may add/remove metros over time.
 */
const SUPPORTED_METROS = new Set<string>([
  'arlington-tn', 'atlanta-ga', 'augusta-ga', 'austin-tx', 'bakersfield-ca', 'boise-id',
  'boston-ma', 'buffalo-ny', 'charlotte-nc', 'chesapeake-va', 'chicago-il', 'cincinnati-oh',
  'cleveland-oh', 'colorado-springs-co', 'columbia-sc', 'columbus-oh', 'dallas-tx',
  'denver-co', 'detroit-mi', 'eugene-or', 'evansville-in', 'fayetteville-nc',
  'fort-lauderdale-fl', 'fort-worth-tx', 'fresno-ca', 'greenville-nc', 'honolulu-hi',
  'houston-tx', 'huntsville-al', 'indianapolis-in', 'irvine-ca', 'jackson-ms',
  'jacksonville-ar', 'jacksonville-fl', 'kansas-city-mo', 'knoxville-tn', 'lancaster-pa',
  'las-vegas-nv', 'lexington-ma', 'los-angeles-ca', 'louisville-ky', 'madison-wi',
  'memphis-tn', 'miami-fl', 'milwaukee-wi', 'minneapolis-mn', 'montgomery-ny',
  'murfreesboro-tn', 'naples-fl', 'nashville-tn', 'new-york-ny', 'newark-de', 'orlando-fl',
  'philadelphia-pa', 'phoenix-az', 'pittsburgh-pa', 'portland-or', 'raleigh-nc', 'reno-nv',
  'richmond-va', 'riverside-ct', 'rochester-mn', 'rochester-ny', 'rock-hill-sc',
  'sacramento-ca', 'salem-or', 'salt-lake-city-ut', 'san-antonio-tx', 'san-diego-ca',
  'san-francisco-ca', 'seattle-wa', 'spokane-wa', 'springfield-ma', 'st-louis-mo',
  'tampa-fl', 'tucson-az', 'virginia-beach-va', 'washington-dc', 'west-palm-beach-fl',
  'wilmington-de', 'york-pa',
]);

function metroToUrl(metro: string): string {
  return `${YARDSALES_NET_BASE_URL}/${metro}/`;
}

/**
 * Scrape YardSales.net for a specific metro area. No-op (zero requests) for any metro
 * not in SUPPORTED_METROS — see the coverage-limitation note at the top of this file.
 */
export async function scrapeYardSalesNet(
  metro: string,
  organizerId: string,
  rateLimiter: RateLimiter
): Promise<{ created: number; updated: number; skipped: number; failed: number }> {
  const stats = { created: 0, updated: 0, skipped: 0, failed: 0 };

  if (!SUPPORTED_METROS.has(metro)) {
    // Not a network failure — this metro genuinely doesn't exist on the source site.
    // No log spam: this fires for the vast majority of the national metro list every run.
    return stats;
  }

  try {
    await rateLimiter.loadRobotsTxt(YARDSALES_NET_BASE_URL);

    const metroUrl = metroToUrl(metro);
    console.log(`[YardSalesNet] Fetching metro page: ${metroUrl}`);

    const domain = new URL(metroUrl).hostname;
    await rateLimiter.waitBeforeRequest(domain);

    if (!rateLimiter.isAllowed(metroUrl)) {
      console.warn(`[YardSalesNet] Robots.txt blocked: ${metroUrl}`);
      return stats;
    }

    const result = await safeFetch(metroUrl, {
      headers: { 'User-Agent': getRandomUserAgent() },
      requireProxy: true,
      timeoutMs: 20000,
    });

    if (result.status !== 'FETCHED') {
      console.warn(`[YardSalesNet] safeFetch ${result.status} for ${metroUrl} — skipping`);
      return stats;
    }
    const response = result.response!;

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        rateLimiter.recordBackoff(domain, retryAfter ? parseInt(retryAfter) : 60);
      }
      console.warn(`[YardSalesNet] Metro page returned ${response.status}: ${metroUrl}`);
      return stats;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const saleLinks: string[] = [];
    const seen = new Set<string>();

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      let fullUrl = href.startsWith('http') ? href : `${YARDSALES_NET_BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
      const withoutQuery = fullUrl.split('?')[0];
      // Sale detail pages: /s/<id> — exclude the /gallery sibling path.
      if (
        /^https:\/\/yardsales\.net\/s\/[A-Za-z0-9]+$/.test(withoutQuery) &&
        !seen.has(withoutQuery)
      ) {
        seen.add(withoutQuery);
        saleLinks.push(withoutQuery);
      }
    });

    console.log(`[YardSalesNet] Found ${saleLinks.length} sale links in ${metro}`);

    for (const saleUrl of saleLinks.slice(0, 50)) {
      await jitterDelay(300, 1200);
      const item = await parseYardSalesNetSale(saleUrl, rateLimiter);
      if (!item) {
        stats.failed++;
        continue;
      }

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
    console.error(`[YardSalesNet] Scrape failed for ${metro}:`, error);
    throw error;
  }
}

/**
 * Parse a single YardSales.net sale detail page.
 */
export async function parseYardSalesNetSale(
  saleUrl: string,
  rateLimiter: RateLimiter
): Promise<ScrapedItem | null> {
  try {
    const domain = new URL(saleUrl).hostname;
    await rateLimiter.waitBeforeRequest(domain);

    if (!rateLimiter.isAllowed(saleUrl)) {
      console.warn(`[YardSalesNet] Robots.txt blocked: ${saleUrl}`);
      return null;
    }

    const result = await safeFetch(saleUrl, {
      headers: { 'User-Agent': getRandomUserAgent() },
      requireProxy: true,
      timeoutMs: 15000,
    });

    if (result.status !== 'FETCHED') {
      console.warn(`[YardSalesNet] safeFetch ${result.status} for ${saleUrl} — skipping`);
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
    const parsed = parseYardSalesNetListing(html);

    if (!parsed || !parsed.title || !parsed.city || !parsed.state || !parsed.startDate || !parsed.endDate) {
      return null;
    }

    const emails = extractEmails(html);
    const idMatch = saleUrl.match(/\/s\/([A-Za-z0-9]+)$/);
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
      sourceUrl: saleUrl,
      sourceName: 'YardSalesNet',
      sourceItemId: `${YARDSALES_NET_OWN_DOMAIN}:${sourceItemId}`,
      scrapedMetadata: {
        emails,
        originalUrl: saleUrl,
      },
    };
  } catch (error) {
    console.error(`[YardSalesNet] Parse failed for ${saleUrl}:`, error);
    return null;
  }
}
