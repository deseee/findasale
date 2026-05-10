/**
 * ADR-077: Foursquare v3 Places Business Directory Scraper — GitHub Actions runner
 * Queries Foursquare Places Search API across queue items filtered by getNextCrawlsToRun().
 * Deduplicates by fsqId, then POSTs results to Railway backend for ingestion.
 * Records crawl success/failure in DirectoryCrawlLog.
 *
 * Environment variables (from GitHub secrets):
 * - RAILWAY_BACKEND_URL: https://backend-production-xxx.up.railway.app
 * - INTERNAL_SCRAPER_KEY: shared secret for /api/internal/scraper/ingest
 * - FOURSQUARE_API_KEY: Foursquare v3 API key (also set on Railway)
 *
 * Usage: npx ts-node src/scripts/run-foursquare-places.ts
 * Cost estimate: Free tier allows 100k monthly searches
 */

import {
  scrapeFoursquareQuery,
} from '../services/scraper/sources/foursquarePlaces';
import { ScrapedItem } from '../services/scraper/index';
import { getNextCrawlsToRun, recordCrawlSuccess, recordCrawlFailure } from '../services/scraper/crawlQueueManager';
import { PLACES_QUERIES } from '../services/scraper/sources/googlePlaces';
import { QUERY_TYPE_TO_SEARCH } from '../services/scraper/subAreaConfig';

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
  const queueItems = await getNextCrawlsToRun(queueLimit, 'Foursquare'); // Get up to queueLimit queue items ready to run
  console.log(`[run-foursquare-places] Found ${queueItems.length} queue items ready to run`);

  // If using matrix strategy (batchCount > 1), slice the queue into batches
  let itemsToProcess = queueItems;
  if (batchCount > 1) {
    const itemsPerBatch = Math.ceil(queueItems.length / batchCount);
    const startIdx = batchIndex * itemsPerBatch;
    const endIdx = Math.min(startIdx + itemsPerBatch, queueItems.length);
    itemsToProcess = queueItems.slice(startIdx, endIdx);
    console.log(
      `[run-foursquare-places] Matrix batch ${batchIndex}/${batchCount - 1}: processing items ${startIdx}–${endIdx - 1} (${itemsToProcess.length} items)`
    );
  }

  if (itemsToProcess.length === 0) {
    console.log('[run-foursquare-places] No queue items to process in this batch — exiting');
    return;
  }

  console.log(`[run-foursquare-places] Backend: ${INGEST_URL}`);

  let allItems: ScrapedItem[] = [];
  const results = { succeeded: 0, failed: 0 };

  for (const queueItem of itemsToProcess) {
    const { id: queueId, metro, subArea } = queueItem;
    // Build Foursquare `near` string: "Suburb, ST" (not "Suburb, City, ST")
    let searchLocation: string;
    if (subArea) {
      const stateMatch = metro.match(/,\s*([A-Z]{2,3})$/);
      const state = stateMatch ? stateMatch[1] : '';
      searchLocation = state ? `${subArea}, ${state}` : metro;
    } else {
      searchLocation = metro;
    }

    // Find the matching query config for this queue item's queryType
    const searchTerm = QUERY_TYPE_TO_SEARCH[queueItem.queryType as keyof typeof QUERY_TYPE_TO_SEARCH];
    const queryConfig = PLACES_QUERIES.find((q) => q.query === searchTerm);
    if (!queryConfig) {
      console.warn(`[run-foursquare-places] No query config for queryType="${queueItem.queryType}" — skipping`);
      await recordCrawlFailure(queueId, `No query config for queryType: ${queueItem.queryType}`);
      results.failed++;
      continue;
    }

    const apiKey = process.env.FOURSQUARE_API_KEY?.trim();
    if (!apiKey) throw new Error('FOURSQUARE_API_KEY is not set');

    try {
      const items = await scrapeFoursquareQuery(apiKey, queryConfig, searchLocation);
      allItems = allItems.concat(items);

      await recordCrawlSuccess(queueId, items.length);
      results.succeeded++;
      console.log(`[run-foursquare-places] ${searchLocation}: +${items.length} results`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[run-foursquare-places] Error — ${searchLocation}: ${errorMsg}`);

      await recordCrawlFailure(queueId, errorMsg);
      results.failed++;
    }
  }

  console.log(
    `[run-foursquare-places] Scraping complete — ${allItems.length} unique businesses, ${results.succeeded} succeeded, ${results.failed} failed`
  );

  if (allItems.length === 0) {
    console.log('[run-foursquare-places] No items to ingest — exiting');
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
              `[run-foursquare-places] (${completed}/${totalBatches}) Batch ${batch.num} HTTP ${response.status} — retrying in ${delayMs}ms (attempt ${attempt}/${MAX_RETRIES})`
            );
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }

          const text = await response.text();
          totals.httpErrors++;
          console.error(
            `[run-foursquare-places] (${completed}/${totalBatches}) Batch ${batch.num} HTTP ${response.status}: ${text.slice(0, 200)}`
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
          `[run-foursquare-places] (${completed}/${totalBatches}) Batch ${batch.num} — ${result.stats.created}c / ${result.stats.skipped}s / ${result.stats.failed}f`
        );
        return;
      } catch (err) {
        if (attempt < MAX_RETRIES - 1) {
          attempt++;
          const delayMs = Math.pow(2, attempt) * 1000;
          console.log(
            `[run-foursquare-places] (${completed}/${totalBatches}) Batch ${batch.num} network error — retrying in ${delayMs}ms`
          );
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        completed++;
        totals.httpErrors++;
        console.error(
          `[run-foursquare-places] (${completed}/${totalBatches}) Batch ${batch.num} threw:`,
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
    `[run-foursquare-places] Posting ${totalBatches} batches with concurrency ${CONCURRENCY}...`
  );
  const t0 = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(
    `[run-foursquare-places] Ingest complete in ${elapsed}s — ${totals.created} created, ${totals.skipped} skipped, ${totals.failed} failed (item-level), ${totals.httpErrors} batch HTTP errors`
  );
}

main().catch((err) => {
  console.error('[run-foursquare-places] Fatal error:', err);
  process.exit(1);
});
