/**
 * ADR-076: Standalone Craigslist scraper for GitHub Actions
 * Runs outside Express server, POSTs results to Railway backend
 *
 * Environment variables (from GitHub secrets):
 * - RAILWAY_BACKEND_URL: https://backend-production-xxx.up.railway.app
 * - INTERNAL_SCRAPER_KEY: shared secret for authentication
 * - CRAIGSLIST_ORGANIZER_ID: organizer to attribute scraped listings to (optional)
 *
 * Usage: npx ts-node src/scripts/run-craigslist.ts
 */

import { scrapeCraigslistItems } from '../services/scraper/sources/craigslist';
import { CRAIGSLIST_SITES } from '../services/scraper/craigslist-sites';
import { RateLimiter } from '../services/scraper/rateLimiter';

const INGEST_URL = (process.env.RAILWAY_BACKEND_URL || 'http://localhost:3001') + '/api/internal/scraper/ingest';
const SCRAPER_KEY = process.env.INTERNAL_SCRAPER_KEY;
const ORGANIZER_ID = process.env.CRAIGSLIST_ORGANIZER_ID;

async function main() {
  // Validate required env vars
  if (!SCRAPER_KEY) {
    throw new Error('INTERNAL_SCRAPER_KEY environment variable is not set');
  }
  // ORGANIZER_ID is optional — backend falls back to system organizer if not set
  if (!ORGANIZER_ID) {
    console.log('[run-craigslist] No CRAIGSLIST_ORGANIZER_ID set — will use system organizer');
  }

  console.log(`[run-craigslist] Starting scrape of ${CRAIGSLIST_SITES.length} Craigslist sites`);
  console.log(`[run-craigslist] Backend URL: ${INGEST_URL}`);

  const rateLimiter = new RateLimiter({ requestsPerSecond: 1, maxRetries: 3 });
  const allItems: any[] = [];
  const seenIds = new Set<string>(); // Dedup across overlapping metros
  let successCount = 0;
  let failureCount = 0;

  // Scrape each site sequentially with aggressive rate limiting
  for (const site of CRAIGSLIST_SITES) {
    try {
      console.log(`[run-craigslist] Scraping ${site.label}...`);
      const items = await scrapeCraigslistItems(site, rateLimiter);

      // Dedupe by sourceItemId before adding to allItems
      for (const item of items) {
        if (item.sourceItemId && !seenIds.has(item.sourceItemId)) {
          seenIds.add(item.sourceItemId);
          allItems.push(item);
        }
      }

      successCount++;
      console.log(`[run-craigslist] ${site.label}: ${items.length} items (${allItems.length} total after dedup)`);
    } catch (error) {
      failureCount++;
      console.error(
        `[run-craigslist] Failed for ${site.label}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  console.log(
    `[run-craigslist] Scraping complete — ${successCount} sites OK, ${failureCount} failed`
  );
  console.log(`[run-craigslist] Total items collected (after dedup): ${allItems.length}`);

  // POST to Railway in batches of 25, processed with bounded concurrency
  // to avoid overwhelming the backend or hammering Craigslist during the request phase.
  const batchSize = 25;
  const CONCURRENCY = 5;

  const batches: { num: number; items: any[] }[] = [];
  for (let i = 0; i < allItems.length; i += batchSize) {
    batches.push({ num: Math.floor(i / batchSize) + 1, items: allItems.slice(i, i + batchSize) });
  }
  const totalBatches = batches.length;
  const totals = { created: 0, updated: 0, skipped: 0, failed: 0, httpErrors: 0 };
  let completed = 0;

  async function postOne(batch: { num: number; items: any[] }): Promise<void> {
    try {
      const response = await fetch(INGEST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-scraper-key': SCRAPER_KEY!,
        },
        body: JSON.stringify({
          items: batch.items,
          organizerId: ORGANIZER_ID,
        }),
      });

      completed++;

      if (!response.ok) {
        const error = await response.text();
        totals.httpErrors++;
        console.error(
          `[run-craigslist] (${completed}/${totalBatches}) Batch ${batch.num} failed with status ${response.status}: ${error.slice(0, 200)}`
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
        `[run-craigslist] (${completed}/${totalBatches}) Batch ${batch.num} — ${result.stats.created}c / ${result.stats.skipped}s / ${result.stats.failed}f`
      );
    } catch (error) {
      completed++;
      totals.httpErrors++;
      console.error(
        `[run-craigslist] (${completed}/${totalBatches}) Batch ${batch.num} threw:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // Worker pool: each worker pulls the next batch off a shared queue
  const queue = batches.slice();
  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      await postOne(next);
    }
  }

  if (totalBatches > 0) {
    console.log(
      `[run-craigslist] Posting ${totalBatches} batches with concurrency ${CONCURRENCY}...`
    );
    const ingestStart = Date.now();
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    const ingestSec = ((Date.now() - ingestStart) / 1000).toFixed(1);

    console.log(
      `[run-craigslist] Ingest complete in ${ingestSec}s — ${totals.created} created, ${totals.skipped} skipped, ${totals.failed} failed (item-level), ${totals.httpErrors} batch HTTP errors`
    );
  } else {
    console.log('[run-craigslist] No items to ingest');
  }
}

main().catch((error) => {
  console.error('[run-craigslist] Fatal error:', error);
  process.exit(1);
});
