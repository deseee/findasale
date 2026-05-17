/**
 * ADR-073: Standalone Facebook Events search scraper for GitHub Actions
 * Runs outside Express server, POSTs results to Railway backend
 *
 * Environment variables (from GitHub secrets):
 * - RAILWAY_BACKEND_URL:  https://backend-production-xxx.up.railway.app
 * - INTERNAL_SCRAPER_KEY: shared secret for /api/internal/scraper/ingest auth
 * - BRAVE_API_KEY:        primary search API (free tier with attribution)
 * - SERPER_API_KEY:       fallback search API (paid credits)
 * - SCALESERP_API_KEY:    second fallback search API (paid credits)
 * - FB_EVENTS_ORGANIZER_ID: optional — backend falls back to system organizer
 *
 * Usage: npx ts-node src/scripts/run-search-facebook-events.ts
 */

import {
  scrapeFacebookEventsForMetro,
  SEARCH_METROS,
} from '../services/scraper/sources/search-facebook-events';
import { jitterDelay } from '../services/scraper/userAgents';

const INGEST_URL =
  (process.env.RAILWAY_BACKEND_URL || 'http://localhost:3001') +
  '/api/internal/scraper/ingest';
const SCRAPER_KEY     = process.env.INTERNAL_SCRAPER_KEY;
const BRAVE_KEY       = process.env.BRAVE_API_KEY;
const SERPER_KEY      = process.env.SERPER_API_KEY;
const SCALESERP_KEY   = process.env.SCALESERP_API_KEY;
const ORGANIZER_ID    = process.env.FB_EVENTS_ORGANIZER_ID;

async function main() {
  if (!SCRAPER_KEY) {
    throw new Error('INTERNAL_SCRAPER_KEY environment variable is not set');
  }
  // Brave key is optional but recommended — fallbacks available
  if (!BRAVE_KEY)     console.warn('[run-fb-events] No BRAVE_API_KEY — will use Serper/ScaleSerp only');
  if (!SERPER_KEY)    console.warn('[run-fb-events] No SERPER_API_KEY — Brave/ScaleSerp only, no Serper backup');
  if (!SCALESERP_KEY) console.warn('[run-fb-events] No SCALESERP_API_KEY — no ScaleSerp backup');
  if (!ORGANIZER_ID)  console.log('[run-fb-events] No FB_EVENTS_ORGANIZER_ID — will use system organizer');

  console.log(
    `[run-fb-events] Starting — ${SEARCH_METROS.length} metros, ingest URL: ${INGEST_URL}`
  );

  const allItems: any[] = [];
  const seenIds = new Set<string>();
  let metroSuccess = 0;
  let metroFailed = 0;

  // Scrape each metro sequentially with jitter to stay within rate limits
  for (const metro of SEARCH_METROS) {
    try {
      const items = await scrapeFacebookEventsForMetro(metro, {
        braveKey:     BRAVE_KEY,
        serperKey:    SERPER_KEY,
        scaleSerpKey: SCALESERP_KEY,
      });

      for (const item of items) {
        if (item.sourceItemId && !seenIds.has(item.sourceItemId)) {
          seenIds.add(item.sourceItemId);
          allItems.push(item);
        }
      }

      metroSuccess++;
      console.log(
        `[run-fb-events] ${metro.city}, ${metro.state}: ${items.length} items ` +
        `(${allItems.length} total)`
      );
    } catch (err) {
      metroFailed++;
      console.error(
        `[run-fb-events] Failed for ${metro.city}, ${metro.state}:`,
        err instanceof Error ? err.message : String(err)
      );
    }

    // Brief jitter between metros to avoid hammering search APIs
    await jitterDelay(500, 1500);
  }

  console.log(
    `[run-fb-events] Scraping done — ${metroSuccess} OK, ${metroFailed} failed, ` +
    `${allItems.length} items collected`
  );

  if (allItems.length === 0) {
    console.log('[run-fb-events] Nothing to ingest — exiting');
    return;
  }

  // POST to Railway in batches of 25 with a 5-worker pool
  const batchSize  = 25;
  const CONCURRENCY = 5;

  const batches: { num: number; items: any[] }[] = [];
  for (let i = 0; i < allItems.length; i += batchSize) {
    batches.push({
      num: Math.floor(i / batchSize) + 1,
      items: allItems.slice(i, i + batchSize),
    });
  }

  const totalBatches = batches.length;
  const totals = { created: 0, updated: 0, skipped: 0, failed: 0, httpErrors: 0 };
  let completed = 0;

  async function postOne(batch: { num: number; items: any[] }): Promise<void> {
    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        const res = await fetch(INGEST_URL, {
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

        if (!res.ok) {
          if ((res.status === 502 || res.status === 503) && attempt < MAX_RETRIES - 1) {
            attempt++;
            const delayMs = Math.pow(2, attempt) * 1000;
            console.log(
              `[run-fb-events] (${completed}/${totalBatches}) Batch ${batch.num} ` +
              `HTTP ${res.status} — retrying in ${delayMs}ms (attempt ${attempt}/${MAX_RETRIES})`
            );
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }

          const err = await res.text();
          totals.httpErrors++;
          console.error(
            `[run-fb-events] (${completed}/${totalBatches}) Batch ${batch.num} ` +
            `HTTP ${res.status}: ${err.slice(0, 200)}`
          );
          return;
        }

        const result = (await res.json()) as {
          stats: { created: number; updated: number; skipped: number; failed: number };
        };
        totals.created  += result.stats.created;
        totals.updated  += result.stats.updated;
        totals.skipped  += result.stats.skipped;
        totals.failed   += result.stats.failed;
        console.log(
          `[run-fb-events] (${completed}/${totalBatches}) Batch ${batch.num} — ` +
          `${result.stats.created}c / ${result.stats.skipped}s / ${result.stats.failed}f`
        );
        return;
      } catch (err) {
        if (attempt < MAX_RETRIES - 1) {
          attempt++;
          const delayMs = Math.pow(2, attempt) * 1000;
          console.log(
            `[run-fb-events] (${completed}/${totalBatches}) Batch ${batch.num} ` +
            `network error — retrying in ${delayMs}ms`
          );
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        completed++;
        totals.httpErrors++;
        console.error(
          `[run-fb-events] (${completed}/${totalBatches}) Batch ${batch.num} threw:`,
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
      await postOne(next);
    }
  }

  console.log(`[run-fb-events] Posting ${totalBatches} batches (concurrency ${CONCURRENCY})...`);
  const start = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(
    `[run-fb-events] Done in ${elapsed}s — ` +
    `${totals.created} created, ${totals.skipped} skipped, ` +
    `${totals.failed} failed, ${totals.httpErrors} batch HTTP errors`
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('[run-fb-events] Fatal:', err);
    process.exit(1);
  });
