/**
 * boostExpiryJob.ts — Cron: expire stale ACTIVE BoostPurchase records, and report
 * stale PENDING ones left on the retired Stripe rail (see boostService.ts's
 * reclaimPendingBoosts; Stripe retired 2026-11-04, no Stripe call is made).
 * Phase 2b: Runs every hour. Flips status=ACTIVE AND expiresAt < now -> status=EXPIRED.
 * Same pattern as reservationExpiryJob.ts.
 */

import cron from 'node-cron';
import { expireBoosts, reclaimPendingBoosts } from '../services/boostService';
import { cronGuard } from '../utils/cronGuard';

// Run every hour at :05 past (staggered from reservation expiry at :00)
cron.schedule('5 * * * *', cronGuard({ jobName: 'boostExpiryJob' }, async () => {
  const count = await expireBoosts();
  if (count > 0) {
    console.log(`[boostExpiryJob] Expired ${count} boost purchase(s)`);
  }

  const { activated, failed } = await reclaimPendingBoosts();
  if (activated > 0 || failed > 0) {
    console.log(`[boostExpiryJob] Reclaimed stale PENDING boosts: ${activated} activated, ${failed} failed`);
  }
}));

console.log('[boostExpiryJob] Registered — runs hourly at :05 (ACTIVE expiry + PENDING reclaim)');
