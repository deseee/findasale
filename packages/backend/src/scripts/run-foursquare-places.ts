/**
 * ADR-077: Foursquare v3 Places Business Directory Scraper — GitHub Actions runner
 * Queries Foursquare Places Search API across 100 US metros + 7 Canadian metros × 11 queries.
 * Deduplicates by fsqId, then POSTs results to Railway backend for ingestion.
 *
 * Environment variables (from GitHub secrets):
 * - RAILWAY_BACKEND_URL: https://backend-production-xxx.up.railway.app
 * - INTERNAL_SCRAPER_KEY: shared secret for /api/internal/scraper/ingest
 * - FOURSQUARE_API_KEY: Foursquare v3 API key (also set on Railway)
 * - METRO_BATCH: "1" for metros 0-49, "2" for metros 50-99, empty for all (optional)
 *
 * Usage: npx ts-node src/scripts/run-foursquare-places.ts
 * Cost estimate: Free tier allows 100k monthly searches
 */

import {
  runFoursquareScraper,
} from '../services/scraper/sources/foursquarePlaces';
import { GOOGLE_PLACES_METROS } from '../services/scraper/sources/googlePlaces';
import { ScrapedItem } from '../services/scraper/index';

const INGEST_URL =
  (process.env.RAILWAY_BACKEND_URL || 'http://localhost:3001') + '/api/internal/scraper/ingest';
const SCRAPER_KEY = process.env.INTERNAL_SCRAPER_KEY;

const CANADIAN_METROS = [
  'Toronto, ON',
  'Vancouver, BC',
  'Calgary, AB',
  'Edmonton, AB',
  'Ottawa, ON',
  'Winnipeg, MB',
  'Halifax, NS',
];

const BATCH_SIZE = 25;
const CONCURRENCY = 5;

async function main() {
  if (!SCRAPER_KEY) throw new Error('INTERNAL_SCRAPER_KEY is not set');

  const metroBatchEnv = process.env.METRO_BATCH;
  let batch: 1 | 2 | undefined;
  if (metroBatchEnv === '1') batch = 1;
  else if (metroBatchEnv === '2') batch = 2;

  const allMetros = [...GOOGLE_PLACES_METROS, ...CANADIAN_METROS];
  let targetMetros = allMetros;
  if (batch === 1) {
    targetMetros = allMetros.slice(0, 50);
  } else if (batch === 2) {
    targetMetros = allMetros.slice(50, 100);
  }

  console.log(
    `[run-foursquare-places] Starting: ${targetMetros.length} metros (batch: ${batch ?? 'all'})`
  );
  console.log(`[run-foursquare-places] Backend: ${INGEST_URL}`);

  let allItems: ScrapedItem[] = [];
  try {
    allItems = await runFoursquareScraper(targetMetros, batch);
  } catch (err) {
    console.error('[run-foursquare-places] Scraper error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log(`[run-foursquare-places] Scraping complete — ${allItems.length} unique businesses`);

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
