import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { prisma } from '../index';
import { pruneExpiredRefreshTokens } from '../services/refreshTokenService';

/**
 * Webhook Event Pruning Cron
 *
 * Maintains database health by removing old processed webhook events that are older than 30 days (Square dispute step
 * markers: one year; the Square event payload stored on a row goes with the row).
 * The processedWebhookEvent table grows unbounded and needs periodic cleanup to maintain performance.
 *
 * Runs daily at 3:00 AM UTC
 */

export function scheduleWebhookEventPruneJob(): void {
  // Daily at 3:00 AM UTC
  cron.schedule('4 3 * * *', cronGuard({ jobName: 'webhookEventPruneJob' }, async () => { // staggered off huntPassExpiryCron's 0 3 * * * 2026-08-04 cost-optimization batch
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      console.log('[webhook-prune] Starting webhook event pruning job (cutoff:', cutoff.toISOString(), ')');

      // 2026-09-30: Square dispute step markers ('square-dispute-step:<disputeId>:<step>') record which penalties a
      // chargeback applied (buyer strike, suspension, XP clawback) so a later WON decision can reverse them. Card
      // disputes routinely outlive 30 days, so those markers are kept for a year; everything else (including the
      // stored webhook payloads, which live on the same rows) goes at 30 days.
      const markerCutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const { count } = await prisma.processedWebhookEvent.deleteMany({
        where: {
          OR: [
            { processedAt: { lt: cutoff }, NOT: { eventId: { startsWith: 'square-dispute-step:' } } },
            { processedAt: { lt: markerCutoff }, eventId: { startsWith: 'square-dispute-step:' } },
          ],
        },
      });

      if (count > 0) {
        console.log(`[webhook-prune] Deleted ${count} webhook events older than 30 days`);
      } else {
        console.log('[webhook-prune] No webhook events to delete');
      }

      console.log('[webhook-prune] Webhook event pruning job completed');

      // 2026-09-30: same daily housekeeping slot also prunes refresh-token rotation rows that expired more than 7 days
      // ago (rows for revoked-but-unexpired families are kept until then so reuse detection keeps working).
      try {
        const removed = await pruneExpiredRefreshTokens();
        if (removed > 0) console.log(`[refresh-token-prune] Deleted ${removed} expired refresh token rows`);
      } catch (pruneErr: any) {
        console.error('[refresh-token-prune] Error pruning refresh tokens:', pruneErr?.message || pruneErr);
      }
    } catch (err: any) {
      console.error('[webhook-prune] Error in webhook event pruning cron:', err?.message || err);
      // Continue — don't let cron job crash
    }
  }));

  console.log('[webhook-prune] Registered webhook event pruning cron (daily at 3 AM UTC)');
}
