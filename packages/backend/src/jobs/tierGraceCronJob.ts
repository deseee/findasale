/**
 * Tier Grace Period Cron Job
 * Runs daily to check for expired grace periods and finalize downgrades, and to finish
 * scheduled cancellations for organizers without a Square billing schedule.
 */

import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { prisma } from '../lib/prisma';
import { finalizeGracePeriod, downgradeScheduledCancelFrozenOrganizers } from '../services/tierGraceService';

/**
 * Start the tier grace cron job
 * Runs daily at 02:00 UTC
 */
export function startTierGraceCron() {
  cron.schedule('0 2 * * *', cronGuard({ jobName: 'tierGraceCronJob' }, async () => {
    console.log('[tierGraceCron] Checking for expired grace periods...');
    try {
      const expired = await prisma.organizer.findMany({
        where: {
          graceEndAt: { lte: new Date() },
          graceTierBefore: { not: null }
        },
        select: { id: true }
      });

      console.log(`[tierGraceCron] Found ${expired.length} expired grace periods`);

      for (const org of expired) {
        try {
          await finalizeGracePeriod(org.id);
          console.log(`[tierGraceCron] Finalized grace for organizer ${org.id}`);
        } catch (err) {
          console.error(`[tierGraceCron] Failed to finalize ${org.id}:`, err);
        }
      }
    } catch (err) {
      console.error('[tierGraceCron] Fatal error:', err);
    }

    // 2026-09-29: end-of-period downgrade for organizers who scheduled a cancellation without a
    // Square billing schedule (frozen Stripe subscribers, DB-only cancel). Runs after the grace
    // pass and never blocks it: its own try/catch, and the grace pass above has already finished.
    try {
      const cancelled = await downgradeScheduledCancelFrozenOrganizers();
      if (cancelled.checked > 0) {
        console.log(`[tierGraceCron] Scheduled cancellations due: ${cancelled.checked}, downgraded: ${cancelled.downgraded}`);
      }
    } catch (err) {
      console.error('[tierGraceCron] Scheduled-cancellation pass failed:', err);
    }
  }));

  console.log('[tierGraceCron] Started');
}
