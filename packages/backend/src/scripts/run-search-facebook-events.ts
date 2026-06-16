/**
 * ADR-073: Standalone Facebook Events search scraper for GitHub Actions
 * Runs outside Express server, POSTs results to Railway backend
 *
 * Environment variables (from GitHub secrets):
 * - RAILWAY_BACKEND_URL:  https://backend-production-xxx.up.railway.app
 * - INTERNAL_SCRAPER_KEY: shared secret for /api/internal/scraper/ingest auth
 * - SEARLO_API_KEY:       PRIMARY search API (Searlo SERP, geo-accurate, $0.30/1k)
 * - BRAVE_API_KEY:        error-only fallback search API (free tier with attribution)
 * - SCALESERP_API_KEY:    error-only fallback search API (125 free/month + paid)
 *
 * NOTE: Serper.dev is no longer used as a fallback. Searlo 0-result responses mean
 * the market has no events — not a Searlo failure. Calling Serper on 0-result metros
 * burns paid credits finding the same empty result. Brave + ScaleSerp fire on errors only.
 * - FB_EVENTS_ORGANIZER_ID: optional — backend falls back to system organizer
 *
 * Usage: npx ts-node src/scripts/run-search-facebook-events.ts
 */

import { Resend } from 'resend';
import {
  scrapeFacebookEventsForMetro,
  SEARCH_METROS,
  getMetrosForToday,
  getShardIndexForDate,
  SHARD_COUNT,
} from '../services/scraper/sources/search-facebook-events';
import { jitterDelay } from '../services/scraper/userAgents';

const INGEST_URL =
  (process.env.RAILWAY_BACKEND_URL || 'http://localhost:3001') +
  '/api/internal/scraper/ingest';
const SCRAPER_KEY     = process.env.INTERNAL_SCRAPER_KEY;
const SEARLO_KEY      = process.env.SEARLO_API_KEY;
const BRAVE_KEY       = process.env.BRAVE_API_KEY;
const SCALESERP_KEY   = process.env.SCALESERP_API_KEY;
// SERPER_KEY removed — Serper is no longer used. See comment at top.
const ORGANIZER_ID    = process.env.FB_EVENTS_ORGANIZER_ID;

/**
 * Send an out-of-band alert via Resend (matches gmailHealthCron.ts pattern).
 * Used to surface silent failures — e.g. all search API keys missing/expired.
 */
async function sendKeyHealthAlert(subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[run-fb-events] RESEND_API_KEY not set — cannot send health alert');
    return;
  }
  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'FindA.Sale Alerts <alerts@finda.sale>',
      to: process.env.QUOTA_ALERT_EMAIL || 'deseee@gmail.com',
      subject,
      html,
    });
    console.error(`[run-fb-events] Health alert sent: ${subject}`);
  } catch (err) {
    console.error('[run-fb-events] Failed to send Resend health alert:', err);
  }
}

async function main() {
  if (!SCRAPER_KEY) {
    throw new Error('INTERNAL_SCRAPER_KEY environment variable is not set');
  }
  // Searlo is the primary key; the rest are fallbacks — all optional individually.
  if (!SEARLO_KEY)    console.warn('[run-fb-events] No SEARLO_API_KEY — primary engine unavailable, will use Brave/ScaleSerp error fallbacks');
  if (!BRAVE_KEY)     console.warn('[run-fb-events] No BRAVE_API_KEY — no Brave error-fallback');
  if (!SCALESERP_KEY) console.warn('[run-fb-events] No SCALESERP_API_KEY — no ScaleSerp error-fallback');
  if (!ORGANIZER_ID)  console.log('[run-fb-events] No FB_EVENTS_ORGANIZER_ID — will use system organizer');

  // If ALL search keys are missing, the scraper produces zero results and fails
  // silently. Surface this loudly via console + Resend so it doesn't go stale.
  if (!SEARLO_KEY && !BRAVE_KEY && !SCALESERP_KEY) {
    console.error(
      '[run-fb-events] 🔴 ALL search API keys missing (SEARLO / BRAVE / SCALESERP) — ' +
      'Facebook Events import will produce ZERO results. This is a silent failure.'
    );
    await sendKeyHealthAlert(
      '🔴 FB Events import DEAD — all search API keys missing',
      `
        <p><strong>🔴 CRITICAL:</strong> The Facebook Events import has no usable search API key.</p>
        <p>All three keys are absent: <code>SEARLO_API_KEY</code>, <code>BRAVE_API_KEY</code>, and <code>SCALESERP_API_KEY</code>.</p>
        <p>The scraper will produce <strong>zero results</strong> until at least one key is restored — the import is effectively dead and failing silently.</p>
        <p><strong>To fix:</strong> Restore or renew at least one search API key in the GitHub Actions secrets / Railway env vars.</p>
        <p style="color:#666;font-size:12px">FindA.Sale · run-search-facebook-events.ts</p>
      `
    );
  }

  // METRO SELECTION: by default we run only TODAY'S shard (~1/SHARD_COUNT of the
  // full canonical list) so each daily run stays small and fast. Set
  // FB_EVENTS_ALL_METROS=true to bypass sharding and run the entire list — used
  // for manual backfills via workflow_dispatch.
  const runAll = process.env.FB_EVENTS_ALL_METROS === 'true';
  const metros = runAll ? SEARCH_METROS : getMetrosForToday();
  const shardIndex = getShardIndexForDate();

  console.log(
    runAll
      ? `[run-fb-events] Starting — FULL list (FB_EVENTS_ALL_METROS=true): ` +
        `${metros.length}/${SEARCH_METROS.length} metros, ingest URL: ${INGEST_URL}`
      : `[run-fb-events] Starting — shard ${shardIndex + 1}/${SHARD_COUNT}: ` +
        `${metros.length}/${SEARCH_METROS.length} metros, ingest URL: ${INGEST_URL}`
  );

  const allItems: any[] = [];
  const seenIds = new Set<string>();
  let metroSuccess = 0;
  let metroFailed = 0;

  // Scrape each metro sequentially with jitter to stay within rate limits
  for (const metro of metros) {
    try {
      const items = await scrapeFacebookEventsForMetro(metro, {
        searloKey:    SEARLO_KEY,
        braveKey:     BRAVE_KEY,
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

    // Inter-metro pacing for Searlo is handled by its module-level throttle
    // (per-second + per-minute caps); keep only a tiny jitter to avoid bursting
    // the non-Searlo fallback engines.
    await jitterDelay(100, 300);
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
