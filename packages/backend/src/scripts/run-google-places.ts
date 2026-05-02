/**
 * ADR-077: Google Places Business Directory Scraper — GitHub Actions runner
 * Queries Google Places Text Search across 100 metros × 11 queries.
 * Deduplicates by placeId, then POSTs results to Railway backend for ingestion.
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
  GOOGLE_PLACES_METROS,
} from '../services/scraper/sources/googlePlaces';
import { ScrapedItem } from '../services/scraper/index';

const INGEST_URL =
  (process.env.RAILWAY_BACKEND_URL || 'http://localhost:3001') + '/api/internal/scraper/ingest';
const SCRAPER_KEY = process.env.INTERNAL_SCRAPER_KEY;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

const BATCH_SIZE = 25;
const CONCURRENCY = 5;
/** Delay between metros to respect Google's 50 QPS limit across all queries */
const METRO_DELAY_MS = 200;

async function main() {
  if (!SCRAPER_KEY) throw new Error('INTERNAL_SCRAPER_KEY is not set');
  if (!GOOGLE_PLACES_API_KEY) throw new Error('GOOGLE_PLACES_API_KEY is not set');

  console.log(
    `[run-google-places] Starting: ${GOOGLE_PLACES_METROS.length} metros × ${PLACES_QUERIES.length} queries`
  );
  console.log(`[run-google-places] Backend: ${INGEST_URL}`);

  const allItems: ScrapedItem[] = [];
  const seenPlaceIds = new Set<string>(); // Cross-query dedup by placeId
  let metroCount = 0;
  let apiErrors = 0;

  for (const metro of GOOGLE_PLACES_METROS) {
    metroCount++;
    let metroTotal = 0;

    for (const queryConfig of PLACES_QUERIES) {
      try {
        const items = await scrapeGooglePlacesQuery(GOOGLE_PLACES_API_KEY, queryConfig, metro);

        for (const item of items) {
          const placeId = item.sourceItemId;
          if (placeId && !seenPlaceIds.has(placeId)) {
            seenPlaceIds.add(placeId);
            allItems.push(item);
            metroTotal++;
          }
        }
      } catch (err) {
        apiErrors++;
        console.error(
          `[run-google-places] Error — metro=${metro} query="${queryConfig.query}":`,
          err instanceof Error ? err.message : String(err)
        );
      }

      // Brief pause between queries within the same metro
      await new Promise((resolve) => setTimeout(resolve, METRO_DELAY_MS));
    }

    console.log(
      `[run-google-places] (${metroCount}/${GOOGLE_PLACES_METROS.length}) ${metro}: +${metroTotal} new (total: ${allItems.length})`
    );
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
    } catch (err) {
      completed++;
      totals.httpErrors++;
      console.error(
        `[run-google-places] (${completed}/${totalBatches}) Batch ${batch.num} threw:`,
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
    `[run-google-places] Posting ${totalBatches} batches with concurrency ${CONCURRENCY}...`
  );
  const t0 = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(
    `[run-google-places] Ingest complete in ${elapsed}s — ${totals.created} created, ${totals.skipped} skipped, ${totals.failed} failed (item-level), ${totals.httpErrors} batch HTTP errors`
  );
}

main().catch((err) => {
  console.error('[run-google-places] Fatal error:', err);
  process.exit(1);
});
