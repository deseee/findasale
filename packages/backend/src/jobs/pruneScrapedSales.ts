/**
 * pruneScrapedSales.ts — Stale scraped ENDED-sale prune (Railway volume reclaim)
 *
 * ADR: claude_docs/feature-notes/ADR-scraped-sale-prune-2026-07-05.md
 *
 * Hard-deletes ENDED sales that belong to unclaimed, unmanaged (scraped) organizers
 * and whose endDate is older than CUTOFF_DAYS. These pages are already `noindex`
 * (S1071) and excluded from the sitemap (PUBLISHED-only), so deleting them removes
 * nothing indexed. Organizer rows are NEVER touched here.
 *
 * SAFETY (data-sensitive — read before editing):
 * - Predicate is narrow and keep-if-claimed: only status=ENDED AND
 *   organizer.isClaimed=false AND organizer.isUnmanagedListing=true AND aged past cutoff.
 * - AffiliateLink.sale is the ONLY onDelete:Restrict relation on Sale; it is deleted
 *   first inside each batch transaction so the Sale delete never blocks. Every other
 *   Sale relation is onDelete:Cascade or SetNull (verified against schema.prisma).
 * - Recurring cron is gated by PRUNE_ENABLED and capped at RECURRING_MAX_DELETES so a
 *   predicate regression can never empty the table in one run.
 */

import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { prisma } from '../lib/prisma';
import { triggerRevalidation, citySlugFromCityState } from '../services/revalidationService';

const CUTOFF_DAYS = 15;
const BATCH_SIZE = 500;
const RECURRING_MAX_DELETES = 5000;
const SLEEP_MS = 100;
// ISR-write overage fix (2026-07-16 — see claude_docs/STATE.md Blocked Queue
// "Vercel Free-Tier Usage Caps"): this job used to fire one triggerRevalidation()
// HTTP call PER BATCH (up to 10x/run at RECURRING_MAX_DELETES=5000/BATCH_SIZE=500,
// unbounded for the no-cap backfill script), with no dedup of city slugs ACROSS
// batches and no cap on how many distinct cities could ride a single call --
// every city slug in every call becomes one res.revalidate() = one Vercel ISR
// write. That made this job an unbatched, unbounded ISR-write source that the
// 2026-07-15 scraper revalidation fix (ADR 2026-07-11 batching, capped+deduped
// at MAX_SCRAPER_REVALIDATION_CITY_PATHS) never touched. Fixed to mirror that
// pattern: accumulate touch counts for the whole run, fire once at the end,
// capped at the highest-value (most sales pruned) cities.
const PRUNE_MAX_REVALIDATION_CITY_PATHS = 25;

export interface PruneScrapedSalesOptions {
  dryRun: boolean;
  maxDeletes?: number;
}

export interface PruneScrapedSalesResult {
  qualifying: number;
  deleted: number;
  batches: number;
  durationMs: number;
  dryRun: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function cutoffDate(): Date {
  return new Date(Date.now() - CUTOFF_DAYS * 24 * 60 * 60 * 1000);
}

// ENDED scraped sales on unclaimed, unmanaged organizers, aged past the cutoff.
function prunableWhere(cutoff: Date) {
  return {
    status: 'ENDED',
    endDate: { lt: cutoff },
    organizer: { is: { isClaimed: false, isUnmanagedListing: true } },
  };
}

export async function pruneScrapedSales(
  opts: PruneScrapedSalesOptions
): Promise<PruneScrapedSalesResult> {
  const startedAt = Date.now();
  const cutoff = cutoffDate();
  const where = prunableWhere(cutoff);

  const qualifying = await prisma.sale.count({ where });
  console.log(
    `[prune-scraped-sales] cutoff=${cutoff.toISOString()} qualifying=${qualifying} ` +
      `dryRun=${opts.dryRun} maxDeletes=${opts.maxDeletes ?? 'none'}`
  );

  if (opts.dryRun) {
    const sample = await prisma.sale.findMany({
      where,
      select: { id: true, title: true, endDate: true },
      take: 10,
      orderBy: { endDate: 'asc' },
    });
    console.log(
      '[prune-scraped-sales] DRY RUN — no rows deleted. Sample:',
      JSON.stringify(sample, null, 2)
    );
    return { qualifying, deleted: 0, batches: 0, durationMs: Date.now() - startedAt, dryRun: true };
  }

  let deleted = 0;
  let batches = 0;
  const cap = opts.maxDeletes;
  // Run-scoped (not per-batch) so revalidation fires once for the whole run,
  // deduped and capped, instead of once per 500-row batch.
  const revalidationCityTouchCounts = new Map<string, number>();

  // Deleting rows removes them from the predicate set, so each iteration can simply
  // fetch the next page of qualifying ids — no offset required.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let take = BATCH_SIZE;
    if (cap !== undefined) {
      const remaining = cap - deleted;
      if (remaining <= 0) break;
      if (remaining < take) take = remaining;
    }

    const rows = await prisma.sale.findMany({
      where,
      select: { id: true, city: true, state: true },
      take,
      orderBy: { endDate: 'asc' },
    });
    if (rows.length === 0) break;

    const ids = rows.map((r) => r.id);

    await prisma.$transaction(async (tx) => {
      // Only onDelete:Restrict relation on Sale — clear first so the delete never blocks.
      await tx.affiliateLink.deleteMany({ where: { saleId: { in: ids } } });
      await tx.sale.deleteMany({ where: { id: { in: ids } } });
    });

    // On-demand revalidation (ADR 2026-07-11, fixed 2026-07-16): pruned sales' own
    // /sales/[id] pages will 404 on next visit regardless (row is gone) — no need to
    // revalidate those. The city listing pages that referenced them do need a refresh
    // so the pruned sales disappear from /city/[slug] before the 24h timer would have
    // caught it -- but tally touches here and fire the actual HTTP call once for the
    // whole run (see revalidationCityTouchCounts flush below), not once per batch.
    for (const row of rows) {
      const slug = citySlugFromCityState(row.city, row.state);
      if (!slug) continue;
      revalidationCityTouchCounts.set(slug, (revalidationCityTouchCounts.get(slug) ?? 0) + 1);
    }

    deleted += ids.length;
    batches += 1;
    if (batches % 20 === 0) {
      console.log(`[prune-scraped-sales] progress deleted=${deleted} batches=${batches}`);
    }
    await sleep(SLEEP_MS);
  }

  // Fire once for the whole run: dedup is inherent to the Map, cap to the
  // highest-value (most sales pruned this run) cities so this job can never
  // become an unbounded ISR-write source again regardless of batch count.
  const touchedCities = Array.from(revalidationCityTouchCounts.entries());
  if (touchedCities.length > 0) {
    const citySlugs = touchedCities
      .sort((a, b) => b[1] - a[1])
      .slice(0, PRUNE_MAX_REVALIDATION_CITY_PATHS)
      .map(([slug]) => slug);
    triggerRevalidation(citySlugs.map((slug) => `/city/${slug}`)).catch((err) => {
      console.error('[prune-scraped-sales] revalidation trigger failed:', err);
    });
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `[prune-scraped-sales] DONE deleted=${deleted} batches=${batches} ` +
      `citiesTouched=${touchedCities.length} citiesRevalidated=${Math.min(touchedCities.length, PRUNE_MAX_REVALIDATION_CITY_PATHS)} ` +
      `durationMs=${durationMs}`
  );
  return { qualifying, deleted, batches, durationMs, dryRun: false };
}

/**
 * Daily recurring prune at 04:00 server time (after the 03:00 backup + scraper settle).
 * No-ops unless PRUNE_ENABLED === 'true'. Capped at RECURRING_MAX_DELETES per run.
 */
export function scheduleScrapedSalePruneCron(): void {
  cron.schedule(
    '0 4 * * *',
    cronGuard({ jobName: 'pruneScrapedSales' }, async () => {
      if (process.env.PRUNE_ENABLED !== 'true') {
        console.log('[prune-scraped-sales] PRUNE_ENABLED not "true" — skipping run.');
        return;
      }
      await pruneScrapedSales({ dryRun: false, maxDeletes: RECURRING_MAX_DELETES });
    })
  );
  console.log('[prune-scraped-sales] scheduled daily at 04:00 (gated by PRUNE_ENABLED).');
}
