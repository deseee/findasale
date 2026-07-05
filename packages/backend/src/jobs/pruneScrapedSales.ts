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

const CUTOFF_DAYS = 15;
const BATCH_SIZE = 500;
const RECURRING_MAX_DELETES = 5000;
const SLEEP_MS = 100;

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
      select: { id: true },
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

    deleted += ids.length;
    batches += 1;
    if (batches % 20 === 0) {
      console.log(`[prune-scraped-sales] progress deleted=${deleted} batches=${batches}`);
    }
    await sleep(SLEEP_MS);
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `[prune-scraped-sales] DONE deleted=${deleted} batches=${batches} durationMs=${durationMs}`
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
