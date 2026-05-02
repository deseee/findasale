/**
 * OSM Overpass Business Directory Scraper — GitHub Actions runner
 * Queries Overpass API across metros to discover secondhand/resale businesses.
 * Deduplicates by OSM ID, then POSTs results to Railway backend for ingestion.
 *
 * Environment variables (from GitHub secrets):
 * - RAILWAY_BACKEND_URL: https://backend-production-xxx.up.railway.app
 * - INTERNAL_SCRAPER_KEY: shared secret for /api/internal/scraper/ingest
 *
 * No API key required — OSM Overpass is free and open.
 *
 * Usage: npx ts-node src/scripts/run-osm-overpass.ts
 * Cost estimate: ~$0 — OSM Overpass is free and open, no API key required
 */

import { scrapeOSMMetro, OSM_METROS } from '../services/scraper/sources/osmOverpass';
import { ScrapedItem } from '../services/scraper/index';

const INGEST_URL =
  (process.env.RAILWAY_BACKEND_URL || 'http://localhost:3001') + '/api/internal/scraper/ingest';
const SCRAPER_KEY = process.env.INTERNAL_SCRAPER_KEY;

const BATCH_SIZE = 25;
const CONCURRENCY = 3;
/** Delay between metros to respect Overpass server load */
const METRO_DELAY_MS = 500;

async function main() {
  if (!SCRAPER_KEY) throw new Error('INTERNAL_SCRAPER_KEY is not set');

  console.log(`[run-osm-overpass] Starting: ${OSM_METROS.length} metros`);
  console.log(`[run-osm-overpass] Backend: ${INGEST_URL}`);

  const allItems: ScrapedItem[] = [];
  const seenIds = new Set<string>(); // Cross-metro dedup by sourceItemId (OSM ID)
  let metroCount = 0;
  let queryErrors = 0;

  for (const metro of OSM_METROS) {
    metroCount++;

    try {
      const items = await scrapeOSMMetro(metro);
      let metroNew = 0;

      for (const item of items) {
        const osmId = item.sourceItemId;
        if (osmId && !seenIds.has(osmId)) {
          seenIds.add(osmId);
          allItems.push(item);
          metroNew++;
        }
      }

      console.log(
        `[run-osm-overpass] (${metroCount}/${OSM_METROS.length}) ${metro}: +${metroNew} new (total: ${allItems.length})`
      );
    } catch (err) {
      queryErrors++;
      console.error(
        `[run-osm-overpass] Error — metro=${metro}:`,
        err instanceof Error ? err.message : String(err)
      );
    }

    // Delay between metros
    await new Promise((resolve) => setTimeout(resolve, METRO_DELAY_MS));
  }

  console.log(
    `[run-osm-overpass] Scraping complete — ${allItems.length} unique businesses, ${queryErrors} query errors`
  );

  if (allItems.length === 0) {
    console.log('[run-osm-overpass] No items to ingest — exiting');
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
          `[run-osm-overpass] (${completed}/${totalBatches}) Batch ${batch.num} HTTP ${response.status}: ${text.slice(0, 200)}`
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
        `[run-osm-overpass] (${completed}/${totalBatches}) Batch ${batch.num} — ${result.stats.created}c / ${result.stats.skipped}s / ${result.stats.failed}f`
      );
    } catch (err) {
      completed++;
      totals.httpErrors++;
      console.error(
        `[run-osm-overpass] (${completed}/${totalBatches}) Batch ${batch.num} threw:`,
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
    `[run-osm-overpass] Posting ${totalBatches} batches with concurrency ${CONCURRENCY}...`
  );
  const t0 = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(
    `[run-osm-overpass] Ingest complete in ${elapsed}s — ${totals.created} created, ${totals.skipped} skipped, ${totals.failed} failed (item-level), ${totals.httpErrors} batch HTTP errors`
  );
}

main().catch((err) => {
  console.error('[run-osm-overpass] Fatal error:', err);
  process.exit(1);
});
