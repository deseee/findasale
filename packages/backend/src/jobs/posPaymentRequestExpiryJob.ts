import cron from 'node-cron';
import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { getStripe } from '../utils/stripe';
import { createNotification } from '../lib/notificationService'; // S1195 sweep continuation (2026-08-08): STRANDED-PAID notification-gap fix

/**
 * posPaymentRequestExpiryJob.ts
 *
 * Fix for a confirmed gap (S1187 audit, exhaustive grep of packages/backend/src/jobs/*.ts):
 * POSPaymentRequest already has everything a sweep needs -- `expiresAt` (set at
 * creation, posPaymentController.ts createPaymentRequest), an `EXPIRED` status value,
 * and an `@@index([status, expiresAt])` built for exactly this query (schema.prisma
 * ~L4096-4131) -- but zero cron job ever used them. The ONLY existing expiry check is
 * lazy and inline: acceptPaymentRequest (posPaymentController.ts ~L462-470) flips a
 * request to EXPIRED only if the shopper happens to open it again after expiresAt has
 * passed. If the shopper never reopens it -- request sent, they never look at their
 * phone again -- the row sits PENDING forever with no lazy check ever firing.
 *
 * Note this job intentionally does NOT touch Item.status or ItemReservation:
 * createPaymentRequest never changes Item.status when the request is created (items
 * stay AVAILABLE/RESERVED exactly as they were); the item only becomes SOLD once
 * confirmPaymentRequest runs the full payment-confirmation side-effect chain (Purchase
 * creation, stock decrement, XP, marketplace sync). So there is no reservation/stock
 * state to revert here.
 *
 * Evidence-first Stripe verification (NOT a blind expiresAt timeout, mirroring
 * invoiceExpiryJob.ts / posStrandedSaleReconcileCron.ts): every POSPaymentRequest has
 * its Stripe PaymentIntent created BEFORE the DB row (createPaymentRequest creates the
 * PI on the organizer's CONNECTED account first, then the POSPaymentRequest row with
 * that PI id already attached) -- so `stripePaymentIntentId` should always be present.
 * Before expiring anything, this job retrieves the PaymentIntent on the organizer's
 * connected Stripe account (same `{ stripeAccount }` pattern confirmPaymentRequest uses)
 * and checks its real status:
 *   - succeeded  -> STRANDED-PAID: Stripe shows the card was actually charged but our
 *                   DB never recorded it (client never called confirmPaymentRequest,
 *                   and no webhook path exists for this PI shape either). This is NOT
 *                   auto-reconciled here -- confirmPaymentRequest's payment-confirmation
 *                   path is a large, multi-step side-effect chain (Purchase creation per
 *                   item, atomic stock decrement, XP awards, eBay/Shopify sync, socket
 *                   events) that does not have a reusable extracted function today.
 *                   Duplicating that logic inline in a cron sweep risks drift and silent
 *                   double-charging bugs. Logged loudly (console.error + Sentry) for
 *                   manual/organizer review instead of guessing. Flagged as a follow-up
 *                   gap in the handoff, not silently "fixed" here.
 *   - everything else (canceled, requires_payment_method, requires_confirmation,
 *     requires_action, processing, requires_capture) -> the request's own expiresAt
 *     window has already passed with no successful charge. Flip PENDING -> EXPIRED,
 *     same declineReason shape ('TIMEOUT') the existing lazy check already uses.
 *
 * Scope note: only PENDING rows are swept, matching the existing lazy-expiry check's
 * scope (acceptPaymentRequest only auto-expires from PENDING). ACCEPTED requests
 * (shopper tapped Accept but never completed payment) are a separate, narrower gap not
 * covered by this job -- flagged as a follow-up, not addressed here.
 *
 * Kill-switch: set POS_PAYMENT_REQUEST_EXPIRY_RECLAIM_DISABLED=1 to make the job
 * early-return (rollback lever, matching the existing convention in invoiceExpiryJob.ts
 * / posStrandedSaleReconcileCron.ts).
 */

export const reclaimExpiredPosPaymentRequests = async (): Promise<void> => {
  if (process.env.POS_PAYMENT_REQUEST_EXPIRY_RECLAIM_DISABLED === '1') {
    console.log('[posPaymentRequestExpiryJob] Disabled via POS_PAYMENT_REQUEST_EXPIRY_RECLAIM_DISABLED=1 -- skipping run.');
    return;
  }

  try {
    const now = new Date();

    const candidates = await prisma.pOSPaymentRequest.findMany({
      where: { status: 'PENDING', expiresAt: { lt: now } },
      select: {
        id: true,
        organizerId: true,
        organizerUserId: true,
        shopperUserId: true,
        saleId: true,
        stripePaymentIntentId: true,
        totalAmountCents: true,
        expiresAt: true,
      },
    });

    if (candidates.length === 0) return;

    console.log(`[posPaymentRequestExpiryJob] Checking ${candidates.length} PENDING POSPaymentRequest row(s) past their own expiresAt.`);

    let expiredCount = 0;
    let strandedPaidCount = 0;
    let skippedNoPi = 0;

    // Cache organizer Stripe Connect account lookups within this run -- multiple stale
    // requests commonly belong to the same organizer/register.
    const stripeAccountCache = new Map<string, string | null>();

    for (const request of candidates) {
      try {
        if (!request.stripePaymentIntentId) {
          // Should not happen (PI is created before the DB row in createPaymentRequest),
          // but no Stripe ground truth means no safe verification -- log and skip rather
          // than guess, mirroring invoiceExpiryJob.ts's NO-SESSION-SKIPPED branch.
          console.warn(`[posPaymentRequestExpiryJob] NO-PI-SKIPPED request=${request.id} expiresAt=${request.expiresAt.toISOString()} -- expired PENDING with no stripePaymentIntentId. NOT auto-reverting; needs manual review.`);
          skippedNoPi++;
          continue;
        }

        let stripeConnectId = stripeAccountCache.get(request.organizerUserId);
        if (stripeConnectId === undefined) {
          const organizerProfile = await prisma.organizer.findUnique({
            where: { userId: request.organizerUserId },
            select: { stripeConnectId: true },
          });
          stripeConnectId = organizerProfile?.stripeConnectId ?? null;
          stripeAccountCache.set(request.organizerUserId, stripeConnectId);
        }

        if (!stripeConnectId) {
          console.warn(`[posPaymentRequestExpiryJob] NO-CONNECT-ACCOUNT-SKIPPED request=${request.id} organizerUserId=${request.organizerUserId} -- organizer has no stripeConnectId on file, cannot verify PI. NOT auto-reverting; needs manual review.`);
          skippedNoPi++;
          continue;
        }

        const paymentIntent = await getStripe().paymentIntents.retrieve(
          request.stripePaymentIntentId,
          {},
          { stripeAccount: stripeConnectId }
        );

        if (paymentIntent.status === 'succeeded') {
          strandedPaidCount++;
          const amountDollars = (request.totalAmountCents / 100).toFixed(2);
          const msg = `[posPaymentRequestExpiryJob] STRANDED-PAID request=${request.id} pi=${request.stripePaymentIntentId} amount=$${amountDollars} organizerId=${request.organizerId} -- Stripe shows this PaymentIntent succeeded but our DB still had the request PENDING past its expiresAt (client never confirmed). NOT auto-recorded -- confirmPaymentRequest's side-effect chain is not safely replayable from a cron sweep. Needs manual/organizer review.`;
          console.error(msg);
          try { Sentry.captureMessage(msg, 'error'); } catch { /* Sentry may not be initialized */ }

          // Notification-gap fix (S1195 sweep continuation, 2026-08-08): this branch was
          // Sentry-only, and unlike purchaseExpiryJob.ts's STRANDED-PAID case this one is
          // NOT auto-recorded at all -- the sale genuinely needs a human to complete it
          // (confirmPaymentRequest's side-effect chain -- Purchase creation, stock
          // decrement, marketplace sync -- was never run). The organizer is the one who
          // must act, so their message is actionable ("go complete this sale manually").
          // The shopper is told their card WAS charged so they don't panic and dispute
          // the charge before the organizer has a chance to follow up.
          createNotification({
            userId: request.organizerUserId,
            type: 'pos_payment_stranded_paid',
            title: 'Action needed: a POS payment succeeded but was never completed',
            body: `A shopper's card was charged $${amountDollars} for a payment request that expired before it was confirmed in the app. This sale was NOT automatically recorded. Please check Stripe and manually complete or refund this payment.`,
            link: '/organizer/pos',
            channel: 'OPERATIONAL',
            sendEmail: true,
          }).catch((err: unknown) => console.error(`[posPaymentRequestExpiryJob] Failed to notify organizer ${request.organizerUserId} for request ${request.id}:`, err));

          createNotification({
            userId: request.shopperUserId,
            type: 'pos_payment_stranded_paid_shopper',
            title: 'Your payment went through',
            body: `Your card was charged $${amountDollars}, but there was a delay confirming your purchase in the app. The organizer has been notified to complete your sale -- if you don't hear back soon, contact them directly.`,
            link: `/sales/${request.saleId}`,
            channel: 'OPERATIONAL',
            sendEmail: true,
          }).catch((err: unknown) => console.error(`[posPaymentRequestExpiryJob] Failed to notify shopper ${request.shopperUserId} for request ${request.id}:`, err));

          continue;
        }

        // Every other terminal/in-flight PI status: the request's own expiresAt window
        // has already passed with no successful charge recorded. Atomic conditional
        // guard so a client calling acceptPaymentRequest/confirmPaymentRequest in the
        // same window always wins the race.
        const result = await prisma.pOSPaymentRequest.updateMany({
          where: { id: request.id, status: 'PENDING' },
          data: { status: 'EXPIRED', declineReason: 'TIMEOUT' },
        });
        if (result.count > 0) {
          expiredCount++;
          console.log(`[posPaymentRequestExpiryJob] EXPIRED-RECLAIMED request=${request.id} pi=${request.stripePaymentIntentId} stripeStatus=${paymentIntent.status} -- past expiresAt (${request.expiresAt.toISOString()}) with no successful charge. Flipped to EXPIRED.`);
        }
      } catch (err: any) {
        console.error(`[posPaymentRequestExpiryJob] Failed to reclaim request ${request.id} -- will retry next run:`, err?.message ?? err);
      }
    }

    console.log(`[posPaymentRequestExpiryJob] Reclaimed ${expiredCount} EXPIRED; ${strandedPaidCount} STRANDED-PAID (needs manual review, see per-request logs + Sentry); skipped ${skippedNoPi} (no PI / no Connect account, needs manual review).`);
  } catch (error) {
    console.error('[posPaymentRequestExpiryJob] Error:', error);
  }
};

// Every 10 minutes, staggered off reservationExpiryJob's */10 pattern (offset :03/:13/...
// avoids the :00/:01/:02/:04/:06 slots already used by reservationExpiryJob/
// purchaseExpiryJob/invoiceExpiryJob/boothCartAbandonmentSweep/posStrandedSaleReconcile).
cron.schedule('3,13,23,33,43,53 * * * *', cronGuard({ jobName: 'posPaymentRequestExpiryJob' }, async () => {
  await reclaimExpiredPosPaymentRequests();
}));

console.log('[posPaymentRequestExpiryJob] Registered -- runs every 10 min (offset :03)');
