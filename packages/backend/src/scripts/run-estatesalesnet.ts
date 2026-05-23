/**
 * ADR-076: Standalone EstateSalesNet scraper for GitHub Actions
 * Runs outside Express server, POSTs results to Railway backend
 *
 * Environment variables (from GitHub secrets):
 * - RAILWAY_BACKEND_URL: https://backend-production-xxx.up.railway.app
 * - INTERNAL_SCRAPER_KEY: shared secret for authentication
 * - ESTATESALESNET_ORGANIZER_ID: organizer to attribute scraped listings to
 *
 * Chunking (for matrix workflow):
 * - SCRAPER_CHUNK: 1-based chunk index (e.g. 1, 2, 3, 4)
 * - SCRAPER_TOTAL_CHUNKS: total number of chunks (e.g. 4)
 * Each chunk processes its slice of NATIONAL_GRID independently.
 * Deduplication is idempotent — ingest uses upsert on sourceItemId, so
 * overlap between chunks (due to 250-mile radii) produces no duplicates.
 *
 * Usage (full run):   npx ts-node src/scripts/run-estatesalesnet.ts
 * Usage (chunked):    SCRAPER_CHUNK=1 SCRAPER_TOTAL_CHUNKS=4 npx ts-node src/scripts/run-estatesalesnet.ts
 */

import { scrapeEstateSalesNetItems } from '../services/scraper/sources/estatesalesnet';
import { NATIONAL_GRID } from '../services/scraper/national-grid';
import { RateLimiter } from '../services/scraper/rateLimiter';

const INGEST_URL = (process.env.RAILWAY_BACKEND_URL || 'http://localhost:3001') + '/api/internal/scraper/ingest';
const SCRAPER_KEY = process.env.INTERNAL_SCRAPER_KEY;
const ORGANIZER_ID = process.env.ESTATESALESNET_ORGANIZER_ID;

// Chunking: split NATIONAL_GRID into SCRAPER_TOTAL_CHUNKS slices and run only SCRAPER_CHUNK (1-based).
// If neither is set, run the full grid (backwards-compatible).
const CHUNK_INDEX = process.env.SCRAPER_CHUNK ? parseInt(process.env.SCRAPER_CHUNK, 10) : null;
const TOTAL_CHUNKS = process.env.SCRAPER_TOTAL_CHUNKS ? parseInt(process.env.SCRAPER_TOTAL_CHUNKS, 10) : null;

function getGridSlice() {
  if (CHUNK_INDEX === null || TOTAL_CHUNKS === null) {
    return NATIONAL_GRID; // No chunking — full run
  }
  if (CHUNK_INDEX < 1 || CHUNK_INDEX > TOTAL_CHUNKS) {
    throw new Error(`SCRAPER_CHUNK must be between 1 and SCRAPER_TOTAL_CHUNKS (got ${CHUNK_INDEX} of ${TOTAL_CHUNKS})`);
  }
  // Distribute grid entries as evenly as possible across chunks
  const chunkSize = Math.ceil(NATIONAL_GRID.length / TOTAL_CHUNKS);
  const start = (CHUNK_INDEX - 1) * chunkSize;
  const end = Math.min(start + chunkSize, NATIONAL_GRID.length);
  return NATIONAL_GRID.slice(start, end);
}

async function main() {
  // Validate required env vars
  if (!SCRAPER_KEY) {
    throw new Error('INTERNAL_SCRAPER_KEY environment variable is not set');
  }
  // ORGANIZER_ID is optional — backend falls back to system organizer if not set
  if (!ORGANIZER_ID) {
    console.log('[run-estatesalesnet] No ESTATESALESNET_ORGANIZER_ID set — will use system organizer');
  }

  const grid = getGridSlice();
  const chunkLabel = CHUNK_INDEX !== null ? ` (chunk ${CHUNK_INDEX}/${TOTAL_CHUNKS})` : '';

  console.log(`[run-estatesalesnet] Starting scrape of ${grid.length}/${NATIONAL_GRID.length} coordinate centers${chunkLabel}`);
  console.log(`[run-estatesalesnet] Backend URL: ${INGEST_URL}`);

  const rateLimiter = new RateLimiter({ requestsPerSecond: 1, maxRetries: 3 });
  const allItems: any[] = [];
  const seenIds = new Set<string>(); // Dedup across overlapping circles within this chunk
  let successCount = 0;
  let failureCount = 0;

  // Scrape each coordinate center in this chunk sequentially
  for (const center of grid) {
    try {
      console.log(`[run-estatesalesnet] Scraping ${center.label}...`);
      const items = await scrapeEstateSalesNetItems(center, rateLimiter);

      // Dedupe by sourceItemId before adding to allItems
      for (const item of items) {
        if (item.sourceItemId && !seenIds.has(item.sourceItemId)) {
          seenIds.add(item.sourceItemId);
          allItems.push(item);
        }
      }

      successCount++;
      console.log(`[run-estatesalesnet] ${center.label}: ${items.length} items (${allItems.length} total after dedup)`);
    } catch (error) {
      failureCount++;
      console.error(
        `[run-estatesalesnet] Failed for ${center.label}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  console.log(
    `[run-estatesalesnet] Scraping complete${chunkLabel} — ${successCount} centers OK, ${failureCount} failed`
  );
  console.log(`[run-estatesalesnet] Total items collected (after dedup): ${allItems.length}`);

  // POST to Railway in batches of 25, processed with bounded concurrency
  // so one slow request does not gate the whole run. With CONCURRENCY=5 a full
  // chunk pass (12-13 centers) finishes in well under 10 minutes.
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
    let completedIncremented = false;

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
        completedIncremented = true;

        if (!response.ok) {
          if ((response.status === 502 || response.status === 503) && attempt < MAX_RETRIES - 1) {
            attempt++;
            // Undo increment so the counter stays accurate during retry
            completed--;
            completedIncremented = false;
            const delayMs = Math.pow(2, attempt) * 1000;
            console.log(
              `[run-estatesalesnet] (${completed}/${totalBatches}) Batch ${batch.num} HTTP ${response.status} — retrying in ${delayMs}ms (attempt ${attempt}/${MAX_RETRIES})`
            );
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }

          const error = await response.text();
          totals.httpErrors++;
          console.error(
            `[run-estatesalesnet] (${completed}/${totalBatches}) Batch ${batch.num} failed with status ${response.status}: ${error.slice(0, 200)}`
          );
          return;
        }

        // Backend responds 202 (fire-and-forget ingest) — no stats in response body
        if (response.status === 202) {
          console.log(
            `[run-estatesalesnet] (${completed}/${totalBatches}) Batch ${batch.num} — submitted OK`
          );
          return;
        }

        const result = (await response.json()) as {
          stats?: { created: number; updated: number; skipped: number; failed: number };
        };
        if (result.stats) {
          totals.created += result.stats.created;
          totals.updated += result.stats.updated;
          totals.skipped += result.stats.skipped;
          totals.failed += result.stats.failed;
          console.log(
            `[run-estatesalesnet] (${completed}/${totalBatches}) Batch ${batch.num} — ${result.stats.created}c / ${result.stats.skipped}s / ${result.stats.failed}f`
          );
        } else {
          console.log(
            `[run-estatesalesnet] (${completed}/${totalBatches}) Batch ${batch.num} — OK (no stats)`
          );
        }
        return;
      } catch (error) {
        if (attempt < MAX_RETRIES - 1) {
          attempt++;
          const delayMs = Math.pow(2, attempt) * 1000;
          console.log(
            `[run-estatesalesnet] (${completed}/${totalBatches}) Batch ${batch.num} network error — retrying in ${delayMs}ms`
          );
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        // Only increment if the try block never reached completed++ (i.e. fetch itself threw)
        if (!completedIncremented) {
          completed++;
        }
        totals.httpErrors++;
        console.error(
          `[run-estatesalesnet] (${completed}/${totalBatches}) Batch ${batch.num} threw:`,
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
    `[run-estatesalesnet] Posting ${totalBatches} batches with concurrency ${CONCURRENCY}...`
  );
  const ingestStart = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const ingestSec = ((Date.now() - ingestStart) / 1000).toFixed(1);

  console.log(
    `[run-estatesalesnet] Ingest complete in ${ingestSec}s${chunkLabel} — ${totals.created} created, ${totals.skipped} skipped, ${totals.failed} failed (item-level), ${totals.httpErrors} batch HTTP errors`
  );
}

main()
  .then(() => {
    // Force exit so undici keepalive sockets don't keep the event loop alive
    // and the final "Ingest complete" log line gets flushed from stdout buffer.
    process.exit(0);
  })
  .catch((error) => {
    console.error('[run-estatesalesnet] Fatal error:', error);
    process.exit(1);
  });
