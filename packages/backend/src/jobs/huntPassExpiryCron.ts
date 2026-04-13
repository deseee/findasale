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

// Run at 03:00 UTC daily (staggered from xpExpiryCron at 02:00)
cron.schedule('0 3 * * *', async () => {
  try {
    const result = await prisma.user.updateMany({
      where: {
        huntPassActive: true,
        huntPassExpiry: { lt: new Date() },
      },
      data: {
        huntPassActive: false,
      },
    });

    if (result.count > 0) {
      console.log(`[huntPassExpiryCron] Deactivated ${result.count} expired Hunt Pass(es)`);
    }
  } catch (err) {
    console.error('[huntPassExpiryCron] Error expiring Hunt Passes:', err);
  }
});

console.log('[huntPassExpiryCron] Registered — runs daily at 03:00 UTC');
