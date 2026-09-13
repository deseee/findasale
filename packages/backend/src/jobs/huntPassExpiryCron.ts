/**
 * huntPassExpiryCron.ts — Daily cron to deactivate expired Hunt Passes
 *
 * Runs at 03:00 UTC daily. Clears huntPassActive on any User where
 * huntPassExpiry < now AND huntPassActive = true.
 *
 * Required because the Hunt Pass activation flow (streaks/activate-huntpass)
 * uses a one-time PaymentIntent with a 30-day manual expiry. There is no
 * auto-renewal mechanism — users must repurchase each month. This cron
 * ensures passes are deactivated on time even if the user never returns.
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';

// Run at 03:00 UTC daily (staggered from xpExpiryCron at 02:00)
cron.schedule('0 3 * * *', cronGuard({ jobName: 'huntPassExpiryCron' }, async () => {
  const result = await prisma.user.updateMany({
    where: {
      huntPassActive: true,
      huntPassExpiry: { lt: new Date() },
      // Square Plan B (2026-09-13): a huntPassBillingProcessor='square' row is fully owned
      // by jobs/squareBillingChargeJob.ts's daily 01:00 UTC run, which deliberately keeps
      // huntPassActive=true past huntPassExpiry while a failed renewal is in its dunning
      // grace window (explicit "don't revoke on the first failure" requirement) -- this
      // legacy sweep must not race that job and cut access early. It stays authoritative
      // only for pre-Square one-time-purchase passes (huntPassBillingProcessor null).
      huntPassBillingProcessor: { not: 'square' },
    },
    data: {
      huntPassActive: false,
    },
  });

  if (result.count > 0) {
    console.log(`[huntPassExpiryCron] Deactivated ${result.count} expired Hunt Pass(es)`);
  }
}));

console.log('[huntPassExpiryCron] Registered — runs daily at 03:00 UTC');
