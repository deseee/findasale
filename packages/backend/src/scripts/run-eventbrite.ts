/**
 * ADR-076: Standalone Eventbrite scraper for GitHub Actions
 * Runs outside Express server, POSTs results to Railway backend
 *
 * Environment variables (from GitHub secrets):
 * - RAILWAY_BACKEND_URL: https://backend-production-xxx.up.railway.app
 * - INTERNAL_SCRAPER_KEY: shared secret for authentication
 * - EVENTBRITE_API_KEY: Eventbrite OAuth token (required)
 * - EVENTBRITE_ORGANIZER_ID: organizer to attribute scraped listings to (optional, backend falls back to system organizer)
 *
 * Usage: npx ts-node src/scripts/run-eventbrite.ts
 */

import { scrapeEventbriteItems } from '../services/scraper/sources/eventbrite';
import { NATIONAL_GRID } from '../services/scraper/national-grid';
import { RateLimiter } from '../services/scraper/rateLimiter';

const INGEST_URL = (process.env.RAILWAY_BACKEND_URL || 'http://localhost:3001') + '/api/internal/scraper/ingest';
const SCRAPER_KEY = process.env.INTERNAL_SCRAPER_KEY;
const API_KEY = process.env.EVENTBRITE_API_KEY;
const ORGANIZER_ID = process.env.EVENTBRITE_ORGANIZER_ID;

async function main() {
  // Validate required env vars
  if (!SCRAPER_KEY) {
    throw new Error('INTERNAL_SCRAPER_KEY environment variable is not set');
  }
  if (!API_KEY) {
    throw new Error('EVENTBRITE_API_KEY environment variable is not set');
  }
  // ORGANIZER_ID is optional — backend falls back to system organizer if not set
  if (!ORGANIZER_ID) {
    console.log('[run-eventbrite] No EVENTBRITE_ORGANIZER_ID set — will use system organizer');
  }

  console.log(`[run-eventbrite] Starting scrape of ${NATIONAL_GRID.length} coordinate centers`);
  console.log(`[run-eventbrite] Backend URL: ${INGEST_URL}`);

  const rateLimiter = new RateLimiter({ requestsPerSecond: 1, maxRetries: 3 });
  const allItems: any[] = [];
  const seenIds = new Set<string>(); // Dedup across overlapping circles
  let successCount = 0;
  let failureCount = 0;

  // Scrape each coordinate center sequentially
  for (const center of NATIONAL_GRID) {
    try {
      console.log(`[run-eventbrite] Scraping ${center.label}...`);
      const items = await scrapeEventbriteItems(center, rateLimiter, API_KEY);

      // Dedupe by sourceItemId before adding to allItems
      for (const item of items) {
        if (item.sourceItemId && !seenIds.has(item.sourceItemId)) {
          seenIds.add(item.sourceItemId);
          allItems.push(item);
        }
      }

      successCount++;
      console.log(`[run-eventbrite] ${center.label}: ${items.length} items (${allItems.length} total after dedup)`);
    } catch (error) {
      failureCount++;
      console.error(
        `[run-eventbrite] Failed for ${center.label}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  console.log(
    `[run-eventbrite] Scraping complete — ${successCount} centers OK, ${failureCount} failed`
  );
  console.log(`[run-eventbrite] Total items collected (after dedup): ${allItems.length}`);

  // POST to Railway in batches of 25, processed with bounded concurrency
  // so one slow request doesn't gate the whole run. With CONCURRENCY=5 a full
  // national pass finishes in ~1 minute instead of ~5-7.
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
          body: JSON.stringify({
            items: batch.items,
            organizerId: ORGANIZER_ID,
          }),
        });

        completed++;

        if (!response.ok) {
          if ((response.status === 502 || response.status === 503) && attempt < MAX_RETRIES - 1) {
            attempt++;
            const delayMs = Math.pow(2, attempt) * 1000;
            console.log(
              `[run-eventbrite] (${completed}/${totalBatches}) Batch ${batch.num} HTTP ${response.status} — retrying in ${delayMs}ms (attempt ${attempt}/${MAX_RETRIES})`
            );
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }

          const error = await response.text();
          totals.httpErrors++;
          console.error(
            `[run-eventbrite] (${completed}/${totalBatches}) Batch ${batch.num} failed with status ${response.status}: ${error.slice(0, 200)}`
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
          `[run-eventbrite] (${completed}/${totalBatches}) Batch ${batch.num} — ${result.stats.created}c / ${result.stats.skipped}s / ${result.stats.failed}f`
        );
        return;
      } catch (error) {
        if (attempt < MAX_RETRIES - 1) {
          attempt++;
          const delayMs = Math.pow(2, attempt) * 1000;
          console.log(
            `[run-eventbrite] (${completed}/${totalBatches}) Batch ${batch.num} network error — retrying in ${delayMs}ms`
          );
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        completed++;
        totals.httpErrors++;
        console.error(
          `[run-eventbrite] (${completed}/${totalBatches}) Batch ${batch.num} threw:`,
          error instanceof Error ? error.message : String(error)
        );
        return;
      }
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

  console.log(
    `[run-eventbrite] Posting ${totalBatches} batches with concurrency ${CONCURRENCY}...`
  );
  const ingestStart = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const ingestSec = ((Date.now() - ingestStart) / 1000).toFixed(1);

  console.log(
    `[run-eventbrite] Ingest complete in ${ingestSec}s — ${totals.created} created, ${totals.skipped} skipped, ${totals.failed} failed (item-level), ${totals.httpErrors} batch HTTP errors`
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[run-eventbrite] Fatal error:', error);
    process.exit(1);
  });
