import cron from 'node-cron';
import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { markHoldInvoicePaid } from '../services/holdInvoicePaymentRecorder'; // payments fix (2026-08-03): STRANDED-PAID reconcile backstop
import { createNotification } from '../lib/notificationService'; // S1195 sweep continuation (2026-08-08): invoice_expired notification-gap fix
import { expireCheckoutSessionSafely, retrieveCheckoutSessionAcrossAccounts } from '../utils/expireCheckoutSession'; // P1 (2026-08-17): expired invoices must not leave a PAYABLE Stripe session behind; P0 (2026-08-17): Direct-charge sessions live on the connected account

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

/**
 * One-shot organizer nudge for a POS cash invoice that expired with no Stripe ground
 * truth (P1 reclaim-path fix, 2026-08-17).
 *
 * Idempotency: this cron runs every 10 minutes and the invoice it is reporting on stays
 * PENDING indefinitely (nothing auto-reverts it, by design), so an unguarded notify
 * would spam the organizer every 10 minutes forever. Notification has no unique key to
 * upsert against, so the guard is an explicit lookup on (userId, type, link) -- the link
 * carries the invoice id, making it unique per invoice.
 */
async function notifyOrganizerNoSessionOnce(
  invoiceId: string,
  organizerUserId: string,
  saleId: string,
  itemIds: string[]
): Promise<void> {
  try {
    // saleId filters the Holds page (it already reads ?saleId); the invoice id is what
    // makes this link — and therefore the dedupe lookup below — unique per invoice.
    const link = `/organizer/holds?saleId=${saleId}&invoice=${invoiceId}`;
    const existing = await prisma.notification.findFirst({
      where: { userId: organizerUserId, type: 'invoice_needs_review', link },
      select: { id: true },
    });
    if (existing) return;

    const itemCount = itemIds.length;
    await createNotification({
      userId: organizerUserId,
      type: 'invoice_needs_review',
      title: 'A cash payment request needs your review',
      body:
        itemCount > 1
          ? `A cash payment request for ${itemCount} items has passed its deadline. If the shopper already paid you, nothing to do. If not, cancel the request from your Holds page so the items go back on sale.`
          : 'A cash payment request has passed its deadline. If the shopper already paid you, nothing to do. If not, cancel the request from your Holds page so the item goes back on sale.',
      link,
      channel: 'OPERATIONAL',
      sendEmail: true,
    });
  } catch (err) {
    console.error(`[invoiceExpiryJob] Failed to notify organizer ${organizerUserId} about no-session invoice ${invoiceId}:`, err);
  }
}

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
        // Discriminates the two NO-SESSION classes (P1 reclaim-path fix, 2026-08-17):
        // cartSessionId is set ONLY by posController.createCombinedInvoice (POS cart),
        // never by sendHoldInvoice. See the NO-SESSION branch below.
        cartSessionId: true,
        cashAmountCents: true,
        organizerUserId: true,
        saleId: true,
        // Stripe account + charge-shape snapshot (2026-08-18 migration): the invoice's own
        // pinned account, preferred over the sale's organizer's CURRENT stripeConnectId
        // (below), which is only the fallback now for pre-migration rows. Needed to close a
        // Direct-charge Checkout Session: it lives on the connected account, and a
        // platform-scoped expire() returns "No such checkout session" (P1, 2026-08-17).
        stripeAccountId: true,
        sale: { select: { organizer: { select: { stripeConnectId: true } } } },
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
          // P0 fix (2026-08-17): account-aware retrieve. This was
          // `stripe().checkout.sessions.retrieve(id)` -- platform-scoped, no fallback -- so
          // for an organizer routed by shouldUseDirectCharge (allowlist confirmed NON-EMPTY
          // in Railway production this session) the Session lives on the CONNECTED account
          // and this threw resource_missing on EVERY pass. The per-invoice catch below
          // swallowed it as "will retry next run", forever: Direct-charge invoices were
          // never reclaimed, and a Direct-charge invoice that WAS paid never reached the
          // STRANDED-PAID reconcile branch below, so its items sat at INVOICE_ISSUED
          // permanently with the payment unrecorded. The organizer's connectId was already
          // being selected above and already used correctly by the expire call at the end
          // of this loop -- it simply was never passed here. Shared helper so the
          // platform-first / connected-fallback rule lives in exactly one place.
          const session = await retrieveCheckoutSessionAcrossAccounts(
            invoice.stripeSessionId,
            invoice.stripeAccountId ?? invoice.sale?.organizer?.stripeConnectId ?? null
          );
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
        } else if (invoice.cartSessionId) {
          // POS cart invoice with NO Stripe session -- a cash-only split
          // (createCombinedInvoice, cardAmountCents = 0, "Full payment collected at
          // POS"). The organizer may genuinely have taken the cash and handed the item
          // over, and HoldInvoice carries no cash-confirmation flag to check that
          // against, so auto-reverting could re-list a sold item. Still skipped
          // deliberately -- but no longer a dead end (see below).
          const noSessionMsg = `[invoiceExpiryJob] NO-SESSION-SKIPPED invoice=${invoice.id} mode=${invoice.invoiceMode} cart=${invoice.cartSessionId} cash=${invoice.cashAmountCents ?? 0} itemIds=${invoice.itemIds.join(',') || '(none)'} -- expired POS cash invoice, no Stripe ground truth. NOT auto-reverting; organizer can cancel the request from Holds to reclaim the item.`;
          console.warn(noSessionMsg);
          try {
            Sentry.captureMessage(noSessionMsg, 'warning');
          } catch {
            // Sentry may not be initialized -- silently continue
          }

          // P1 fix (2026-08-17): items on these invoices used to sit at INVOICE_ISSUED
          // FOREVER with no reclaim path at all -- this branch logged and moved on, and
          // nothing else in the codebase touched them. The organizer is the only party
          // who knows whether the cash was collected, so tell them, once, and point them
          // at the control that reclaims it (POST /reservations/:id/release-invoice, now
          // wired to the "Cancel payment request" button on /organizer/holds). Guarded so
          // this 10-minute cron does not re-notify on every pass for the life of the row.
          await notifyOrganizerNoSessionOnce(invoice.id, invoice.organizerUserId, invoice.saleId, invoice.itemIds);

          skippedNoSession++;
          continue;
        } else {
          // sendHoldInvoice's "simplified for MVP -- no actual Stripe Checkout" invoice:
          // there is NO payment mechanism attached to it at all, on any account. It can
          // never have been paid, so unlike the cash case above there is no ambiguity
          // and nothing to guess at -- reverting is unambiguously correct, and NOT
          // reverting is what leaves the item unsellable forever. Falls through to the
          // normal revert transaction below (which is already guarded on
          // Item.status = INVOICE_ISSUED, so an item settled through another channel in
          // the meantime is never dragged backwards).
          console.log(`[invoiceExpiryJob] NO-SESSION-RECLAIM invoice=${invoice.id} mode=${invoice.invoiceMode} itemIds=${invoice.itemIds.join(',') || '(none)'} -- no Stripe Checkout was ever created for this invoice (sendHoldInvoice MVP path), so it cannot have been paid. Reverting.`);
        }

        const result = await prisma.$transaction(async (tx) => {
          // Atomic invoice flip: only proceed if still PENDING. If a webhook
          // resolved this invoice in the same window, this matches zero rows
          // and the whole revert below is skipped.
          const invoiceFlip = await tx.holdInvoice.updateMany({
            where: { id: invoice.id, status: 'PENDING' },
            // P0 fix (2026-08-17): null the @unique `reservationId` anchor in the same
            // flip. HoldInvoice_reservationId_key is live in Postgres and nothing ever
            // cleared it, so one expired invoice permanently bricked that hold -- every
            // later invoice attempt died with P2002 on reservationId. Clearing
            // ItemReservation.invoiceId below was only half the link; this is the other
            // half. `itemIds` still records everything this invoice billed.
            data: { status: 'EXPIRED', reservationId: null },
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
            // invoiceClaimToken/invoiceClaimedAt cleared too (2026-08-17), matching
            // releaseInvoice: a stale in-flight claim left on a reverted hold fails
            // invoiceableWhere() and blocks the retry this revert exists to enable.
            data: { status: 'CONFIRMED', invoiceId: null, invoiceClaimToken: null, invoiceClaimedAt: null },
          });

          return { reverted: true };
        });

        if (!result.reverted) {
          continue;
        }

        // Notification-gap fix (S1195 sweep continuation, 2026-08-08): this previously
        // wrote a raw tx.notification.create() inside the transaction above, which made
        // email structurally impossible (the shared createNotification() helper writes
        // through the global `prisma` client, not a $transaction's `tx`). The shopper's
        // hold is still active after this revert, but their payment window just closed --
        // they need to know promptly enough to decide whether to retry, not just whenever
        // they next happen to open the app. Moved outside the transaction (fire-and-forget,
        // matching every other post-commit notification in this job's sibling crons).
        createNotification({
          userId: invoice.shopperUserId,
          type: 'invoice_expired',
          title: 'Invoice expired',
          body:
            invoice.itemIds.length > 1
              ? `Your invoice for ${invoice.itemIds.length} items expired before payment was completed. Your hold remains active.`
              : 'Your invoice expired before payment was completed. Your hold remains active.',
          link: invoice.itemIds[0] ? `/items/${invoice.itemIds[0]}` : undefined,
          channel: 'OPERATIONAL',
          sendEmail: true,
        }).catch((err: unknown) => console.error(`[invoiceExpiryJob] Failed to create invoice_expired notification for invoice ${invoice.id}:`, err));

        // Stripe-side cancellation. Non-fatal to this job, but NOT best-effort-and-
        // forget any more (P1, 2026-08-17): the items were just handed back to RESERVED,
        // so a Checkout Session left OPEN is a live payment link against stock that is
        // on sale again. expireCheckoutSessionSafely retrieves first (finding
        // connected-account sessions, and treating an already-terminal session as the
        // success it is rather than an error) and reports any session that survives
        // still-payable to Sentry. Mirrors releaseInvoice, which uses the same helper.
        // NOTE: the Stripe expires_at handed to Checkout is CLAMPED up to Stripe's
        // 30-minute floor (utils/stripeCheckoutExpiry.ts), so a session can and does
        // outlive its HoldInvoice.expiresAt by up to ~31 minutes -- "Stripe already
        // auto-expired it" is not a safe assumption on this path.
        // Null-guarded: the NO-SESSION-RECLAIM branch above now reaches this point too,
        // and it has no session to close by definition.
        if (invoice.stripeSessionId) {
          const closure = await expireCheckoutSessionSafely(invoice.stripeSessionId, {
            stripeAccount: invoice.stripeAccountId ?? invoice.sale?.organizer?.stripeConnectId ?? null,
            context: `invoiceExpiryJob invoice=${invoice.id}`,
          });
          if (closure.stillPayable) {
            console.error(`[invoiceExpiryJob] Invoice ${invoice.id} reverted but its Checkout Session ${invoice.stripeSessionId} is STILL PAYABLE (${closure.state}). Reported to Sentry.`);
          }
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
