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
  runFoursquareScraper,
} from '../services/scraper/sources/foursquarePlaces';
import { ScrapedItem } from '../services/scraper/index';
import { getNextCrawlsToRun, recordCrawlSuccess, recordCrawlFailure } from '../services/scraper/crawlQueueManager';

const INGEST_URL =
  (process.env.RAILWAY_BACKEND_URL || 'http://localhost:3001') + '/api/internal/scraper/ingest';
const SCRAPER_KEY = process.env.INTERNAL_SCRAPER_KEY;

const BATCH_SIZE = 25;
const CONCURRENCY = 5;

async function main() {
  if (!SCRAPER_KEY) throw new Error('INTERNAL_SCRAPER_KEY is not set');

  // Fetch next batch of queue items to crawl
  const queueItems = await getNextCrawlsToRun(50, 'Foursquare'); // Get up to 50 queue items ready to run
  console.log(`[run-foursquare-places] Found ${queueItems.length} queue items ready to run`);

  if (queueItems.length === 0) {
    console.log('[run-foursquare-places] No queue items ready — exiting');
    return;
  }

  console.log(`[run-foursquare-places] Backend: ${INGEST_URL}`);

  let allItems: ScrapedItem[] = [];
  const results = { succeeded: 0, failed: 0 };

  for (const queueItem of queueItems) {
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

    try {
      const items = await runFoursquareScraper([searchLocation]);
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
    } catch (err) {
      completed++;
      totals.httpErrors++;
      console.error(
        `[run-foursquare-places] (${completed}/${totalBatches}) Batch ${batch.num} threw:`,
        err instanceof Error ? err.message : String(err)
      );
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
