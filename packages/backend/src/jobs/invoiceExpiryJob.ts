import cron from 'node-cron';
import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { releaseCrewInvasionRedemptionsForInvoice } from '../services/crewInvasionRedemptionService'; // Crew Invasion per-member redemption (2026-09-29): an expired UNPAID discounted invoice gives the member's discount back
import { prepareSquareInvoiceForRelease, recordSquarePaidInvoiceFromGate } from '../services/holdInvoiceSquareRelease'; // 2026-09-29 money review P0-2: a Square invoice is checked for payment and its payment link cancelled BEFORE it is expired
import { createNotification } from '../lib/notificationService'; // S1195 sweep continuation (2026-08-08): invoice_expired notification-gap fix

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
 * STRIPE RETIRED (owner decision 2026-11-04): this job makes no Stripe calls. A historical invoice
 * with a stripeSessionId cannot be verified paid/unpaid any more, so it is left untouched (counted
 * and logged) for manual review rather than reverted blindly.
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
 * Square invoices (money review P0-2, 2026-09-29): a Square hold invoice (processor SQUARE) is a
 * hosted Payment Link the shopper can pay at any time, so it is NOT one of the "no payment
 * mechanism" invoices above. Each one goes through services/holdInvoiceSquareRelease.ts's gate
 * BEFORE the expiry flip: Square says paid -> record the sale via markHoldInvoicePaid (never expire),
 * anything ambiguous -> leave the invoice PENDING and retry on the next run, link cancelled -> expire.
 *
 * Kill-switch: set INVOICE_EXPIRY_RECLAIM_DISABLED=1 to make the job
 * early-return (rollback lever, matching posStrandedSaleReconcileCron.ts's
 * POS_RECONCILE_DISABLED convention).
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
        // Square hold invoices (2026-09-29, money review P0-2): what the release gate needs to ask
        // Square whether the link was paid and to cancel it.
        processor: true,
        squareOrderId: true,
        squarePaymentLinkId: true,
        squarePaymentId: true,
        sale: { select: { organizerId: true, organizer: { select: { stripeConnectId: true } } } },
      },
    });

    if (candidates.length === 0) return;

    console.log(`[invoiceExpiryJob] Checking ${candidates.length} PENDING HoldInvoice row(s) past their own expiresAt.`);

    let reclaimed = 0;
    let strandedPaidCount = 0;
    let skippedNoSession = 0;
    let squareRetryLater = 0;
    // Stripe is retired (2026-11-04): this job makes no Stripe calls. A historical Stripe-session invoice
    // cannot be verified paid/unpaid, so it is left untouched for manual review. Square rows and the
    // non-Stripe branches below run exactly as before.
    let stripeSkippedClosed = 0;

    for (const invoice of candidates) {
      try {
        if (invoice.processor === 'SQUARE') {
          // Money review P0-2 (2026-09-29). A Square hold invoice is a hosted Payment Link the
          // shopper can pay at any time, and this branch used to be missing entirely: a Square
          // invoice has no stripeSessionId and no cartSessionId, so it fell into the
          // NO-SESSION-RECLAIM else-branch below, whose comment claimed it "can never have been
          // paid". That was true of the old no-checkout MVP invoice and false for a Square one:
          // the link stayed live after the invoice was expired and the items went back on sale.
          //
          // Order matters: ask Square whether it was paid, then CANCEL the link, and only then let
          // the transaction below flip the status. PAID means record the sale, never expire it.
          // RETRY (Square unreachable, cancel refused, order still open) means leave the invoice
          // PENDING: this job runs every 10 minutes and simply tries again.
          const gate = await prepareSquareInvoiceForRelease({
            invoice,
            organizerId: invoice.sale?.organizerId ?? null,
            context: `invoiceExpiryJob invoice=${invoice.id}`,
          });
          if (gate.outcome === 'PAID') {
            strandedPaidCount++;
            const recorded = await recordSquarePaidInvoiceFromGate(invoice.id, gate, `invoiceExpiryJob invoice=${invoice.id}`);
            const paidMsg = `[invoiceExpiryJob] SQUARE-PAID invoice=${invoice.id} order=${invoice.squareOrderId ?? 'n/a'} -- Square shows this invoice paid but our DB still had it PENDING past its expiresAt (webhook missed). ${gate.detail}. Recorded: ${recorded}.`;
            console.error(paidMsg);
            try {
              Sentry.captureMessage(paidMsg, 'error');
            } catch {
              // Sentry may not be initialized -- silently continue
            }
            continue;
          }
          if (gate.outcome === 'RETRY') {
            squareRetryLater++;
            console.warn(`[invoiceExpiryJob] SQUARE-RETRY invoice=${invoice.id} -- NOT expiring yet: ${gate.detail}. Will retry next run.`);
            continue;
          }
          console.log(`[invoiceExpiryJob] SQUARE-CLEAR invoice=${invoice.id} -- ${gate.detail}. Expiring.`);
        } else if (invoice.stripeSessionId) {
          stripeSkippedClosed++;
          continue;
        } else if (invoice.cartSessionId) {
          // POS cart invoice with NO card session -- a cash-only split
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
          // A legacy sendHoldInvoice "simplified for MVP -- no actual Stripe Checkout" invoice
          // (processor STRIPE, no session, no cart): there is NO payment mechanism attached to
          // it at all, on any account, so it can never have been paid. That is true ONLY for
          // that legacy shape. It is NOT true of a Square invoice (processor SQUARE), which has
          // a live Payment Link and is handled by its own branch at the top of this chain
          // (paid-check, then link cancel) before it can ever reach this point. Reverting here is
          // correct for the legacy shape, and NOT reverting is what leaves the item unsellable
          // forever. Falls through to the normal revert transaction below (which is already
          // guarded on Item.status = INVOICE_ISSUED, so an item settled through another channel
          // in the meantime is never dragged backwards).
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

        // Crew Invasion per-member redemption (2026-09-29): this UNPAID invoice just flipped to
        // EXPIRED, so give the shopper's crew discount back (it applies again on the next invoice
        // only while the code itself is still unexpired). After the transaction commit on purpose,
        // never throws: it cannot undo or block the reclaim.
        await releaseCrewInvasionRedemptionsForInvoice(invoice.id);

        // Notification-gap fix (S1195 sweep continuation, 2026-08-08): this previously
        // wrote a raw tx.notification.create() inside the transaction above, which made
        // email structurally impossible (the shared createNotification() helper writes
        // through the global `prisma` client, not a $transaction's `tx`). The shopper's
        // hold is still active after this revert, but their payment window just closed --
        // they need to know promptly enough to decide whether to retry, not just whenever
        // they next happen to open the app. Moved outside the transaction (fire-and-forget,
        // matching every other post-commit notification in this job's sibling crons).
        // Guest invoice (2026-09-16, nullable shopperUserId): no real User row to write
        // an in-app/email notification against via this helper -- skip it for a guest
        // invoice, same guard holdInvoicePaymentRecorder.ts already uses for this
        // nullability.
        if (invoice.shopperUserId) {
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
        }

        reclaimed++;
      } catch (err: any) {
        console.error(`[invoiceExpiryJob] Failed to reclaim invoice ${invoice.id} -- will retry next run:`, err?.message ?? err);
      }
    }

    if (stripeSkippedClosed > 0) {
      console.info(`[invoiceExpiryJob] Stripe is retired -- left ${stripeSkippedClosed} historical Stripe-session invoice(s) untouched for manual review (no Stripe API calls).`);
    }

    console.log(`[invoiceExpiryJob] Reclaimed ${reclaimed} expired invoice(s); ${strandedPaidCount} STRANDED-PAID (auto-reconciled where possible, see per-invoice logs + Sentry); skipped ${skippedNoSession} NO-SESSION (needs manual review); ${squareRetryLater} Square invoice(s) held back until Square can confirm the link is cancelled.`);
  } catch (error) {
    console.error('[invoiceExpiryJob] Error:', error);
  }
};

// Every 10 minutes, same cadence as reservationExpiryJob.ts.
cron.schedule('2,12,22,32,42,52 * * * *', cronGuard({ jobName: 'invoiceExpiryJob' }, async () => { // staggered off reservationExpiryJob's */10 2026-08-04 cost-optimization batch
  await reclaimExpiredInvoices();
}));
