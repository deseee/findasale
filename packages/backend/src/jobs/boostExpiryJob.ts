/**
 * boostExpiryJob.ts — Cron: expire stale ACTIVE BoostPurchase records
 * Phase 2b: Runs every hour. Flips status=ACTIVE AND expiresAt < now → status=EXPIRED.
 * Same pattern as reservationExpiryJob.ts.
 */

import cron from 'node-cron';
import { expireBoosts } from '../services/boostService';

// Run every hour at :05 past (staggered from reservation expiry at :00)
cron.schedule('5 * * * *', async () => {
  try {
    const count = await expireBoosts();
    if (count > 0) {
      console.log(`[boostExpiryJob] Expired ${count} boost purchase(s)`);
    }
  } catch (err) {
    console.error('[boostExpiryJob] Error expiring boosts:', err);
  }
});

console.log('[boostExpiryJob] Registered — runs hourly at :05');
