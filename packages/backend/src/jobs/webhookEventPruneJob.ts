import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { prisma } from '../index';

/**
 * Webhook Event Pruning Cron
 *
 * Maintains database health by removing old processed webhook events that are older than 30 days.
 * The processedWebhookEvent table grows unbounded and needs periodic cleanup to maintain performance.
 *
 * Runs daily at 3:00 AM UTC
 */

export function scheduleWebhookEventPruneJob(): void {
  // Daily at 3:00 AM UTC
  cron.schedule('0 3 * * *', cronGuard({ jobName: 'webhookEventPruneJob' }, async () => {
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      console.log('[webhook-prune] Starting webhook event pruning job (cutoff:', cutoff.toISOString(), ')');

      const { count } = await prisma.processedWebhookEvent.deleteMany({
        where: {
          processedAt: { lt: cutoff },
        },
      });

      if (count > 0) {
        console.log(`[webhook-prune] Deleted ${count} webhook events older than 30 days`);
      } else {
        console.log('[webhook-prune] No webhook events to delete');
      }

      console.log('[webhook-prune] Webhook event pruning job completed');
    } catch (err: any) {
      console.error('[webhook-prune] Error in webhook event pruning cron:', err?.message || err);
      // Continue — don't let cron job crash
    }
  }));

  console.log('[webhook-prune] Registered webhook event pruning cron (daily at 3 AM UTC)');
}
