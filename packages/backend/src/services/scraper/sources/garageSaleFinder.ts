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
import { parseGarageSalesFinderListingWithReason, gsfFullSizePhotoUrl, extractEmails } from '../htmlParser';
import { ingestScrapedListing, flushFreshnessTouches, flushScraperRevalidation, ScrapedItem } from '../index';
import { getRandomUserAgent } from '../userAgents';
import { safeFetch, getHostCapPerHour } from '../safeFetch';
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

// Per-metro breaker (2026-10-30). The domain-wide DomainFetchState row is shared by all
// 351 metros; every safeFetch here now uses breakerPolicy 'tolerant' scoped to the metro
// (see safeFetch.ts TOLERANT POLICY), so one bad page or our own hourly cap no longer
// cools the whole domain down. Inside a metro, this many CONSECUTIVE fetch failures
// (non-2xx, network error) end that metro only; the next metro starts fresh. A skip by
// the domain breaker or the hourly cap ends the metro at once (every further request in
// it would be skipped the same way).
export const METRO_MAX_CONSECUTIVE_FETCH_FAILURES = 5;

/** Per-metro result. stoppedEarly is set when the metro was not fully looked at. */
export interface GsfMetroStats {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  skippedFresh: number;
  /** e.g. 'skipped_cap', 'skipped_breaker', 'fetch_failure_streak', 'metro_http_429'. */
  stoppedEarly?: string;
}

/** Why one sale detail page produced no item (diagnostics + per-metro breaker). */
export type GsfDetailReason =
  | 'robots'
  | 'skipped_breaker'
  | 'skipped_cap'
  | 'skipped_no_proxy'
  | 'http_error'
  | 'network_error'
  | string; // parse_<reason> from parseGarageSalesFinderListingWithReason

/** Fetch-level failures count toward the per-metro breaker; parse failures do not. */
export function isFetchFailureReason(reason: string | undefined): boolean {
  return reason === 'http_error' || reason === 'network_error';
}

/** Reasons after which every further request in this metro would be skipped the same way. */
export function isMetroStopReason(reason: string | undefined): boolean {
  return reason === 'skipped_breaker' || reason === 'skipped_cap' || reason === 'skipped_no_proxy';
}

// ---------------------------------------------------------------------------
// PACING (2026-11-01)
// ---------------------------------------------------------------------------
// The 11-01 06:00 run spent the whole 300/hr budget for garagesalefinder.com in under six
// minutes (New York, Philadelphia and Boston alone), then every later metro hit SKIPPED_CAP:
// 236 metros logged {"skipped_cap":1} and 51 more never got their metro page. Bursting the
// budget and idling for the rest of the hour is also the least polite shape for the site.
// Every GSF request (metro page and sale page) now waits for this process-wide pacer, which
// spaces requests evenly so a full hour stays under 90% of the cap (default 3,600,000 ms /
// 270 = one request every ~13.3 s, plus up to 15% jitter). The hourly cap in safeFetch is
// left untouched as the backstop. Override with GSF_MIN_REQUEST_INTERVAL_MS.
export const GSF_CAP_SHARE = 0.9;

export function gsfMinRequestIntervalMs(): number {
  const override = Number(process.env.GSF_MIN_REQUEST_INTERVAL_MS);
  if (Number.isFinite(override) && override > 0) return override;
  const perHour = Math.max(1, Math.floor(getHostCapPerHour() * GSF_CAP_SHARE));
  return Math.ceil(3_600_000 / perHour);
}

type PacerClock = { now: () => number; sleep: (ms: number) => Promise<void>; random: () => number };
const realClock: PacerClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: () => Math.random(),
};
let pacerClock: PacerClock = realClock;
let lastGsfRequestAt = 0;

/** Test-only: swap the pacer clock and reset its state. Pass nothing to restore the real clock. */
export function __setGsfPacerClockForTests(clock?: PacerClock): void {
  pacerClock = clock ?? realClock;
  lastGsfRequestAt = 0;
}

/**
 * Wait until at least gsfMinRequestIntervalMs() (+0-15% jitter) has passed since the previous
 * GSF request in this process, then claim the slot. Returns the ms waited.
 */
export async function gsfPace(): Promise<number> {
  const interval = gsfMinRequestIntervalMs() * (1 + pacerClock.random() * 0.15);
  const now = pacerClock.now();
  const wait = lastGsfRequestAt === 0 ? 0 : Math.max(0, lastGsfRequestAt + interval - now);
  if (wait > 0) await pacerClock.sleep(wait);
  lastGsfRequestAt = pacerClock.now();
  return wait;
}

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
): Promise<GsfMetroStats> {
  const stats: GsfMetroStats = { created: 0, updated: 0, skipped: 0, failed: 0, skippedFresh: 0 };
  // Measurement-only (2026-08-26 ADR): tracks bytes transferred for this metro's run so
  // Railway egress footprint can be read back from logs before deciding on a GH Actions migration.
  const byteTracker = { totalBytes: 0, fetchCount: 0 };

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

    await gsfPace();
    const result = await safeFetch(metroUrl, {
      headers: { 'User-Agent': getRandomUserAgent() },
      requireProxy: true,
      timeoutMs: 20000,
      breakerPolicy: 'tolerant',
      breakerScope: metro,
    });

    if (result.status !== 'FETCHED') {
      // Not "no listings": the metro was never looked at. Report it so the job is recorded
      // as incomplete and the rotation retries this metro first next time.
      console.warn(`[GarageSaleFinder] safeFetch ${result.status} for ${metroUrl} — skipping`);
      stats.stoppedEarly = result.status.toLowerCase();
      return stats;
    }
    const response = result.response!;

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        rateLimiter.recordBackoff(domain, retryAfter ? parseInt(retryAfter) : 60);
      }
      console.warn(`[GarageSaleFinder] Metro page returned ${response.status}: ${metroUrl}`);
      if (response.status === 429 || response.status === 503 || response.status === 403) {
        stats.stoppedEarly = `metro_http_${response.status}`;
      }
      return stats;
    }

    const html = await response.text();
    byteTracker.totalBytes += Number(response.headers.get('content-length')) || Buffer.byteLength(html, 'utf8');
    byteTracker.fetchCount += 1;
    const $ = cheerio.load(html);

    // Build map of saleId → {galleryUrl, thumbnailUrl} from listing cards that have photos
    const galleryMap = new Map<string, { galleryUrl: string; thumbnailUrl: string }>();
    $('a[href*="/gallery"]').each((_, el) => {
      const galleryHref = $(el).attr('href') ?? '';
      // 2026-10-28 markup change dropped itemprop on these thumbnails; accept any <img>.
      const img = $(el).find('img[itemprop="image"]').length
        ? $(el).find('img[itemprop="image"]')
        : $(el).find('img').first();
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
    const failureReasons: Record<string, number> = {};
    let consecutiveFetchFailures = 0;
    for (const saleUrl of candidateUrls) {
      if (freshSourceUrls.has(saleUrl)) {
        stats.skippedFresh++;
        continue;
      }

      const idMatch = saleUrl.match(/\/s\/([A-Za-z0-9]+)\//);
      const saleId = idMatch ? idMatch[1] : '';
      const galleryInfo = galleryMap.get(saleId);
      const diag: { reason?: GsfDetailReason } = {};
      const item = await parseGarageSalesFinderSale(saleUrl, rateLimiter, galleryInfo, byteTracker, metro, diag);
      if (!item) {
        const reason = diag.reason || 'unknown';
        failureReasons[reason] = (failureReasons[reason] || 0) + 1;
        if (isMetroStopReason(reason)) {
          // A request we chose not to send is not a failed listing: record the metro as
          // incomplete instead of counting an item failure (11-01: all 237 "failures" were
          // this, not parse errors).
          stats.stoppedEarly = reason;
          console.warn(`[GarageSaleFinder] ${metro}: ${reason} — ending this metro early (other metros unaffected)`);
          break;
        }
        stats.failed++;
        if (isFetchFailureReason(reason)) {
          consecutiveFetchFailures++;
          if (consecutiveFetchFailures >= METRO_MAX_CONSECUTIVE_FETCH_FAILURES) {
            stats.stoppedEarly = 'fetch_failure_streak';
            console.warn(`[GarageSaleFinder] ${metro}: ${consecutiveFetchFailures} consecutive fetch failures — ending this metro early (other metros unaffected)`);
            break;
          }
        } else {
          consecutiveFetchFailures = 0;
        }
        continue;
      }
      consecutiveFetchFailures = 0;

      const result = await ingestScrapedListing(item, organizerId);
      if (result.status === 'created') stats.created++;
      else if (result.status === 'updated') stats.updated++;
      else if (result.status === 'skipped') stats.skipped++;
      else stats.failed++;
    }
    await flushFreshnessTouches();
    await flushScraperRevalidation();

    if (Object.keys(failureReasons).length > 0) {
      console.warn(`[GarageSaleFinder] ${metro} detail failures by reason: ${JSON.stringify(failureReasons)}`);
    }
    console.log(`[GarageSaleFinder] ${metro} done — created=${stats.created} updated=${stats.updated} skipped=${stats.skipped} skippedFresh=${stats.skippedFresh} failed=${stats.failed}${stats.stoppedEarly ? ` stoppedEarly=${stats.stoppedEarly}` : ''}`);

    rateLimiter.clearBackoff(domain);
    console.log(`[GarageSaleFinder] metro=${metro} bytesTransferred=${byteTracker.totalBytes} fetches=${byteTracker.fetchCount} stats=${JSON.stringify(stats)}`);
    return stats;
  } catch (error) {
    console.error(`[GarageSaleFinder] Scrape failed for ${metro}:`, error);
    throw error;
  }
}

/**
 * Parse a single GarageSaleFinder sale detail page (one request; photos are read from the
 * detail page). galleryInfo's thumbnail is only a photo fallback, no gallery page is fetched.
 */
export async function parseGarageSalesFinderSale(
  saleUrl: string,
  rateLimiter: RateLimiter,
  galleryInfo?: { galleryUrl: string; thumbnailUrl: string },
  byteTracker?: { totalBytes: number; fetchCount: number },
  metro?: string,
  diag?: { reason?: GsfDetailReason }
): Promise<ScrapedItem | null> {
  const fail = (reason: GsfDetailReason): null => {
    if (diag) diag.reason = reason;
    return null;
  };
  try {
    const domain = new URL(saleUrl).hostname;
    await rateLimiter.waitBeforeRequest(domain);

    if (!rateLimiter.isAllowed(saleUrl)) {
      console.warn(`[GarageSaleFinder] Robots.txt blocked: ${saleUrl}`);
      return fail('robots');
    }

    let result;
    try {
      await gsfPace();
      result = await safeFetch(saleUrl, {
        headers: { 'User-Agent': getRandomUserAgent() },
        requireProxy: true,
        timeoutMs: 15000,
        breakerPolicy: 'tolerant',
        breakerScope: metro,
      });
    } catch (fetchErr) {
      console.warn(`[GarageSaleFinder] fetch error for ${saleUrl}:`, fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
      return fail('network_error');
    }

    if (result.status !== 'FETCHED') {
      console.warn(`[GarageSaleFinder] safeFetch ${result.status} for ${saleUrl} — skipping`);
      return fail(result.status.toLowerCase());
    }
    const response = result.response!;

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        rateLimiter.recordBackoff(domain, retryAfter ? parseInt(retryAfter) : 60);
      }
      return fail('http_error');
    }

    const html = await response.text();
    if (byteTracker) {
      byteTracker.totalBytes += Number(response.headers.get('content-length')) || Buffer.byteLength(html, 'utf8');
      byteTracker.fetchCount += 1;
    }
    const { listing: parsed, reason: parseReason } = parseGarageSalesFinderListingWithReason(html);

    // address and zip intentionally omitted — GSF hides street addresses on many
    // listings (empty string). ingestScrapedListing handles empty addresses fine.
    if (!parsed || !parsed.title || !parsed.city || !parsed.state || !parsed.startDate || !parsed.endDate) {
      return fail(`parse_${parseReason || 'incomplete'}`);
    }

    // Photos come from the detail page itself (2026-11-01). The old extra /gallery request
    // returned 0 photos on all 134 tries in the 11-01 run (its <img> tags are now lazy
    // spacer.png) while costing nearly half of the hourly budget. If the detail page has no
    // photo, the metro page's thumbnail (upgraded to the same w700-h500 size) is used.
    let photoUrls = parsed.photoUrls;
    if ((!photoUrls || photoUrls.length === 0) && galleryInfo?.thumbnailUrl) {
      photoUrls = [gsfFullSizePhotoUrl(galleryInfo.thumbnailUrl)];
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
      photoUrls,
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
    return fail('exception');
  }
}
