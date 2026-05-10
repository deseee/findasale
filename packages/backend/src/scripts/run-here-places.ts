/**
 * ADR-077: HERE Places Business Directory Scraper — GitHub Actions runner
 * Queries HERE Discover API across queue items filtered by getNextCrawlsToRun().
 * Deduplicates by placeId, then POSTs results to Railway backend for ingestion.
 * Records crawl success/failure in DirectoryCrawlLog.
 *
 * Environment variables (from GitHub secrets):
 * - RAILWAY_BACKEND_URL: https://backend-production-xxx.up.railway.app
 * - INTERNAL_SCRAPER_KEY: shared secret for /api/internal/scraper/ingest
 * - HERE_API_KEY: HERE Discover API key (also set on Railway)
 *
 * Usage: npx ts-node src/scripts/run-here-places.ts
 * Cost estimate: ~$0/run (250k/month free tier, generous quotas)
 */

import {
  runHEREPlacesScraper,
} from '../services/scraper/sources/herePlaces';
import { ScrapedItem } from '../services/scraper/index';
import { getNextCrawlsToRun, recordCrawlSuccess, recordCrawlFailure } from '../services/scraper/crawlQueueManager';

const INGEST_URL =
  (process.env.RAILWAY_BACKEND_URL || 'http://localhost:3001') + '/api/internal/scraper/ingest';
const SCRAPER_KEY = process.env.INTERNAL_SCRAPER_KEY;

const BATCH_SIZE = 25;
const CONCURRENCY = 2;

async function main() {
  if (!SCRAPER_KEY) throw new Error('INTERNAL_SCRAPER_KEY is not set');

  // Matrix job slicing (GitHub Actions parallel batches)
  const batchIndex = parseInt(process.env.SCRAPER_BATCH_INDEX || '0', 10);
  const batchCount = parseInt(process.env.SCRAPER_BATCH_COUNT || '1', 10);
  const queueLimit = parseInt(process.env.SCRAPER_QUEUE_LIMIT || '50', 10);

  // Fetch next batch of queue items to crawl
  // Note: We fetch queueLimit items but may process a subset based on matrix batching
  const queueItems = await getNextCrawlsToRun(queueLimit, 'HEREPlaces'); // Get up to queueLimit queue items ready to run
  console.log(`[run-here-places] Found ${queueItems.length} queue items ready to run`);

  // If using matrix strategy (batchCount > 1), slice the queue into batches
  let itemsToProcess = queueItems;
  if (batchCount > 1) {
    const itemsPerBatch = Math.ceil(queueItems.length / batchCount);
    const startIdx = batchIndex * itemsPerBatch;
    const endIdx = Math.min(startIdx + itemsPerBatch, queueItems.length);
    itemsToProcess = queueItems.slice(startIdx, endIdx);
    console.log(
      `[run-here-places] Matrix batch ${batchIndex}/${batchCount - 1}: processing items ${startIdx}–${endIdx - 1} (${itemsToProcess.length} items)`
    );
  }

  if (itemsToProcess.length === 0) {
    console.log('[run-here-places] No queue items to process in this batch — exiting');
    return;
  }

  console.log(`[run-here-places] Backend: ${INGEST_URL}`);

  let allItems: ScrapedItem[] = [];
  const results = { succeeded: 0, failed: 0 };

  // Deduplicate queue items by (metro, subArea).
  // The queue has one row per (metro, subArea, queryType), but runHEREPlacesScraper always
  // runs all query categories regardless of queryType. Scrape each unique location once
  // and mark ALL matching queue rows complete to avoid 6x duplicate work.
  const locationMap = new Map<string, { searchLocation: string; queueIds: string[] }>();
  for (const item of itemsToProcess) {
    const key = `${item.metro}::${item.subArea ?? ''}`;
    const searchLocation = item.subArea ? `${item.subArea}, ${item.metro}` : item.metro;
    if (!locationMap.has(key)) {
      locationMap.set(key, { searchLocation, queueIds: [] });
    }
    locationMap.get(key)!.queueIds.push(item.id);
  }

  console.log(
    `[run-here-places] Deduped to ${locationMap.size} unique locations from ${queueItems.length} queue items`
  );

  for (const { searchLocation, queueIds } of locationMap.values()) {
    try {
      const items = await runHEREPlacesScraper([searchLocation]);
      allItems = allItems.concat(items);

      // Mark all queue rows for this location as complete
      for (const queueId of queueIds) {
        await recordCrawlSuccess(queueId, items.length);
      }
      results.succeeded += queueIds.length;
      console.log(
        `[run-here-places] ${searchLocation}: +${items.length} results (${queueIds.length} queue rows marked complete)`
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[run-here-places] Error — ${searchLocation}: ${errorMsg}`);

      for (const queueId of queueIds) {
        await recordCrawlFailure(queueId, errorMsg);
      }
      results.failed += queueIds.length;
    }
  }

  console.log(
    `[run-here-places] Scraping complete — ${allItems.length} unique businesses, ${results.succeeded} succeeded, ${results.failed} failed`
  );

  if (allItems.length === 0) {
    console.log('[run-here-places] No items to ingest — exiting');
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
              `[run-here-places] (${completed}/${totalBatches}) Batch ${batch.num} HTTP ${response.status} — retrying in ${delayMs}ms (attempt ${attempt}/${MAX_RETRIES})`
            );
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }

          const text = await response.text();
          totals.httpErrors++;
          console.error(
            `[run-here-places] (${completed}/${totalBatches}) Batch ${batch.num} HTTP ${response.status}: ${text.slice(0, 200)}`
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
          `[run-here-places] (${completed}/${totalBatches}) Batch ${batch.num} — ${result.stats.created}c / ${result.stats.skipped}s / ${result.stats.failed}f`
        );
        return;
      } catch (err) {
        if (attempt < MAX_RETRIES - 1) {
          attempt++;
          const delayMs = Math.pow(2, attempt) * 1000;
          console.log(
            `[run-here-places] (${completed}/${totalBatches}) Batch ${batch.num} network error — retrying in ${delayMs}ms`
          );
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        completed++;
        totals.httpErrors++;
        console.error(
          `[run-here-places] (${completed}/${totalBatches}) Batch ${batch.num} threw:`,
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
    `[run-here-places] Posting ${totalBatches} batches with concurrency ${CONCURRENCY}...`
  );
  const t0 = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(
    `[run-here-places] Ingest complete in ${elapsed}s — ${totals.created} created, ${totals.skipped} skipped, ${totals.failed} failed (item-level), ${totals.httpErrors} batch HTTP errors`
  );
}

main().catch((err) => {
  console.error('[run-here-places] Fatal error:', err);
  process.exit(1);
});
