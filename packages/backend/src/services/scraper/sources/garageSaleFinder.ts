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
import { parseGarageSalesFinderListing, parseGarageSalesFinderGallery, extractEmails } from '../htmlParser';
import { ingestScrapedListing, flushFreshnessTouches, flushScraperRevalidation, ScrapedItem } from '../index';
import { getRandomUserAgent, jitterDelay } from '../userAgents';
import { safeFetch } from '../safeFetch';
import { prisma } from '../../../lib/prisma';

const GARAGE_SALES_BASE_URL = 'https://www.garagesalefinder.com';

// Sentry egress-rate-limit fix (host garagesalefinder.com exceeded 300 req/hr, 23+
// occurrences since 2026-07-19): scrapeGarageSaleFinder() previously fetched the full
// detail page (and gallery page, if photos exist) for every one of up to 50 sale links
// per metro on EVERY run, even when we already had a fresh, unchanged copy of that exact
// listing -- the only dedup logic (ingestScrapedListing -> checkDuplicate, dedupe.ts:124)
// runs AFTER the HTTP fetch already happened, so the egress cost was paid regardless of
// whether the fetch was needed. A full run is ~351 metros x up to ~101 requests/metro
// (detail + gallery), which mathematically cannot fit under the 300/hr cap no matter how
// the run is paced -- the fix is skipping known-fresh listings BEFORE the fetch, not
// spreading the run out more or raising the cap.
//
// 20 hours was chosen because this source's cron runs roughly once per day
// (sourceRegistry.ts cronSchedule: '0 6 * * *', i.e. once every 24h). 20h gives ~4h of
// headroom so a same-day manual/backfill re-run doesn't re-fetch a listing this cron
// already captured hours earlier, while still being short enough that a listing is never
// stale for more than one cron cycle -- a genuine price/photo/date change on GSF will be
// picked up on the very next daily run, not silently skipped for days. This trades a
// worst-case ~20h staleness window for eliminating the redundant-fetch volume that was
// actually causing the alert; it is not a cache-forever shortcut.
const FRESHNESS_WINDOW_MS = 20 * 60 * 60 * 1000; // 20 hours

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
): Promise<{ created: number; updated: number; skipped: number; failed: number; skippedFresh: number }> {
  const stats = { created: 0, updated: 0, skipped: 0, failed: 0, skippedFresh: 0 };

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

    const result = await safeFetch(metroUrl, {
      headers: { 'User-Agent': getRandomUserAgent() },
      requireProxy: true,
      timeoutMs: 20000,
    });

    if (result.status !== 'FETCHED') {
      console.warn(`[GarageSaleFinder] safeFetch ${result.status} for ${metroUrl} — skipping`);
      return stats;
    }
    const response = result.response!;

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

    // Build map of saleId → {galleryUrl, thumbnailUrl} from listing cards that have photos
    const galleryMap = new Map<string, { galleryUrl: string; thumbnailUrl: string }>();
    $('a[href*="/gallery"]').each((_, el) => {
      const galleryHref = $(el).attr('href') ?? '';
      const img = $(el).find('img[itemprop="image"]');
      const thumbSrc = img.attr('src');
      const idMatch = galleryHref.match(/\/s\/([A-Za-z0-9]+)\//);
      if (idMatch && thumbSrc && galleryHref.includes('/gallery')) {
        galleryMap.set(idMatch[1], { galleryUrl: galleryHref, thumbnailUrl: thumbSrc });
      }
    });

    console.log(`[GarageSaleFinder] Found ${galleryMap.size} listings with gallery photos in ${metro}`);

    // Extract sale detail links — GarageSaleFinder uses /s/[id] paths
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

    // Cap at 50 per metro per run
    const candidateUrls = saleLinks.slice(0, 50);

    // Pre-fetch freshness check (egress-rate-limit fix — see FRESHNESS_WINDOW_MS comment
    // above): one batched query for all candidate URLs in this metro instead of a
    // per-link query, so we trade zero extra network waste for a single cheap DB round
    // trip. checkDuplicate()'s primary (and, for this source, only effective — see below)
    // dedup tier is an exact Sale.sourceUrl match (dedupe.ts:132-144), and
    // parseGarageSalesFinderSale() always sets sourceUrl to the same saleUrl used here
    // (garageSaleFinder.ts:237), so sourceUrl is the correct, consistent key to freshness
    // -check against — it's the same field ingestScrapedListing already dedupes on.
    // (The sourceItemId tier at dedupe.ts:151-166 matches against scrapedMetadata's
    // top-level "sourceItemId" JSON key, which this source never actually writes into
    // scrapedMetadata — see the ScrapedItem returned by parseGarageSalesFinderSale below
    // — so it never fires for GarageSaleFinder rows; sourceUrl is the only tier that's
    // ever live for this source, matching this pre-check to real behavior.)
    // deletedAt/status are intentionally NOT filtered here: checkDuplicate's sourceUrl
    // tier (dedupe.ts:133-136) also does not filter by deletedAt/status — any existing
    // sourceUrl match already short-circuits ingestScrapedListing into a skip-and-touch,
    // never a revive or re-validation. Mirroring that here preserves identical behavior;
    // it does not skip anything that the post-fetch path would have handled differently.
    const existingFreshRows = candidateUrls.length
      ? await prisma.sale.findMany({
          where: { sourceUrl: { in: candidateUrls } },
          select: { sourceUrl: true, lastScrapedAt: true },
        })
      : [];
    const freshnessCutoff = Date.now() - FRESHNESS_WINDOW_MS;
    const freshSourceUrls = new Set(
      existingFreshRows
        .filter(row => row.sourceUrl && row.lastScrapedAt && row.lastScrapedAt.getTime() >= freshnessCutoff)
        .map(row => row.sourceUrl as string)
    );
    if (freshSourceUrls.size > 0) {
      console.log(`[GarageSaleFinder] ${freshSourceUrls.size}/${candidateUrls.length} sale link(s) in ${metro} already fresh (scraped within ${FRESHNESS_WINDOW_MS / 3600000}h) — skipping fetch`);
    }

    // Process each sale link
    for (const saleUrl of candidateUrls) {
      if (freshSourceUrls.has(saleUrl)) {
        stats.skippedFresh++;
        continue;
      }

      await jitterDelay(300, 1200);
      const idMatch = saleUrl.match(/\/s\/([A-Za-z0-9]+)\//);
      const saleId = idMatch ? idMatch[1] : '';
      const galleryInfo = galleryMap.get(saleId);
      const item = await parseGarageSalesFinderSale(saleUrl, rateLimiter, galleryInfo);
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

    console.log(`[GarageSaleFinder] ${metro} done — created=${stats.created} updated=${stats.updated} skipped=${stats.skipped} skippedFresh=${stats.skippedFresh} failed=${stats.failed}`);

    rateLimiter.clearBackoff(domain);
    return stats;
  } catch (error) {
    console.error(`[GarageSaleFinder] Scrape failed for ${metro}:`, error);
    throw error;
  }
}

/**
 * Parse a single GarageSaleFinder sale detail page.
 * If galleryInfo is provided, fetches the gallery page to extract full-size images.
 */
export async function parseGarageSalesFinderSale(
  saleUrl: string,
  rateLimiter: RateLimiter,
  galleryInfo?: { galleryUrl: string; thumbnailUrl: string }
): Promise<ScrapedItem | null> {
  try {
    const domain = new URL(saleUrl).hostname;
    await rateLimiter.waitBeforeRequest(domain);

    if (!rateLimiter.isAllowed(saleUrl)) {
      console.warn(`[GarageSaleFinder] Robots.txt blocked: ${saleUrl}`);
      return null;
    }

    const result = await safeFetch(saleUrl, {
      headers: { 'User-Agent': getRandomUserAgent() },
      requireProxy: true,
      timeoutMs: 15000,
    });

    if (result.status !== 'FETCHED') {
      console.warn(`[GarageSaleFinder] safeFetch ${result.status} for ${saleUrl} — skipping`);
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
    const parsed = parseGarageSalesFinderListing(html);

    // address and zip intentionally omitted — GSF hides street addresses on many
    // listings (empty string). ingestScrapedListing handles empty addresses fine.
    if (!parsed || !parsed.title || !parsed.city || !parsed.state || !parsed.startDate || !parsed.endDate) {
      return null;
    }

    // Attempt gallery photo fetch if galleryInfo was found on the metro page
    let galleryPhotos: string[] = [];
    if (galleryInfo) {
      try {
        const galleryUrl = galleryInfo.galleryUrl.startsWith('http')
          ? galleryInfo.galleryUrl
          : `${GARAGE_SALES_BASE_URL}${galleryInfo.galleryUrl}`;

        if (rateLimiter.isAllowed(galleryUrl)) {
          await jitterDelay(200, 800);
          await rateLimiter.waitBeforeRequest(domain);

          const galleryResult = await safeFetch(galleryUrl, {
            headers: { 'User-Agent': getRandomUserAgent() },
            requireProxy: true,
            timeoutMs: 10000,
          });

          if (galleryResult.status === 'FETCHED' && galleryResult.response!.ok) {
            const galleryHtml = await galleryResult.response!.text();
            galleryPhotos = parseGarageSalesFinderGallery(galleryHtml);
            console.log(`[GarageSaleFinder] Gallery fetched: ${galleryPhotos.length} photos from ${galleryUrl}`);
          }
        }
      } catch (galleryError) {
        // Gallery fetch failed — fall back gracefully to no photos
        console.warn(`[GarageSaleFinder] Gallery fetch failed for ${saleUrl}:`, galleryError);
      }
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
      photoUrls: galleryPhotos.length > 0 ? galleryPhotos : parsed.photoUrls,
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
