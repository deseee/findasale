import { prisma } from '../lib/prisma';
import { getStripe } from '../utils/stripe';

const stripe = () => getStripe();
const isTerminalSimulated = () => process.env.STRIPE_TERMINAL_SIMULATED === 'true';

/**
 * vendorBoothCartLifecycleService.ts
 *
 * Extracted (2026-08-01) from cancelBoothCart's core release logic in
 * vendorBoothCartController.ts, so the same "cancel every uncaptured leg for free +
 * release RESERVED items back to AVAILABLE + flip the cart to FAILED" behavior can be
 * reused by the abandonment sweep job (boothCartAbandonmentSweepJob.ts), not just the
 * cashier-initiated /cancel HTTP endpoint. Deliberately excludes the HTTP-request-specific
 * guards (auth, COMPLETED/FAILED/CAPTURING status checks) -- those remain the caller's
 * responsibility (see cancelBoothCart, which now delegates to this function for the
 * shared core after running its own guards).
 */
export async function releasePendingCartHold(cart: { id: string; status: string }): Promise<{ cancelledLegIds: string[]; released: boolean }> {
  // findasale-hacker fix-and-reverify (2026-08-01): atomically CLAIM the release by
  // flipping PENDING/IN_PROGRESS -> FAILED with a conditional updateMany BEFORE doing
  // any leg-cancel or item-release work -- the same compare-and-swap idiom
  // beginCartCheckout (PENDING->IN_PROGRESS) and captureBoothCart's capture lock
  // (IN_PROGRESS->CAPTURING) already use.
  //
  // Without this, both callers of this function hand it a `cart` snapshot that can be
  // stale by the time this runs: cancelBoothCart's HTTP guards and, far more so, the
  // abandonment sweep job's batch `findMany` read (which can be seconds old, and is
  // itself followed by network calls to Stripe before this function's old unconditional
  // `.update({ status: 'FAILED' })` ran). In that window a live captureBoothCart call
  // can legitimately move the SAME cart PENDING/IN_PROGRESS -> CAPTURING -> COMPLETED --
  // capturing real money and creating Purchase rows. The old code had no re-check: it
  // would still cancel any leg it read as PENDING/REQUIRES_CAPTURE (a live race against
  // that same capture's Stripe calls) and then unconditionally overwrite the cart's
  // status to FAILED even after it had just gone COMPLETED, silently corrupting a
  // successful sale's transaction record.
  //
  // Now: whichever of this function's claim vs. captureBoothCart's capture-lock
  // updateMany wins the row in Postgres proceeds; the other's WHERE predicate no longer
  // matches (count 0) and it backs off as a no-op. If we lose the race, `released` is
  // false and nothing below runs -- no Stripe cancel calls, no item release, no status
  // write -- the concurrent capture owns the cart's fate instead.
  const claim = await prisma.boothCartTransaction.updateMany({
    where: { id: cart.id, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    data: { status: 'FAILED' },
  });
  if (claim.count !== 1) {
    return { cancelledLegIds: [], released: false };
  }

  const legs = await prisma.boothCartLeg.findMany({
    where: { cartTransactionId: cart.id, status: { in: ['PENDING', 'REQUIRES_CAPTURE'] } },
  });

  const cancelledLegIds: string[] = [];
  for (const leg of legs) {
    try {
      if (isTerminalSimulated() && leg.rail === 'TERMINAL') {
        await stripe().paymentIntents.cancel(leg.stripePaymentIntentId);
      } else {
        await stripe().paymentIntents.cancel(leg.stripePaymentIntentId, {}, { stripeAccount: leg.stripeAccountId });
      }
      await prisma.boothCartLeg.update({ where: { id: leg.id }, data: { status: 'CANCELED' } });
      cancelledLegIds.push(leg.id);
    } catch (err) {
      // Already-captured or already-expired legs will fail to cancel -- log and
      // continue; this is best-effort cleanup, not a hard guarantee. Note the claim
      // above already guarantees we only reach here for a cart WE atomically won, so
      // an already-captured leg here means the leg itself raced ahead of the cart's
      // status (shouldn't happen given the capture lock, but this remains best-effort
      // defense in depth, not a correctness dependency).
      console.error(`[releasePendingCartHold] Failed to cancel leg ${leg.id}:`, err);
    }
  }

  // Release THIS cart's reserved items back to AVAILABLE and drop the cart link.
  // Scoped to boothCartTransactionId so it can only ever touch its own reservations
  // (see the 2026-07-28 P0 cart-scope fix note on Item.boothCartTransactionId).
  await prisma.item.updateMany({
    where: { status: 'RESERVED', boothCartTransactionId: cart.id },
    data: { status: 'AVAILABLE', boothCartTransactionId: null },
  });

  // Status already flipped to FAILED by the claim above -- no separate write needed.

  return { cancelledLegIds, released: true };
}
