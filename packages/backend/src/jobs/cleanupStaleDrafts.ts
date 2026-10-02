import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { prepareItemForDeletion, recordItemDeletion } from '../services/itemDeletionService'; // eBay sync hardening (2026-10-01): audited delete path

/**
 * Phase 2B: Cleanup stale draft items job.
 * Runs daily. Deletes Item records where:
 *   - draftStatus = 'DRAFT' (user started rapid-fire tagging but abandoned it)
 *   - createdAt < NOW() - MAX_AGE_HOURS
 *
 * Does NOT delete PENDING_REVIEW items — those have completed AI analysis
 * and the organizer is reviewing them. Only DRAFT items are truly abandoned.
 *
 * eBay sync hardening (2026-10-01): a DRAFT item that carries an eBay link (ebayListingId /
 * ebayOfferId) or a non-removed MarketplaceListingJob is NOT abandoned -- it is attached to a live (or
 * queued) marketplace listing, and deleting it orphaned that listing. Those are skipped and logged.
 * Every remaining deletion goes through the audited path (prepareItemForDeletion -> delete ->
 * ItemDeletionLog with source 'cleanup_stale_drafts').
 *
 * Configurable age via DRAFT_CLEANUP_MAX_AGE_HOURS env var (default: 7 days).
 * In dev, set DRAFT_CLEANUP_MAX_AGE_HOURS=1 for 1-hour cleanup window.
 */

// Configurable max age in hours (default 7 days = 168 hours)
const DRAFT_CLEANUP_MAX_AGE_HOURS = process.env.DRAFT_CLEANUP_MAX_AGE_HOURS
  ? parseInt(process.env.DRAFT_CLEANUP_MAX_AGE_HOURS, 10)
  : 7 * 24; // 7 days

export const cleanupStaleDrafts = async (): Promise<void> => {
  try {
    // Calculate cutoff time: NOW() - MAX_AGE_HOURS
    const cutoffTime = new Date(Date.now() - DRAFT_CLEANUP_MAX_AGE_HOURS * 60 * 60 * 1000);

    // Find all DRAFT items older than cutoff
    const candidateDrafts = await prisma.item.findMany({
      where: {
        draftStatus: 'DRAFT',
        createdAt: { lt: cutoffTime },
      },
      select: {
        id: true,
        saleId: true,
        title: true,
        organizerId: true,
        ebayListingId: true,
        ebayOfferId: true,
        // Any non-removed job means a marketplace listing may exist or be queued.
        marketplaceJobs: {
          where: { status: { not: 'REMOVED' } },
          select: { id: true },
          take: 1,
        },
      },
    });

    // Skip drafts attached to a marketplace listing (see header comment).
    const protectedDrafts = candidateDrafts.filter(
      (d) => d.ebayListingId || d.ebayOfferId || d.marketplaceJobs.length > 0
    );
    const staleDrafts = candidateDrafts.filter((d) => !protectedDrafts.includes(d));
    if (protectedDrafts.length > 0) {
      console.warn(
        `[cleanupStaleDrafts] Skipping ${protectedDrafts.length} stale draft(s) linked to a marketplace listing: ` +
          protectedDrafts.map((d) => d.id).join(', ')
      );
    }

    if (staleDrafts.length === 0) {
      console.log(`[cleanupStaleDrafts] No stale drafts found (cutoff: ${cutoffTime.toISOString()})`);
      return;
    }

    // Log all deletions for audit trail
    const deletionLog = staleDrafts.map(item => ({
      itemId: item.id,
      saleId: item.saleId ?? 'inventory',
      title: item.title,
    }));

    console.log(`[cleanupStaleDrafts] Deleting ${staleDrafts.length} stale draft(s):`);
    deletionLog.forEach(log => {
      console.log(`  - Item ${log.itemId} (Sale ${log.saleId}): "${log.title}"`);
    });

    // Delete the stale DRAFT items through the audited path: withdraw (self-guarding no-op for a
    // never-listed draft) + snapshot, delete, then one ItemDeletionLog row each.
    let deletedCount = 0;
    for (const draft of staleDrafts) {
      const snapshot = await prepareItemForDeletion(draft.id, { organizerId: draft.organizerId ?? null });
      const res = await prisma.item.deleteMany({ where: { id: draft.id } });
      if (res.count > 0) {
        deletedCount += res.count;
        await recordItemDeletion(snapshot, 'cleanup_stale_drafts', null);
      }
    }
    const deleteResult = { count: deletedCount };

    console.log(
      `[cleanupStaleDrafts] Successfully deleted ${deleteResult.count} stale draft item(s). ` +
      `Cutoff time: ${cutoffTime.toISOString()} (${DRAFT_CLEANUP_MAX_AGE_HOURS} hours ago)`
    );
  } catch (error) {
    console.error('[cleanupStaleDrafts] Error:', error);
  }
};

/**
 * Register the cleanup cron job.
 * Schedule: Daily at 2 AM UTC (configurable via env var if needed).
 * Cron pattern: '5 2 * * *' = every day at 02:00 UTC
 */
export const scheduleCleanupCron = (): void => {
  cron.schedule('5 2 * * *', cronGuard({ jobName: 'cleanupStaleDrafts' }, async () => {
    console.log('[cleanupStaleDrafts] Running scheduled cleanup job...');
    await cleanupStaleDrafts();
  }));
  console.log('[cleanupStaleDrafts] Scheduled cleanup job registered (daily at 02:00 UTC)');
};
