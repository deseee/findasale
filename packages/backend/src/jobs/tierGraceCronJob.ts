/**
 * Tier Grace Period Cron Job
 * Runs daily to check for expired grace periods and finalize downgrades
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { finalizeGracePeriod } from '../services/tierGraceService';

/**
 * Start the tier grace cron job
 * Runs daily at 02:00 UTC
 */
export function startTierGraceCron() {
  cron.schedule('0 2 * * *', async () => {
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
  });

  console.log('[tierGraceCron] Started');
}
