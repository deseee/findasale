/**
 * bulkLotHoldSweepJob (ADR-136 Addendum B, roadmap #659): every 5 minutes, give the cards of expired bulk lot holds back to
 * their lot. See services/bulkLot/bulkLotHoldService.ts for the rules (a hold whose payment request is still open is left
 * to invoiceExpiryJob; a hold whose invoice is paid is never released).
 *
 * Addendum D adds two customer emails to the same run: the "hold ended" notice for each hold the sweep expires, and the one
 * expiry reminder (4 hours before an organizer hold with a customer email ends; claim before send, so an overlapping run or a
 * second server cannot send it twice). Both ride the existing transactional rail and its gates and are best effort.
 *
 * Does nothing while CARD_BULK_LOTS_ENABLED is off, and BULK_HOLD_SWEEP_DISABLED=1 is a kill switch. When the follow-up
 * tables do not exist yet (migration not applied) the query fails and cronGuard reports it; nothing else is affected.
 */
import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { isBulkLotsEnabled } from '../services/bulkLot/bulkLotConfig';
import { sweepExpiredBulkHolds, sweepHoldReminders, HoldDb } from '../services/bulkLot/bulkLotHoldService';
import { liveReminderDeps, onBulkHoldEnded } from '../services/bulkLot/bulkLotHoldEmailWiring';
import { reconcileBulkLotEbayInBackgroundIfEnabled } from '../services/bulkLot/bulkLotEbayWiring';

export const runBulkLotHoldSweep = async (): Promise<void> => {
  if (!isBulkLotsEnabled()) return;
  if (process.env.BULK_HOLD_SWEEP_DISABLED === '1') {
    console.log('[bulk-hold-sweep] Disabled via BULK_HOLD_SWEEP_DISABLED=1 -- skipping run.');
    return;
  }
  const result = await sweepExpiredBulkHolds(prisma as unknown as HoldDb, { onEnded: onBulkHoldEnded }, 200, (itemId) => reconcileBulkLotEbayInBackgroundIfEnabled(itemId, 'hold expired'));
  if (result.examined > 0) {
    console.log(`[bulk-hold-sweep] examined=${result.examined} expired=${result.expired} waitingOnInvoice=${result.waitingOnInvoice} paidAnomalies=${result.paidAnomalies}`);
  }
  // The reminder pass never stops the expiry pass above and an error in it never fails the run (best effort).
  try {
    const reminders = await sweepHoldReminders(prisma as unknown as HoldDb, liveReminderDeps);
    if (reminders.examined > 0) {
      console.log(`[bulk-hold-sweep] reminders examined=${reminders.examined} claimed=${reminders.claimed} skipped=${reminders.skipped} lostClaim=${reminders.lostClaim}`);
    }
  } catch (err) {
    console.warn('[bulk-hold-sweep] reminder pass failed (ignored):', err instanceof Error ? err.message : err);
  }
};

// Every 5 minutes, staggered off the 10-minute jobs.
cron.schedule('2,7,12,17,22,27,32,37,42,47,52,57 * * * *', cronGuard({ jobName: 'bulkLotHoldSweep' }, async () => {
  await runBulkLotHoldSweep();
}));
