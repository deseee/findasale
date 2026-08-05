/**
 * boostExpiryJob.ts — Cron: expire stale ACTIVE BoostPurchase records, and
 * (S1187 fix) reclaim stale PENDING BoostPurchase records that never got their
 * Stripe webhook (see boostService.ts's reclaimPendingBoosts for the full gap
 * writeup and evidence-first Stripe verification pattern).
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
    console.log(`[boostExpiryJob] Reclaimed stale PENDING boosts: ${activated} activated (missed webhook), ${failed} failed (abandoned)`);
  }
}));

console.log('[boostExpiryJob] Registered — runs hourly at :05 (ACTIVE expiry + PENDING reclaim)');
