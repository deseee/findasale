import cron from 'node-cron';
import { prisma } from '../lib/prisma';

/**
 * Phase 2B: Cleanup stale draft items job.
 * Runs daily. Deletes Item records where:
 *   - draftStatus = 'DRAFT' (user started rapid-fire tagging but abandoned it)
 *   - createdAt < NOW() - MAX_AGE_HOURS
 *
 * Does NOT delete PENDING_REVIEW items — those have completed AI analysis
 * and the organizer is reviewing them. Only DRAFT items are truly abandoned.
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
    const staleDrafts = await prisma.item.findMany({
      where: {
        draftStatus: 'DRAFT',
        createdAt: { lt: cutoffTime },
      },
      select: {
        id: true,
        saleId: true,
        title: true,
      },
    });

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

    // Delete the stale DRAFT items
    const deleteResult = await prisma.item.deleteMany({
      where: {
        id: { in: staleDrafts.map(d => d.id) },
      },
    });

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
 * Cron pattern: '0 2 * * *' = every day at 02:00 UTC
 */
export const scheduleCleanupCron = (): void => {
  cron.schedule('0 2 * * *', () => {
    console.log('[cleanupStaleDrafts] Running scheduled cleanup job...');
    cleanupStaleDrafts();
  });
  console.log('[cleanupStaleDrafts] Scheduled cleanup job registered (daily at 02:00 UTC)');
};
