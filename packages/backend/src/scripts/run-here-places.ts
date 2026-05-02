/**
 * ADR-077: HERE Places Business Directory Scraper — GitHub Actions runner
 * Queries HERE Discover API across 100 US metros + 7 Canadian metros × 11 queries.
 * Deduplicates by placeId, then POSTs results to Railway backend for ingestion.
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

  const allMetros = [...GOOGLE_PLACES_METROS, ...CANADIAN_METROS];
  console.log(`[run-here-places] Starting: ${allMetros.length} metros`);
  console.log(`[run-here-places] Backend: ${INGEST_URL}`);

  let allItems: ScrapedItem[] = [];
  try {
    allItems = await runHEREPlacesScraper(allMetros);
  } catch (err) {
    console.error('[run-here-places] Scraper error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log(`[run-here-places] Scraping complete — ${allItems.length} unique businesses`);

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
    } catch (err) {
      completed++;
      totals.httpErrors++;
      console.error(
        `[run-here-places] (${completed}/${totalBatches}) Batch ${batch.num} threw:`,
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
