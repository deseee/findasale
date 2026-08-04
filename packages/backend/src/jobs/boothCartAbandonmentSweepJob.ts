import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { releasePendingCartHold } from '../services/vendorBoothCartLifecycleService';

/**
 * boothCartAbandonmentSweepJob.ts
 * Refresh-during-sale bug companion (2026-08-01). startBoothCart now find-or-reuses a
 * cashier's existing PENDING cart instead of always creating a new one, which closes
 * the main leak -- but a cart abandoned outright (browser closed, device swapped,
 * cashier never comes back) still needs its RESERVED items released so they don't
 * stay stuck forever. Every 10 minutes this sweeps stale PENDING/IN_PROGRESS carts and
 * releases them via the same core logic cancelBoothCart uses (releasePendingCartHold).
 *
 * Race safety (findasale-hacker fix-and-reverify, 2026-08-01): this job's WHERE clause
 * still only ever selects PENDING/IN_PROGRESS -- never CAPTURING/COMPLETED/REFUNDED/
 * FAILED -- but that check is only true AT READ TIME. A cart can legitimately move
 * PENDING/IN_PROGRESS -> CAPTURING -> COMPLETED (a live captureBoothCart call) in the
 * gap between this batch read and this job reaching that cart in its loop (which itself
 * makes Stripe network calls per cart ahead of it). releasePendingCartHold now closes
 * that window itself with an atomic PENDING/IN_PROGRESS -> FAILED claim before doing any
 * Stripe-cancel or item-release work, so a cart that wins its concurrent capture instead
 * is left completely untouched by this job (see that function's own comment).
 *
 * Two separate TTLs, not one (same fix pass): an IN_PROGRESS cart has already passed the
 * checkout guard and may be mid multi-leg Terminal checkout -- cart.updatedAt is NOT
 * touched again between beginCartCheckout's PENDING->IN_PROGRESS lock and either the
 * capture lock or this job, so a slow-but-live multi-booth checkout (shopper fumbling a
 * card, several booths to tap) can sit IN_PROGRESS without a fresh updatedAt for a while
 * even though a cashier is actively working it. Sweeping it is now guaranteed not to
 * corrupt a completed sale (see above), but it would still cancel real, live-authorized
 * Stripe legs and dump the shopper's basket out from under the cashier. Giving
 * IN_PROGRESS a longer TTL than PENDING (an untouched, no-legs-yet, just-opened cart)
 * makes that false-positive far less likely without needing to instrument every leg
 * creation call site to keep bumping updatedAt.
 *
 * Kill-switch: set BOOTH_CART_SWEEP_DISABLED=1 to make the job early-return (rollback lever).
 * TTLs: BOOTH_CART_ABANDON_TTL_MINUTES (PENDING, default 45) and
 * BOOTH_CART_INPROGRESS_ABANDON_TTL_MINUTES (IN_PROGRESS, default 4x the PENDING TTL),
 * both overridable without a redeploy.
 */

const PENDING_TTL_MINUTES = Number(process.env.BOOTH_CART_ABANDON_TTL_MINUTES) || 45;
const IN_PROGRESS_TTL_MINUTES =
  Number(process.env.BOOTH_CART_INPROGRESS_ABANDON_TTL_MINUTES) || PENDING_TTL_MINUTES * 4;

export const sweepAbandonedBoothCarts = async (): Promise<void> => {
  if (process.env.BOOTH_CART_SWEEP_DISABLED === '1') {
    console.log('[booth-cart-sweep] Disabled via BOOTH_CART_SWEEP_DISABLED=1 -- skipping run.');
    return;
  }

  const pendingCutoff = new Date(Date.now() - PENDING_TTL_MINUTES * 60 * 1000);
  const inProgressCutoff = new Date(Date.now() - IN_PROGRESS_TTL_MINUTES * 60 * 1000);

  const stale = await prisma.boothCartTransaction.findMany({
    where: {
      OR: [
        { status: 'PENDING', updatedAt: { lt: pendingCutoff } },
        { status: 'IN_PROGRESS', updatedAt: { lt: inProgressCutoff } },
      ],
    },
    select: { id: true, status: true, hubId: true },
  });

  if (stale.length === 0) return;

  for (const cart of stale) {
    try {
      const { released } = await releasePendingCartHold(cart);
      if (released) {
        console.log(`[booth-cart-sweep] Released abandoned cart ${cart.id} (hub ${cart.hubId}, was ${cart.status})`);
      } else {
        // Lost the race to a concurrent capture that completed between our batch read
        // and reaching this cart -- correctly left untouched, not an error.
        console.log(`[booth-cart-sweep] Skipped cart ${cart.id} (hub ${cart.hubId}) -- already progressed past PENDING/IN_PROGRESS since sweep read it`);
      }
    } catch (err) {
      console.error(`[booth-cart-sweep] Failed to release cart ${cart.id}:`, err);
    }
  }
};

// Every 10 minutes.
cron.schedule('4,14,24,34,44,54 * * * *', cronGuard({ jobName: 'boothCartAbandonmentSweep' }, async () => { // staggered off reservationExpiryJob's */10 2026-08-04 cost-optimization batch
  await sweepAbandonedBoothCarts();
}));
