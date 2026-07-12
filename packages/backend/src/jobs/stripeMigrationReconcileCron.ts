/**
 * stripeMigrationReconcileCron.ts — Daily reconciliation backstop for Stripe
 * Express -> Standard account migrations (ADR 1, 2026-07-11:
 * stripe-migration-reconciliation-and-isr-revalidation-adr-2026-07-11.md).
 *
 * Why this exists: the `account.updated` webhook is SUPPOSED to cut an organizer's
 * `stripeConnectId` over to their new Standard account once it goes live (see
 * stripeController.ts, the `[stripe-migration] cutover` block inside
 * `case 'account.updated':`). That webhook event is not currently subscribed on the
 * Stripe Dashboard for this endpoint (Patrick-approval-gated, tracked separately) --
 * and even once it is, a webhook misconfiguration, accidental unsubscribe, or a
 * future new event type could silently strand the next organizer's migration the
 * same way `stripeConnectAccountId` vs `stripeConnectId` did on 2026-07-08. This cron
 * makes the system self-healing independent of webhook config correctness by
 * live-checking Stripe directly for every organizer with a migration in flight.
 *
 * Runs daily at 04:30 server time (after the existing 04:00 scraped-sale prune job,
 * to avoid clustering with it -- see pruneScrapedSales.ts).
 *
 * Relation path: Organizer.pendingStripeMigrationAccountId -> reconcileStripeMigration
 * (packages/backend/src/services/stripeConnectService.ts), which performs the same
 * live-check + cutover the webhook does.
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { reconcileStripeMigration } from '../services/stripeConnectService';

/**
 * Reconcile every organizer with a Stripe Standard migration currently in flight.
 * Called by both the cron job and (if ever needed) a manual trigger.
 */
export async function reconcileAllPendingStripeMigrations(): Promise<{
  checked: number;
  reconciled: number;
  stillPending: number;
  errored: number;
}> {
  const summary = { checked: 0, reconciled: 0, stillPending: 0, errored: 0 };

  // Excludes the 'CLAIMING' sentinel implicitly -- reconcileStripeMigration itself
  // treats it as not-yet-eligible (no real Stripe account id to live-check yet), so
  // including those rows here is harmless, just a guaranteed not-yet-eligible result.
  const organizers = await prisma.organizer.findMany({
    where: { pendingStripeMigrationAccountId: { not: null } },
    select: { id: true },
  });

  console.log(`[stripe-migration-reconcile] Starting reconcile cycle for ${organizers.length} organizer(s) with a pending migration`);

  for (const { id: organizerId } of organizers) {
    summary.checked += 1;
    try {
      const result = await reconcileStripeMigration(organizerId);
      if (result.status === 'cutover-complete') {
        summary.reconciled += 1;
        console.log(`[stripe-migration-reconcile] Organizer ${organizerId}: cutover complete (${result.oldAccountId} -> ${result.newAccountId})`);
      } else if (result.status === 'not-yet-eligible') {
        summary.stillPending += 1;
        console.log(`[stripe-migration-reconcile] Organizer ${organizerId}: not yet eligible (charges=${result.chargesEnabled} payouts=${result.payoutsEnabled} feesPayer=${result.feesPayer})`);
      } else if (result.status === 'error') {
        summary.errored += 1;
        console.error(`[stripe-migration-reconcile] Organizer ${organizerId}: error — ${result.message}`);
      }
      // 'no-pending-migration' / 'organizer-not-found' shouldn't occur given the query
      // above, but are handled without throwing either way.
    } catch (error) {
      summary.errored += 1;
      console.error(`[stripe-migration-reconcile ERROR] organizerId ${organizerId}:`, error);
      // Continue — one organizer's failure shouldn't block the rest.
    }
  }

  console.log(
    `[stripe-migration-reconcile] Cycle complete — checked=${summary.checked} reconciled=${summary.reconciled} stillPending=${summary.stillPending} errored=${summary.errored}`
  );

  return summary;
}

// Register the cron job to run daily at 04:30 server time (after the 04:00 prune job).
// Cron expression: 30 4 * * *
export function scheduleStripeMigrationReconcileCron(): void {
  cron.schedule(
    '30 4 * * *',
    cronGuard({ jobName: 'stripeMigrationReconcileCron' }, async () => {
      console.log('[stripe-migration-reconcile] Starting daily reconcile cycle...');
      await reconcileAllPendingStripeMigrations();
    })
  );
  console.log('[stripe-migration-reconcile] Cron registered — runs daily at 04:30 server time.');
}
