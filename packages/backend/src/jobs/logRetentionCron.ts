import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { prisma } from '../index';

/**
 * logRetentionCron.ts — Operational-log retention sweep
 *
 * Deletes rows older than RETENTION_DAYS (60) from a small, explicit allow-list of
 * OPERATIONAL-LOG tables only. These tables accumulate one row per scrape/crawl/outreach
 * event and grow unbounded; without pruning they degrade query performance and inflate
 * storage. None of these tables hold user, sale, item, purchase, payout, or any other
 * business/financial data.
 *
 * SAFETY (data-sensitive — read before editing):
 * - The deletion target list is HARD-CODED below and intentionally narrow. It must ONLY
 *   ever contain operational-log tables. Never add user/sale/item/purchase/payout/order/
 *   message/review tables to this list.
 * - Each entry uses `createdAt < cutoff`. Every model in the list was schema-verified to
 *   have a `createdAt` field (schema.prisma): ScrapedSalesJob, OutreachAuditLog,
 *   DirectoryCrawlLog. If a future log model lacks `createdAt`, it must be skipped, not
 *   force-fit to another timestamp column.
 * - deleteMany with a `createdAt` lower-bound predicate can never touch recent rows or
 *   rows in any unlisted table.
 *
 * Runs daily at 03:20 UTC (staggered off the 03:00 webhook-prune job to avoid
 * simultaneous write load).
 */

const RETENTION_DAYS = 60;

export function scheduleLogRetentionCron(): void {
  // Daily at 03:20 UTC
  cron.schedule(
    '20 3 * * *',
    cronGuard({ jobName: 'logRetentionCron' }, async () => {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
      console.log(
        `[log-retention] Starting operational-log retention sweep (cutoff: ${cutoff.toISOString()}, retention: ${RETENTION_DAYS}d)`
      );

      // ── HARD-CODED OPERATIONAL-LOG ALLOW-LIST ────────────────────────────────
      // Each task deletes rows with createdAt < cutoff from ONE operational-log
      // table. Do NOT add business/user/financial models here. All three models
      // were confirmed to have a `createdAt` field before this file was written.
      const tasks: Array<{ name: string; run: () => Promise<{ count: number }> }> = [
        {
          name: 'ScrapedSalesJob',
          run: () =>
            prisma.scrapedSalesJob.deleteMany({
              where: { createdAt: { lt: cutoff } },
            }),
        },
        {
          name: 'OutreachAuditLog',
          run: () =>
            prisma.outreachAuditLog.deleteMany({
              where: { createdAt: { lt: cutoff } },
            }),
        },
        {
          name: 'DirectoryCrawlLog',
          run: () =>
            prisma.directoryCrawlLog.deleteMany({
              where: { createdAt: { lt: cutoff } },
            }),
        },
      ];

      let totalDeleted = 0;
      for (const task of tasks) {
        try {
          const { count } = await task.run();
          totalDeleted += count;
          console.log(`[log-retention] ${task.name}: deleted ${count} rows older than ${RETENTION_DAYS}d`);
        } catch (err: any) {
          // Isolate per-table failures so one bad table can't abort the whole sweep.
          // cronGuard still records the overall job, but we keep going for the rest.
          console.error(`[log-retention] ${task.name}: deletion failed — ${err?.message || err}`);
        }
      }

      console.log(`[log-retention] Sweep complete — ${totalDeleted} total rows deleted across ${tasks.length} log tables`);
    })
  );

  console.log('[log-retention] Registered operational-log retention cron (daily at 03:20 UTC, 60-day retention)');
}
