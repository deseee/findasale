/**
 * boostExpiryJob.ts — Cron: expire stale ACTIVE BoostPurchase records
 * Phase 2b: Runs every hour. Flips status=ACTIVE AND expiresAt < now → status=EXPIRED.
 * Same pattern as reservationExpiryJob.ts.
 */

import cron from 'node-cron';
import { expireBoosts } from '../services/boostService';
import { cronGuard } from '../utils/cronGuard';

// Run every hour at :05 past (staggered from reservation expiry at :00)
cron.schedule('5 * * * *', cronGuard({ jobName: 'boostExpiryJob' }, async () => {
  const count = await expireBoosts();
  if (count > 0) {
    console.log(`[boostExpiryJob] Expired ${count} boost purchase(s)`);
  }
}));

console.log('[boostExpiryJob] Registered — runs hourly at :05');
