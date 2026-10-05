/**
 * bulkLotHoldSweepJob (ADR-136 Addendum B, roadmap #659): every 5 minutes, give the cards of expired bulk lot holds back to
 * their lot. See services/bulkLot/bulkLotHoldService.ts for the rules (a hold whose payment request is still open is left
 * to invoiceExpiryJob; a hold whose invoice is paid is never released).
 *
 * Does nothing while CARD_BULK_LOTS_ENABLED is off, and BULK_HOLD_SWEEP_DISABLED=1 is a kill switch. When the follow-up
 * tables do not exist yet (migration not applied) the query fails and cronGuard reports it; nothing else is affected.
 */
import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { isBulkLotsEnabled } from '../services/bulkLot/bulkLotConfig';
import { sweepExpiredBulkHolds, HoldDb } from '../services/bulkLot/bulkLotHoldService';
import { reconcileBulkLotEbayInBackgroundIfEnabled } from '../services/bulkLot/bulkLotEbayWiring';

export const runBulkLotHoldSweep = async (): Promise<void> => {
  if (!isBulkLotsEnabled()) return;
  if (process.env.BULK_HOLD_SWEEP_DISABLED === '1') {
    console.log('[bulk-hold-sweep] Disabled via BULK_HOLD_SWEEP_DISABLED=1 -- skipping run.');
    return;
  }
  const result = await sweepExpiredBulkHolds(prisma as unknown as HoldDb, {}, 200, (itemId) => reconcileBulkLotEbayInBackgroundIfEnabled(itemId, 'hold expired'));
  if (result.examined > 0) {
    console.log(`[bulk-hold-sweep] examined=${result.examined} expired=${result.expired} waitingOnInvoice=${result.waitingOnInvoice} paidAnomalies=${result.paidAnomalies}`);
  }
};

// Every 5 minutes, staggered off the 10-minute jobs.
cron.schedule('2,7,12,17,22,27,32,37,42,47,52,57 * * * *', cronGuard({ jobName: 'bulkLotHoldSweep' }, async () => {
  await runBulkLotHoldSweep();
}));
