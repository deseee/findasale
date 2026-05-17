/**
 * ADR-077: Google Places Business Directory Scraper — GitHub Actions runner
 * Queries Google Places Text Search across queue items filtered by getNextCrawlsToRun().
 * Deduplicates by placeId, then POSTs results to Railway backend for ingestion.
 * Records crawl success/failure in DirectoryCrawlLog.
 *
 * Environment variables (from GitHub secrets):
 * - RAILWAY_BACKEND_URL: https://backend-production-xxx.up.railway.app
 * - INTERNAL_SCRAPER_KEY: shared secret for /api/internal/scraper/ingest
 * - GOOGLE_PLACES_API_KEY: Google Places API key (also set on Railway)
 *
 * Usage: npx ts-node src/scripts/run-google-places.ts
 * Cost estimate: ~$210 per full run (100 metros × 11 queries × $0.032/page × ~3 pages avg)
 */

import {
  scrapeGooglePlacesQuery,
  PLACES_QUERIES,
} from '../services/scraper/sources/googlePlaces';
import { ScrapedItem } from '../services/scraper/index';
import { getNextCrawlsToRun, recordCrawlSuccess, recordCrawlFailure } from '../services/scraper/crawlQueueManager';

const INGEST_URL =
  (process.env.RAILWAY_BACKEND_URL || 'http://localhost:3001') + '/api/internal/scraper/ingest';
const SCRAPER_KEY = process.env.INTERNAL_SCRAPER_KEY;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

const BATCH_SIZE = 25;
const CONCURRENCY = 5;
/** Delay between queries to respect Google's rate limits */
const QUERY_DELAY_MS = 200;

async function main() {
  if (!SCRAPER_KEY) throw new Error('INTERNAL_SCRAPER_KEY is not set');
  if (!GOOGLE_PLACES_API_KEY) throw new Error('GOOGLE_PLACES_API_KEY is not set');

  // Fetch next batch of queue items to crawl
  const queueItems = await getNextCrawlsToRun(50, 'GooglePlaces'); // Get up to 50 queue items ready to run
  console.log(`[run-google-places] Found ${queueItems.length} queue items ready to run`);

  if (queueItems.length === 0) {
    console.log('[run-google-places] No queue items ready — exiting');
    return;
  }

  console.log(`[run-google-places] Backend: ${INGEST_URL}`);

  const allItems: ScrapedItem[] = [];
  const seenPlaceIds = new Set<string>(); // Cross-query dedup by placeId
  let apiErrors = 0;

  for (const queueItem of queueItems) {
    const { id: queueId, metro, subArea } = queueItem;
    const queryConfig = PLACES_QUERIES.find((q) => q.query === queueItem.queryType);

    if (!queryConfig) {
      console.warn(`[run-google-places] Unknown queryType: ${queueItem.queryType} — skipping`);
      continue;
    }

    let metroTotal = 0;
    const searchLocation = subArea ? `${subArea}, ${metro}` : metro;

    try {
      const items = await scrapeGooglePlacesQuery(GOOGLE_PLACES_API_KEY, queryConfig, searchLocation);

      for (const item of items) {
        const placeId = item.sourceItemId;
        if (placeId && !seenPlaceIds.has(placeId)) {
          seenPlaceIds.add(placeId);
          allItems.push(item);
          metroTotal++;
        }
      }

      // Record success in crawl queue
      await recordCrawlSuccess(queueId, metroTotal);
      console.log(
        `[run-google-places] ${searchLocation} / ${queryConfig.query}: +${metroTotal} new (total: ${allItems.length})`
      );
    } catch (err) {
      apiErrors++;
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[run-google-places] Error — ${searchLocation}/${queryConfig.query}: ${errorMsg}`);

      // Record failure in crawl queue
      await recordCrawlFailure(queueId, errorMsg);
    }

    // Brief pause between queries
    await new Promise((resolve) => setTimeout(resolve, QUERY_DELAY_MS));
  }

  console.log(
    `[run-google-places] Scraping complete — ${allItems.length} unique businesses, ${apiErrors} API errors`
  );

  if (allItems.length === 0) {
    console.log('[run-google-places] No items to ingest — exiting');
    return;
  }

  // POST to Railway in batches with bounded concurrency
  const batches: { num: number; items: ScrapedItem[] }[] = [];
  for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
    batches.push({
      num: Math.floor(i / BATCH_SIZE) + 1,
      items: allItems.slice(i, i + BATCH_SIZE),
    });
  }
  const totalBatches = batches.length;
  const totals = { created: 0, updated: 0, skipped: 0, failed: 0, httpErrors: 0 };
  let completed = 0;

  async function postBatch(batch: { num: number; items: ScrapedItem[] }): Promise<void> {
    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        const response = await fetch(INGEST_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-scraper-key': SCRAPER_KEY!,
          },
          body: JSON.stringify({ items: batch.items }),
        });
        completed++;

        if (!response.ok) {
          if ((response.status === 502 || response.status === 503) && attempt < MAX_RETRIES - 1) {
            attempt++;
            const delayMs = Math.pow(2, attempt) * 1000;
            console.log(
              `[run-google-places] (${completed}/${totalBatches}) Batch ${batch.num} HTTP ${response.status} — retrying in ${delayMs}ms (attempt ${attempt}/${MAX_RETRIES})`
            );
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }

          const text = await response.text();
          totals.httpErrors++;
          console.error(
            `[run-google-places] (${completed}/${totalBatches}) Batch ${batch.num} HTTP ${response.status}: ${text.slice(0, 200)}`
          );
          return;
        }

        const result = (await response.json()) as {
          stats: { created: number; updated: number; skipped: number; failed: number };
        };
        totals.created += result.stats.created;
        totals.updated += result.stats.updated;
        totals.skipped += result.stats.skipped;
        totals.failed += result.stats.failed;
        console.log(
          `[run-google-places] (${completed}/${totalBatches}) Batch ${batch.num} — ${result.stats.created}c / ${result.stats.skipped}s / ${result.stats.failed}f`
        );
        return;
      } catch (err) {
        if (attempt < MAX_RETRIES - 1) {
          attempt++;
          const delayMs = Math.pow(2, attempt) * 1000;
          console.log(
            `[run-google-places] (${completed}/${totalBatches}) Batch ${batch.num} network error — retrying in ${delayMs}ms`
          );
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        completed++;
        totals.httpErrors++;
        console.error(
          `[run-google-places] (${completed}/${totalBatches}) Batch ${batch.num} threw:`,
          err instanceof Error ? err.message : String(err)
        );
        return;
      }
    }
  }

  const queue = batches.slice();
  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      await postBatch(next);
    }
  }

  console.log(
    `[run-google-places] Posting ${totalBatches} batches with concurrency ${CONCURRENCY}...`
  );
  const t0 = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(
    `[run-google-places] Ingest complete in ${elapsed}s — ${totals.created} created, ${totals.skipped} skipped, ${totals.failed} failed (item-level), ${totals.httpErrors} batch HTTP errors`
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('[run-google-places] Fatal error:', err);
    process.exit(1);
  });
