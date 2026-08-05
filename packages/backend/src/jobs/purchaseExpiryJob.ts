import cron from 'node-cron';
import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { getStripe, getTestStripe } from '../utils/stripe';
import { createNotification } from '../lib/notificationService';

/**
 * purchaseExpiryJob.ts
 *
 * Fix for a confirmed gap (S1187 audit, exhaustive grep of packages/backend/src/jobs/*.ts):
 * Purchase.status defaults to PENDING and is only ever flipped away from PENDING by the
 * Stripe webhook (payment_intent.succeeded -> PAID across several branches in
 * stripeController.ts, payment_intent.payment_failed -> FAILED). If a buyer abandons
 * checkout before either webhook event ever fires -- closes the tab mid-payment-form,
 * never confirms the PaymentIntent client-side, a webhook delivery is lost -- the
 * Purchase row is PENDING forever. No cron job ever revisits it.
 *
 * Note this job intentionally does NOT touch Item.status or ItemReservation: every
 * checkout path that creates a PENDING Purchase (stripeController.ts createPaymentIntent,
 * bountyController.ts, terminalController.ts) leaves Item.status untouched until the
 * webhook actually confirms payment -- the item remains sellable to someone else in the
 * meantime (first-confirmed-payment-wins, guarded by the existing atomic stock decrement
 * in the webhook handler). So there is no reservation/stock state to revert here; this
 * job's only job is to stop a permanently-PENDING Purchase row from lying about an
 * abandoned or already-resolved payment attempt.
 *
 * Evidence-first Stripe verification (NOT a blind DB-status timeout): asks Stripe
 * directly (paymentIntents.retrieve) what the PaymentIntent's real status is before
 * doing anything, same philosophy as invoiceExpiryJob.ts / posStrandedSaleReconcileCron.ts:
 *   - succeeded            -> STRANDED-PAID safety net: the webhook was missed/delayed.
 *                             Flip PENDING -> PAID (does NOT duplicate the webhook's
 *                             other side effects like stock decrement/eBay sync -- those
 *                             are a separate, narrower gap; flagged in the handoff, not
 *                             silently "fixed" here).
 *   - canceled /
 *     requires_payment_method /
 *     requires_confirmation  -> genuinely abandoned, no forward progress possible.
 *                             Flip PENDING -> FAILED.
 *   - requires_action /
 *     requires_capture /
 *     processing             -> still potentially in flight (3DS pending, manual
 *                             capture pending, payment processing). Left alone,
 *                             re-checked next run.
 *
 * Test transactions (Purchase.isTestTransaction=true, created via getTestStripe() per
 * stripeController.ts's existing convention) are verified against the TEST Stripe key,
 * never the live key.
 *
 * Race safety: the PENDING -> PAID/FAILED flip is an atomic conditional `updateMany`
 * (WHERE status = 'PENDING'), scoped per stripePaymentIntentId so a webhook resolving
 * the same PaymentIntent mid-sweep always wins the race. Purchase.stripePaymentIntentId
 * is NOT unique (one PaymentIntent can back multiple Purchase rows in a multi-item
 * cart/POS sale -- see schema.prisma comment on Purchase.stripePaymentIntentId), so
 * candidates are grouped by PaymentIntent ID and verified against Stripe once per
 * PaymentIntent, then the flip applies to every PENDING row sharing that PaymentIntent.
 *
 * Kill-switch: set PURCHASE_EXPIRY_RECLAIM_DISABLED=1 to make the job early-return
 * (rollback lever, matching the existing convention in invoiceExpiryJob.ts /
 * posStrandedSaleReconcileCron.ts).
 *
 * Threshold: PURCHASE_PENDING_EXPIRY_HOURS (default 2) -- a Purchase row is only a
 * candidate once it has been PENDING for longer than this many hours.
 */

const PENDING_EXPIRY_HOURS = parseFloat(process.env.PURCHASE_PENDING_EXPIRY_HOURS ?? '2');

const ABANDONED_STATUSES = new Set(['canceled', 'requires_payment_method', 'requires_confirmation']);
const IN_FLIGHT_STATUSES = new Set(['requires_action', 'requires_capture', 'processing']);

export const reclaimStalePurchases = async (): Promise<void> => {
  if (process.env.PURCHASE_EXPIRY_RECLAIM_DISABLED === '1') {
    console.log('[purchaseExpiryJob] Disabled via PURCHASE_EXPIRY_RECLAIM_DISABLED=1 -- skipping run.');
    return;
  }

  try {
    const cutoff = new Date(Date.now() - PENDING_EXPIRY_HOURS * 60 * 60 * 1000);

    const candidates = await prisma.purchase.findMany({
      where: { status: 'PENDING', createdAt: { lt: cutoff } },
      select: {
        id: true,
        stripePaymentIntentId: true,
        isTestTransaction: true,
        userId: true,
        itemId: true,
        createdAt: true,
      },
    });

    if (candidates.length === 0) return;

    console.log(`[purchaseExpiryJob] Checking ${candidates.length} PENDING Purchase row(s) older than ${PENDING_EXPIRY_HOURS}h.`);

    // Group by PaymentIntent ID (not unique on Purchase -- multi-item carts / POS sales
    // can share one PI across several Purchase rows) so each PI is verified against
    // Stripe exactly once.
    const byPi = new Map<string, { ids: string[]; isTestTransaction: boolean; userIds: (string | null)[]; itemIds: (string | null)[] }>();
    const noPi: typeof candidates = [];

    for (const p of candidates) {
      if (!p.stripePaymentIntentId) {
        noPi.push(p);
        continue;
      }
      const group = byPi.get(p.stripePaymentIntentId);
      if (group) {
        group.ids.push(p.id);
        group.userIds.push(p.userId);
        group.itemIds.push(p.itemId);
      } else {
        byPi.set(p.stripePaymentIntentId, {
          ids: [p.id],
          isTestTransaction: p.isTestTransaction,
          userIds: [p.userId],
          itemIds: [p.itemId],
        });
      }
    }

    for (const p of noPi) {
      // No PaymentIntent at all -- no Stripe ground truth to verify against (should be
      // rare; every checkout path creates the PI before the Purchase row). Log for
      // manual review, mirroring invoiceExpiryJob.ts's NO-SESSION-SKIPPED branch.
      console.warn(`[purchaseExpiryJob] NO-PI-SKIPPED purchase=${p.id} createdAt=${p.createdAt.toISOString()} -- expired PENDING with no stripePaymentIntentId. NOT auto-reverting; needs manual review.`);
    }

    let paidCount = 0;
    let failedCount = 0;
    let inFlightSkipped = 0;

    for (const [piId, group] of byPi) {
      try {
        const stripeClient = group.isTestTransaction ? getTestStripe() : getStripe();
        const paymentIntent = await stripeClient.paymentIntents.retrieve(piId);

        if (paymentIntent.status === 'succeeded') {
          // Stripe shows the payment actually succeeded -- the webhook was
          // missed/delayed. Safety net only: flip every still-PENDING Purchase row
          // sharing this PI to PAID. Atomic conditional guard so a webhook resolving
          // mid-sweep always wins the race.
          const result = await prisma.purchase.updateMany({
            where: { stripePaymentIntentId: piId, status: 'PENDING' },
            data: { status: 'PAID' },
          });
          if (result.count > 0) {
            paidCount += result.count;
            const msg = `[purchaseExpiryJob] STRANDED-PAID-RECLAIMED pi=${piId} rows=${result.count} purchaseIds=${group.ids.join(',')} -- Stripe shows succeeded but still PENDING past ${PENDING_EXPIRY_HOURS}h (webhook missed). Flipped to PAID. NOTE: does not replay stock-decrement/eBay-sync side effects -- verify downstream state if this fires often.`;
            console.error(msg);
            try { Sentry.captureMessage(msg, 'error'); } catch { /* Sentry may not be initialized */ }
          }
        } else if (ABANDONED_STATUSES.has(paymentIntent.status)) {
          const result = await prisma.purchase.updateMany({
            where: { stripePaymentIntentId: piId, status: 'PENDING' },
            data: { status: 'FAILED' },
          });
          if (result.count > 0) {
            failedCount += result.count;
            console.log(`[purchaseExpiryJob] EXPIRED-RECLAIMED pi=${piId} stripeStatus=${paymentIntent.status} rows=${result.count} purchaseIds=${group.ids.join(',')} -- abandoned past ${PENDING_EXPIRY_HOURS}h. Flipped to FAILED.`);

            // Best-effort buyer notification (authenticated buyers only -- guests have
            // no userId to notify).
            for (let i = 0; i < group.ids.length; i++) {
              const userId = group.userIds[i];
              const itemId = group.itemIds[i];
              if (!userId) continue;
              await createNotification({
                userId,
                type: 'purchase_expired',
                title: 'Checkout not completed',
                body: 'Your checkout was not completed in time, so the payment attempt was cancelled. If you still want this item, you can try again.',
                link: itemId ? `/items/${itemId}` : undefined,
                channel: 'OPERATIONAL',
              }).catch(err => console.error(`[purchaseExpiryJob] Failed to notify user ${userId} for pi=${piId}:`, err));
            }
          }
        } else if (IN_FLIGHT_STATUSES.has(paymentIntent.status)) {
          inFlightSkipped += group.ids.length;
          console.log(`[purchaseExpiryJob] IN-FLIGHT-SKIPPED pi=${piId} stripeStatus=${paymentIntent.status} rows=${group.ids.length} -- not a terminal state yet, retrying next run.`);
        } else {
          console.log(`[purchaseExpiryJob] UNRECOGNIZED-STATUS-SKIPPED pi=${piId} stripeStatus=${paymentIntent.status} rows=${group.ids.length} -- leaving PENDING, retrying next run.`);
        }
      } catch (err: any) {
        console.error(`[purchaseExpiryJob] Failed to reclaim PaymentIntent ${piId} (purchaseIds=${group.ids.join(',')}) -- will retry next run:`, err?.message ?? err);
      }
    }

    console.log(`[purchaseExpiryJob] Reclaimed ${paidCount} PAID (missed webhook), ${failedCount} FAILED (abandoned); ${inFlightSkipped} still in flight; ${noPi.length} NO-PI (needs manual review).`);
  } catch (error) {
    console.error('[purchaseExpiryJob] Error:', error);
  }
};

// Every 10 minutes, staggered off reservationExpiryJob's */10 pattern (offset :01/:11/...
// avoids the :00/:02/:04/:06 slots already used by reservationExpiryJob/invoiceExpiryJob/
// boothCartAbandonmentSweep/posStrandedSaleReconcile).
cron.schedule('1,11,21,31,41,51 * * * *', cronGuard({ jobName: 'purchaseExpiryJob' }, async () => {
  await reclaimStalePurchases();
}));

console.log(`[purchaseExpiryJob] Registered -- runs every 10 min (offset :01), PURCHASE_PENDING_EXPIRY_HOURS=${PENDING_EXPIRY_HOURS}`);
