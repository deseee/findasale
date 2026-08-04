import cron from 'node-cron';
import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { getStripe } from '../utils/stripe';
import { markHoldInvoicePaid } from '../services/holdInvoicePaymentRecorder'; // payments fix (2026-08-03): STRANDED-PAID reconcile backstop

/**
 * invoiceExpiryJob.ts
 *
 * Fix for the ADR-098 (2026-07-29) side effect: posController.ts's Open Cart
 * flow (createCombinedInvoice) and sendHoldInvoice now atomically transition
 * Item.status -> INVOICE_ISSUED *before* the invoice is paid, to close a
 * double-sell race (see itemSaleGuard.ts). But nothing ever reclaimed that
 * state if the invoice was never paid:
 *   - reservationExpiryJob.ts only reverts ItemReservation rows whose status
 *     is PENDING/CONFIRMED and expired -- HOLD_IN_CART (the Open Cart flow's
 *     status) is out of its scope, and it never looks at HoldInvoice at all.
 *   - placeHold's stale-hold reclaim only fires when Item.status === 'RESERVED';
 *     any other status (including INVOICE_ISSUED) returns a flat 409.
 *   - releaseInvoice is manual/organizer-triggered only, single-reservation.
 * Net effect: an unpaid, abandoned cart invoice permanently locked its
 * item(s) as unsellable -- worse than pre-ADR-098, which never touched
 * Item.status on this path at all.
 *
 * This job scans HoldInvoice rows past their OWN `expiresAt` -- QUICK's
 * 15-minute window and TRUST's organizer-set longer window are both honored
 * correctly because the scan uses each row's real `expiresAt` value, never a
 * hardcoded duration. A TRUST invoice that still has time left is simply not
 * a candidate yet; once its own expiresAt passes, it is reclaimed exactly
 * like a QUICK invoice.
 *
 * Revert target (AVAILABLE vs RESERVED): this job reverts bundled items to
 * RESERVED and their reservations to CONFIRMED (never straight to AVAILABLE),
 * mirroring the *existing* stripeController.ts `charge.failed` webhook
 * handler for this exact model (HoldInvoice / ItemReservation / Item) --
 * "payment attempt failed" and "payment was never attempted before the
 * window closed" are the same underlying situation and should resolve the
 * same way. `invoiceId` is cleared on every reverted reservation too:
 * sendHoldInvoice and pullHoldsToCart both refuse to touch a reservation
 * whose invoiceId is still set, which would otherwise permanently block a
 * fresh invoice attempt on the same hold even after this job runs. Reverting
 * to CONFIRMED (not AVAILABLE) deliberately leaves the *existing*
 * reservationExpiryJob cron as the single place that decides a hold's own
 * timer has truly run out -- this job does not duplicate that logic.
 *
 * Race safety (mirrors itemSaleGuard.ts's commitItemSale pattern -- the same
 * ADR-098 fix this job is closing the gap for): the HoldInvoice PENDING ->
 * EXPIRED flip and the Item INVOICE_ISSUED -> RESERVED revert are both
 * conditional `updateMany` calls (WHERE current status = expected status)
 * inside one transaction, so a payment webhook that resolves the invoice in
 * the same window always wins the race, and a mid-transaction failure rolls
 * the invoice's status flip back too (so the row is retried next run instead
 * of being silently stranded EXPIRED with an unreverted item).
 *
 * Evidence-first Stripe verification (NOT a blind DB-status revert): two
 * confirmed, separate, pre-existing gaps mean HoldInvoice.status=PENDING
 * cannot be trusted alone to mean "definitely unpaid":
 *   (a) createCombinedInvoice's Stripe PaymentIntent metadata omits
 *       `invoiceId` (posController.ts, payment_intent_data.metadata only
 *       carries itemIds/shopperId/organizerId/saleId) -- so the
 *       charge.succeeded / charge.failed webhooks, which both key off
 *       `paymentIntent.metadata.invoiceId`, never fire for Open Cart flow
 *       invoices at all, paid or not.
 *   (b) an abandoned Stripe Checkout page (buyer never submits payment)
 *       never fires either webhook either -- this is the main case this job
 *       exists to catch.
 * So for any invoice with a stripeSessionId, this job asks Stripe directly
 * (`checkout.sessions.retrieve`) whether the session actually shows
 * paid/complete before reverting anything. If Stripe says paid, this job
 * does NOT revert -- it logs a STRANDED-PAID line for manual reconciliation
 * (same shape as posStrandedSaleReconcileCron.ts's STRANDED-UNRECOVERED
 * logging) instead of guessing.
 *
 * Invoices with NO stripeSessionId at all -- sendHoldInvoice's "simplified
 * for MVP -- no actual Stripe Checkout" invoices, and cash-only Open Cart
 * invoices (cardAmountCents=0, "Full payment collected at POS") -- have no
 * Stripe ground truth to check, and HoldInvoice has no cash-confirmation
 * flag/timestamp to verify a completed cash sale against. Reverting one of
 * these could re-list an item the organizer already handed to the shopper
 * for cash. This job deliberately SKIPS these and logs them for manual /
 * organizer review rather than guessing -- this is a real, separate,
 * narrower gap (cash invoices appear to have no completion path in the
 * codebase at all today) and is called out in the handoff, not silently
 * "fixed" here.
 *
 * Kill-switch: set INVOICE_EXPIRY_RECLAIM_DISABLED=1 to make the job
 * early-return (rollback lever, matching posStrandedSaleReconcileCron.ts's
 * POS_RECONCILE_DISABLED convention).
 *
 * Payments fix (2026-08-03): the STRANDED-PAID branch below now actively
 * reconciles -- calling the shared markHoldInvoicePaid recorder
 * (holdInvoicePaymentRecorder.ts) instead of only logging for manual
 * follow-up, since createCombinedInvoice / markSoldAndCreateInvoice now
 * backfill paymentIntent.metadata.invoiceId so the PaymentIntent id read
 * off the Stripe session is enough to record the payment directly. A
 * separate kill-switch, INVOICE_PAID_RECONCILE_DISABLED=1, disables just
 * this reconcile call (falls back to log-only) without disabling the rest
 * of this job -- cheap, targeted rollback insurance for this one code path.
 * This branch firing at all means the webhook missed; that fact alone is
 * Sentry-alert-worthy regardless of whether the reconcile call succeeds.
 */

const stripe = () => getStripe();

export const reclaimExpiredInvoices = async (): Promise<void> => {
  if (process.env.INVOICE_EXPIRY_RECLAIM_DISABLED === '1') {
    console.log('[invoiceExpiryJob] Disabled via INVOICE_EXPIRY_RECLAIM_DISABLED=1 -- skipping run.');
    return;
  }

  try {
    const now = new Date();

    const candidates = await prisma.holdInvoice.findMany({
      where: { status: 'PENDING', expiresAt: { lt: now } },
      select: {
        id: true,
        itemIds: true,
        stripeSessionId: true,
        shopperUserId: true,
        invoiceMode: true,
        expiresAt: true,
      },
    });

    if (candidates.length === 0) return;

    console.log(`[invoiceExpiryJob] Checking ${candidates.length} PENDING HoldInvoice row(s) past their own expiresAt.`);

    let reclaimed = 0;
    let strandedPaidCount = 0;
    let skippedNoSession = 0;

    for (const invoice of candidates) {
      try {
        if (invoice.stripeSessionId) {
          // Evidence-first: ask Stripe directly rather than trusting our own
          // PENDING status (see the two confirmed gaps in the header comment).
          const session = await stripe().checkout.sessions.retrieve(invoice.stripeSessionId);
          if (session.status === 'complete' && session.payment_status === 'paid') {
            strandedPaidCount++;

            // Payments fix (2026-08-03): actively reconcile via the shared recorder
            // instead of only logging -- see holdInvoicePaymentRecorder.ts.
            let reconcileOutcome = 'SKIPPED (INVOICE_PAID_RECONCILE_DISABLED=1)';
            if (process.env.INVOICE_PAID_RECONCILE_DISABLED !== '1') {
              const paymentIntentId = typeof session.payment_intent === 'string'
                ? session.payment_intent
                : (session.payment_intent as any)?.id ?? null;

              if (paymentIntentId) {
                try {
                  const result = await markHoldInvoicePaid(invoice.id, paymentIntentId, { source: 'reconcile' });
                  reconcileOutcome = result.recorded
                    ? 'RECORDED'
                    : (result.alreadyPaid ? 'ALREADY-PAID (no-op, webhook or a prior run beat this one)' : 'NOT-RECORDED');
                } catch (recErr: any) {
                  reconcileOutcome = `ERROR: ${recErr?.message ?? recErr}`;
                  console.error(`[invoiceExpiryJob] Failed to reconcile STRANDED-PAID invoice=${invoice.id} session=${invoice.stripeSessionId}:`, recErr);
                }
              } else {
                reconcileOutcome = 'SKIPPED (no PaymentIntent id on Stripe session)';
              }
            }

            // This branch firing at all means the charge.succeeded webhook missed --
            // that is the alert-worthy fact itself, regardless of reconcile outcome.
            const strandedAmount = typeof session.amount_total === 'number' ? (session.amount_total / 100).toFixed(2) : 'unknown';
            const strandedPaidMsg = `[invoiceExpiryJob] STRANDED-PAID invoice=${invoice.id} session=${invoice.stripeSessionId} amount=$${strandedAmount} -- Stripe shows this session paid/complete but our DB still had the invoice PENDING past its expiresAt (webhook missed). Reconcile outcome: ${reconcileOutcome}.`;
            console.error(strandedPaidMsg);
            try {
              Sentry.captureMessage(strandedPaidMsg, 'error');
            } catch {
              // Sentry may not be initialized -- silently continue
            }

            continue;
          }
        } else {
          // No Stripe Checkout Session on this invoice -- sendHoldInvoice
          // ("no actual Stripe Checkout") or a cash-only Open Cart invoice.
          // No ground truth exists to verify a completed cash sale against.
          const noSessionMsg = `[invoiceExpiryJob] NO-SESSION-SKIPPED invoice=${invoice.id} mode=${invoice.invoiceMode} itemIds=${invoice.itemIds.join(',') || '(none)'} -- expired with no stripeSessionId (cash-only or no-checkout invoice). NOT auto-reverting; needs manual/organizer review.`;
          console.warn(noSessionMsg);
          try {
            Sentry.captureMessage(noSessionMsg, 'warning');
          } catch {
            // Sentry may not be initialized -- silently continue
          }
          skippedNoSession++;
          continue;
        }

        const result = await prisma.$transaction(async (tx) => {
          // Atomic invoice flip: only proceed if still PENDING. If a webhook
          // resolved this invoice in the same window, this matches zero rows
          // and the whole revert below is skipped.
          const invoiceFlip = await tx.holdInvoice.updateMany({
            where: { id: invoice.id, status: 'PENDING' },
            data: { status: 'EXPIRED' },
          });
          if (invoiceFlip.count === 0) {
            return { reverted: false };
          }

          // Atomic item revert: only items still INVOICE_ISSUED move to
          // RESERVED, same pattern itemSaleGuard.ts's commitItemSale uses in
          // the forward direction. Mirrors stripeController.ts's existing
          // charge.failed handler for this same model.
          await tx.item.updateMany({
            where: { id: { in: invoice.itemIds }, status: 'INVOICE_ISSUED' },
            data: { status: 'RESERVED' },
          });

          // Revert every reservation still pointing at this invoice and
          // clear invoiceId so a fresh invoice attempt on the same hold
          // isn't permanently blocked (sendHoldInvoice / pullHoldsToCart
          // both refuse to act on a reservation with invoiceId still set).
          await tx.itemReservation.updateMany({
            where: { invoiceId: invoice.id },
            data: { status: 'CONFIRMED', invoiceId: null },
          });

          await tx.notification.create({
            data: {
              userId: invoice.shopperUserId,
              type: 'invoice_expired',
              title: 'Invoice expired',
              body:
                invoice.itemIds.length > 1
                  ? `Your invoice for ${invoice.itemIds.length} items expired before payment was completed. Your hold remains active.`
                  : 'Your invoice expired before payment was completed. Your hold remains active.',
              link: invoice.itemIds[0] ? `/items/${invoice.itemIds[0]}` : null,
              channel: 'OPERATIONAL',
            },
          });

          return { reverted: true };
        });

        if (!result.reverted) {
          continue;
        }

        // Best-effort Stripe-side cancellation -- non-fatal, mirrors
        // reservationController.ts's releaseInvoice exactly (Stripe likely
        // already auto-expired the session at the same expires_at anyway).
        try {
          await stripe().checkout.sessions.expire(invoice.stripeSessionId!);
        } catch (stripeErr: any) {
          console.warn(`[invoiceExpiryJob] Failed to expire Stripe session ${invoice.stripeSessionId} for invoice ${invoice.id} (non-fatal):`, stripeErr?.message ?? stripeErr);
        }

        reclaimed++;
      } catch (err: any) {
        console.error(`[invoiceExpiryJob] Failed to reclaim invoice ${invoice.id} -- will retry next run:`, err?.message ?? err);
      }
    }

    console.log(`[invoiceExpiryJob] Reclaimed ${reclaimed} expired invoice(s); ${strandedPaidCount} STRANDED-PAID (auto-reconciled where possible, see per-invoice logs + Sentry); skipped ${skippedNoSession} NO-SESSION (needs manual review).`);
  } catch (error) {
    console.error('[invoiceExpiryJob] Error:', error);
  }
};

// Every 10 minutes, same cadence as reservationExpiryJob.ts.
cron.schedule('2,12,22,32,42,52 * * * *', cronGuard({ jobName: 'invoiceExpiryJob' }, async () => { // staggered off reservationExpiryJob's */10 2026-08-04 cost-optimization batch
  await reclaimExpiredInvoices();
}));
