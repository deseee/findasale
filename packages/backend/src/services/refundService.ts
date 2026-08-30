import { prisma } from '../lib/prisma';
import { getStripe } from '../utils/stripe';
import { notifyVendorBoothSaleRefunded } from './vendorBoothSaleNotificationService'; // tell the vendor their booth sale was refunded
import { settleHubOwnerReversalForLeg } from '../controllers/vendorBoothCartController'; // P1 (2026-07-28): durable hub-owner Transfer reversal settlement
import { transactionalEmailService } from '../lib/transactionalEmailService';
import { createNotification } from '../lib/notificationService'; // organizer clawback notification (see below)

// Lazy — avoids crash when module loads before dotenv runs (same pattern as stripeController.ts)
const stripe = () => getStripe();

/**
 * PART B GATE (2026-07-28) — organizer-initiated refunds only (createRefund, regular branch).
 * Moved here unchanged from stripeController.ts as part of the executeVerifiedRefund
 * extraction (see below) — DO NOT change this flag or its default. See stripeController.ts's
 * original comment block (git history) for the full money-path rationale.
 */
const refundClawbackEnabled = (): boolean =>
  process.env.STRIPE_REFUND_LIVE_CLAWBACK === 'true';

/**
 * Dispute clawback (2026-08-08) -- separate, distinct flag from refundClawbackEnabled above.
 * Do NOT overload STRIPE_REFUND_LIVE_CLAWBACK; that flag is locked/single-purpose (see its
 * own comment). Gates the charge.dispute.closed (lost) Transfer Reversal in
 * stripeController.ts. Default OFF (unset != 'true') -- new money-moving code against a
 * live account, same rollout discipline as every prior money-path change in this file.
 */
export const disputeClawbackEnabled = (): boolean =>
  process.env.STRIPE_DISPUTE_LIVE_CLAWBACK === 'true';

/**
 * Platform Safety #100: First-Month Refund Cap (50%)
 * If requester account is < 30 days old, cap refund amount at 50% of original
 */
export const applyFirstMonthRefundCap = async (userId: string, originalAmount: number): Promise<{ cappedAmount: number; wasCapped: boolean }> => {
  // Get user account creation date
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true }
  });

  if (!user) {
    throw new Error('User not found');
  }

  const now = new Date();
  const accountAgeMs = now.getTime() - new Date(user.createdAt).getTime();
  const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);

  // Account is < 30 days old — apply 50% cap
  if (accountAgeDays < 30) {
    const cappedAmount = Math.floor(originalAmount * 0.5);
    return {
      cappedAmount,
      wasCapped: true
    };
  }

  // Account is >= 30 days old — no cap
  return {
    cappedAmount: originalAmount,
    wasCapped: false
  };
};

/**
 * Log refund processing with cap information
 */
export const logRefundProcessing = async (disputeId: string, userId: string, originalAmount: number, processedAmount: number, wasCapped: boolean): Promise<void> => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    disputeId,
    userId,
    originalAmount,
    processedAmount,
    wasCapped,
    cappedReason: wasCapped ? 'Platform Safety #100: First-month refund cap (50%)' : null
  };

  console.log('Refund processing:', logEntry);

  // Optionally: persist to database if a RefundLog model exists
  // For now, logging to console for audit trail
};

/**
 * Thrown by executeVerifiedRefund for every failure case. `statusCode` lets callers
 * (stripeController's createRefund, disputeController's updateDisputeStatus) translate
 * the failure into the right HTTP response without executeVerifiedRefund knowing anything
 * about Express. `details` carries any extra fields the original inline handler returned
 * alongside `message` (e.g. purchaseAgeDays on the 30-day-window failure).
 */
export class RefundError extends Error {
  statusCode: number;
  details?: Record<string, unknown>;

  constructor(message: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'RefundError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Shared buyer-facing refund confirmation email. Extracted verbatim (content and
 * fire-and-forget semantics unchanged) from stripeController.ts's createRefund so that
 * BOTH the organizer/admin-initiated refund endpoint (POST /api/stripe/refund/:purchaseId)
 * and a dispute-triggered refund (disputeController.ts updateDisputeStatus) send the buyer
 * the SAME real confirmation — a buyer must never see "resolved" without also being told
 * their money is actually moving.
 *
 * Deliberately NOT awaited by callers (matches original behavior): the refund has already
 * succeeded on Stripe by the time this is called, so a slow/failed email must never block
 * or fail the response. Failures are caught and logged here, never thrown.
 */
export function sendRefundConfirmationEmail(params: {
  toEmail?: string | null;
  buyerName?: string | null;
  refundAmount: number;
  wasCapped: boolean;
  itemTitle?: string | null;
  organizerBusinessName?: string | null;
}): void {
  if (!params.toEmail) return;

  const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'support@finda.sale';
  const itemTitle = params.itemTitle || 'your purchase';
  const baseUrl = process.env.FRONTEND_URL || 'https://finda.sale';

  transactionalEmailService.emails.send({
    from: fromEmail,
    to: params.toEmail,
    subject: 'Refund processed for your FindA.Sale purchase',
    html: `
          <h2>Refund Processed</h2>
          <p>Hi ${params.buyerName || 'Shopper'},</p>
          <p>We've issued a refund of <strong>$${params.refundAmount.toFixed(2)}</strong> for <strong>${itemTitle}</strong> from <strong>${params.organizerBusinessName || 'a sale'}</strong>.</p>
          <p>The refund will appear in your original payment method within 1-2 business days.</p>
          ${params.wasCapped ? `<p style="color: #ef4444; font-size: 14px;"><strong>Note:</strong> Your refund was capped at 50% because your account is less than 30 days old (Platform Safety Policy #100).</p>` : ''}
          <p><a href="${baseUrl}/shopper/purchases">View your purchase history</a></p>
        `,
  }).catch((err: unknown) => console.warn('[refund] Failed to send confirmation email:', err));
}

/**
 * executeVerifiedRefund — the reusable, Stripe-calling core of what used to be
 * stripeController.ts's createRefund, extracted 2026-07-29 so a SECOND caller
 * (disputeController.ts updateDisputeStatus) can actually move money instead of only
 * updating a status string and lying to the buyer about a refund that never happened.
 *
 * This function does NOT do auth/ownership/role checks — those are HTTP-request-specific
 * and stay in each caller (createRefund's organizer/admin + own-sale checks;
 * disputeController's admin check + orderId-to-Purchase ownership check). This function
 * also does NOT apply the first-month refund cap — each caller computes its own idea of
 * the "requested" amount before capping (createRefund caps purchase.amount; disputeController
 * caps the dispute's requested refundAmount) and passes the ALREADY-CAPPED `refundAmount` in.
 *
 * `initiatedBy` (Refund History, 2026-07-29) records WHO/WHAT triggered the refund —
 * 'organizer' or 'admin' from createRefund (matching its own role check), 'dispute' from
 * disputeController's updateDisputeStatus — onto Purchase.refundInitiatedBy, alongside
 * refundedAmount/refundedAt, so payoutController.ts's getRefundHistory has something to read.
 *
 * Every other check and code path createRefund had inline — PAID-status check,
 * payment-intent-exists check, 30-day window, the PAID->REFUNDING TOCTOU compare-and-swap
 * claim, the idempotency key, the booth-cart-vs-destination-charge Stripe call branching,
 * the STRIPE_REFUND_LIVE_CLAWBACK-gated organizer clawback, the vendor-booth notification,
 * and the hub-owner Transfer reversal — is preserved here EXACTLY as it existed in
 * createRefund. This is a move, not a rewrite: no safety behavior changed.
 */
export async function executeVerifiedRefund(
  purchaseId: string,
  refundAmount: number,
  initiatedBy: 'organizer' | 'admin' | 'dispute',
  // Optional Stripe refund reason (2026-08-28, carding-incident follow-up): threads through to
  // refunds.create's own `reason` field so a confirmed-fraud refund is actually tagged as such
  // in Stripe (feeds Radar/reporting) instead of going out with no reason at all regardless of
  // why it was issued. Optional + backward compatible -- every existing caller (createRefund/
  // organizer, disputeController, deadInvoiceRefundService) keeps working unchanged.
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
): Promise<{
  refundedAmount: number;
  purchase: {
    id: string;
    userId: string | null;
    amount: number;
    itemId: string | null;
    user: { id: string; email: string; name: string } | null;
    item: { title: string } | null;
    sale: { organizer: { businessName: string } | null } | null;
  };
}> {
  // Own fetch — same includes createRefund used. Self-contained: safe to call from any
  // caller's authorization context without relying on a purchase object fetched elsewhere.
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      user: { select: { id: true, email: true, name: true } },
      sale: {
        include: {
          // stripeConnectId (PART B, 2026-07-28): needed to determine whether this
          // purchase's charge was routed through Connect as a destination charge before
          // any Transfer can be reversed.
          organizer: { select: { id: true, userId: true, businessName: true, stripeConnectId: true } }
        }
      },
      item: {
        select: {
          title: true,
          // ADR-020: booth-cart purchases refund against the ITEM's own vendor
          // booth's Standard account, not the platform/organizer account — each
          // booth's leg is its own Direct charge (PaymentIntent) on its own
          // stripeAccountId now, so the refund call must be scoped the same way.
          vendorBooth: { select: { id: true, stripeAccountId: true, stripeAccountType: true, vendorName: true } },
        },
      },
    },
  });

  if (!purchase) {
    throw new RefundError('Purchase not found', 404);
  }

  if (purchase.status !== 'PAID') {
    throw new RefundError('Only paid purchases can be refunded', 400);
  }

  // Cash-recorded POS sales (terminalController.ts, vendorBoothCartController.ts,
  // reservationController.ts's RECORD settlement mode) get a placeholder
  // stripePaymentIntentId of the form `cash_<uuid>` instead of a real Stripe PaymentIntent --
  // there is no Stripe charge behind them to reverse. Reuses the exact discriminator
  // convention terminalController.ts already applies elsewhere
  // (`!p.stripePaymentIntentId.startsWith('cash_')`) rather than inventing a new one.
  //
  // A genuinely NULL stripePaymentIntentId (found live 2026-08-29: reservationController.ts's
  // markSold/RECORD-mode path was creating Purchase rows with this field unset entirely,
  // before the cash_ placeholder was added there) is now treated as the SAME no-real-charge
  // case -- there is no Stripe object to look up either way, so it must not be rejected
  // before reaching this check. The old unconditional "no payment intent" throw ran BEFORE
  // this discriminator and hard-errored on null (and would also have thrown on `.startsWith`
  // being called on null/undefined even if it hadn't) -- removed; a null value now flows into
  // the same skip-Stripe branch as a `cash_` value instead of being rejected outright.
  //
  // A cash purchase (or a null-stripePaymentIntentId purchase) still goes through the TOCTOU
  // claim, the REFUNDED finalize, the hold release, and the stockSold decrement below -- only
  // the actual Stripe API call is skipped for it.
  const isCashPurchase = !purchase.stripePaymentIntentId || purchase.stripePaymentIntentId.startsWith('cash_');

  // P2-2: Verify purchase is within 30 days
  const purchaseAgeMs = Date.now() - purchase.createdAt.getTime();
  const purchaseAgeDays = purchaseAgeMs / (1000 * 60 * 60 * 24);
  if (purchaseAgeDays > 30) {
    throw new RefundError(
      'Refunds can only be issued within 30 days of purchase',
      400,
      { purchaseAgeDays: Math.floor(purchaseAgeDays) }
    );
  }

  // Hardening (added after independent security review of the disputeController wiring):
  // executeVerifiedRefund now has a second caller (disputeController) that passes an
  // admin-supplied refundAmount with no app-level upper bound before this point — only
  // Stripe's own "amount_too_large" rejection caught an over-amount refund before. That
  // failed safe (claim reverts to PAID, dispute never marked resolved) but relied on an
  // opaque third-party error instead of an explicit application-level guard. Enforce it here
  // so both callers (createRefund and disputeController) get the same explicit protection.
  if (!(refundAmount > 0) || refundAmount > purchase.amount) {
    throw new RefundError(
      'Refund amount must be greater than zero and cannot exceed the original purchase amount',
      400,
      { requestedAmount: refundAmount, purchaseAmount: purchase.amount }
    );
  }

  // Booth-cart purchases have no purchase.saleId (a BoothCartTransaction spans a
  // hub, not one Sale) — this drives the Stripe branching below exactly as it did
  // in createRefund.
  const isBoothCartPurchase = !!purchase.boothCartTransactionId;

  // P3 (TOCTOU lock): atomically claim the PAID->refund transition BEFORE calling Stripe.
  // Purchase.status is a free String field (no Prisma enum — documented values PENDING, PAID,
  // REFUNDED, FAILED, DISPUTED), so using an intermediate 'REFUNDING' marker needs NO schema
  // change. The conditional updateMany only matches a row still in 'PAID', so exactly one
  // concurrent request wins the claim; every other request sees count 0 and is rejected.
  // Status is set to REFUNDED only after Stripe confirms; on Stripe failure it is reverted to
  // PAID so the caller can retry.
  const claim = await prisma.purchase.updateMany({
    where: { id: purchaseId, status: 'PAID' },
    data: { status: 'REFUNDING' }
  });
  if (claim.count !== 1) {
    throw new RefundError('Refund already in progress or not refundable', 400);
  }

  // ADR-020 refund rework: booth-cart purchases (isBoothCartPurchase) live on
  // their ITEM's vendor booth's own Standard account — the PaymentIntent was
  // created there as a Direct charge, so the refund call must pass that same
  // { stripeAccount } option or Stripe can't find the PaymentIntent at all (it
  // doesn't exist on the platform account). Regular purchases are unaffected —
  // createPaymentIntent uses transfer_data.destination (a destination charge that
  // DOES live on the platform account), so no stripeAccount option for those,
  // exactly as before this change.
  const boothStripeAccountId = purchase.item?.vendorBooth?.stripeAccountId;
  if (isBoothCartPurchase && !boothStripeAccountId) {
    await prisma.purchase.updateMany({ where: { id: purchaseId, status: 'REFUNDING' }, data: { status: 'PAID' } });
    throw new RefundError(
      "This item's vendor booth has no Stripe account on file. Cannot resolve which account to refund.",
      400
    );
  }

  // Direct-charges migration (2026-08-08): chargeType is a persisted, authoritative field
  // set once at charge-creation time (createPaymentIntent / checkout session creation) —
  // never inferred after the fact. Replaces the prior organizerConnectId-presence inference
  // that lived here. Regular (non-booth-cart) purchases are either DESTINATION or DIRECT.
  const isDirectCharge = !isBoothCartPurchase && purchase.chargeType === 'DIRECT';
  const isRegularDestinationCharge = !isBoothCartPurchase && purchase.chargeType === 'DESTINATION';
  // Cash purchases (see isCashPurchase above) fall through to chargeType's schema default
  // ('DESTINATION') because non-booth cash sales never set chargeType explicitly
  // (terminalController.ts's card path does; its cash path does not) -- so
  // isRegularDestinationCharge alone would misclassify a cash sale as clawback-eligible.
  // Guarded here (not just at the now-skipped Stripe-call site) because applyOrganizerClawback
  // is also read below to decide whether to send the organizer a "refund deducted from your
  // payout" notification -- without this guard that notification would fire for a cash refund
  // even though no real Stripe reverse_transfer ever happens for one.
  const applyOrganizerClawback = !isCashPurchase && refundClawbackEnabled() && isRegularDestinationCharge;

  if (isDirectCharge && !purchase.stripeAccountId) {
    await prisma.purchase.updateMany({ where: { id: purchaseId, status: 'REFUNDING' }, data: { status: 'PAID' } });
    throw new RefundError(
      'This purchase is a Direct charge but has no stripeAccountId on file. Cannot resolve which account to refund.',
      400
    );
  }

  // Cash purchases have no real Stripe charge to reverse -- skip the API call entirely and
  // fall straight through to the shared finalize-to-REFUNDED path below. Every other Stripe-
  // backed purchase (booth-cart, Direct, destination-charge, clawback) is completely
  // unaffected -- this is the ONLY conditional part of the function; everything before and
  // after it (the TOCTOU claim above, the REFUNDED finalize / hold release / stockSold
  // decrement below) still runs exactly once regardless of which branch was taken.
  if (!isCashPurchase) {
    try {
      await stripe().refunds.create({
        // Non-null assertion is safe here: this whole block is gated on `!isCashPurchase`,
        // and isCashPurchase is `!purchase.stripePaymentIntentId || ...startsWith('cash_')` --
        // so stripePaymentIntentId is guaranteed truthy whenever this branch runs. TypeScript
        // can't infer that from the separately-computed `isCashPurchase` boolean on its own
        // (no early unconditional null-check remains above to narrow the property directly,
        // unlike before this fix), so the assertion documents what the runtime guard proves.
        payment_intent: purchase.stripePaymentIntentId!,
        amount: Math.round(refundAmount * 100), // Convert to cents
        ...(reason ? { reason } : {}),
        // P1 money-path fix (2026-07-28): booth-cart legs are DIRECT charges on the
        // booth's own connected account — see stripeController.ts (git history) for the
        // full Stripe-semantics rationale this was moved from, unchanged.
        ...(isBoothCartPurchase ? { refund_application_fee: true } : {}),
        // Direct-charges migration (2026-08-08): Stripe does NOT auto-refund the application
        // fee on a Direct charge the way reverse_transfer does for a destination charge — this
        // must ALWAYS fire for a Direct-charge refund, never gated behind a flag, or the
        // platform keeps its commission on a refunded sale. No reverse_transfer param — there
        // is no Transfer object for a Direct charge.
        ...(isDirectCharge ? { refund_application_fee: true } : {}),
        // PART B (2026-07-28) — DEFAULT OFF, gated on STRIPE_REFUND_LIVE_CLAWBACK.
        // Mutually exclusive with the booth-cart and Direct-charge spreads above.
        ...(applyOrganizerClawback
          ? { reverse_transfer: true, refund_application_fee: true }
          : {}),
      }, {
        idempotencyKey: `refund-${purchase.id}`,
        ...(isBoothCartPurchase ? { stripeAccount: boothStripeAccountId! } : {}),
        // Direct-charges migration (2026-08-08): a Direct charge lives on the connected
        // account itself, not the platform account — the refund call must be scoped there.
        ...(isDirectCharge ? { stripeAccount: purchase.stripeAccountId! } : {}),
      });
    } catch (stripeErr) {
      // Stripe failed — revert the claim back to PAID so the caller can retry. Rethrow the
      // ORIGINAL error unwrapped (not a RefundError) so callers' generic catch-all handling
      // produces the same 500 response createRefund always has for a Stripe failure.
      await prisma.purchase.updateMany({
        where: { id: purchaseId, status: 'REFUNDING' },
        data: { status: 'PAID' }
      });
      throw stripeErr;
    }
  }

  // Stripe confirmed — finalize status to REFUNDED, and record Refund History
  // (2026-07-29): refundedAmount/refundedAt/refundInitiatedBy are nullable/additive columns
  // (see schema.prisma + migrations/20260729030000_purchase_refund_history_fields) so a
  // refunded purchase is no longer silently invisible everywhere in the product — see
  // payoutController.ts's getRefundHistory, which reads exactly these three fields.
  await prisma.purchase.update({
    where: { id: purchaseId },
    data: {
      status: 'REFUNDED',
      refundedAmount: refundAmount,
      refundedAt: new Date(),
      refundInitiatedBy: initiatedBy,
    }
  });

  // Release the associated hold, if any (P0 fix 2026-08-26 -- same failure class as the
  // multi-stock partial-sale status revert, see ADR-multi-stock-partial-sale-status-revert
  // -2026-08-25.md's "ADR ADDENDUM"). ItemReservation.itemId is @unique -- "one active hold
  // per item" -- and placeHold's stale-cleanup deleteMany (reservationController.ts) only
  // ever clears CANCELLED/EXPIRED/COMPLETED rows. Before this fix, a refunded Hold-to-Pay
  // purchase left its ItemReservation stuck at CONFIRMED forever, so the item's own unique
  // hold slot was permanently occupied and no future placeHold on that item could ever
  // succeed again, even though Item.status was correctly reset to AVAILABLE above (by each
  // caller, right after this function returns).
  //
  // Deliberately 'CANCELLED', never 'COMPLETED': this was a refund, not a completed sale --
  // performanceService.ts's computeHoldMetrics and reputationService.ts's hold-response-time
  // query both read a 'COMPLETED' ItemReservation as a genuine paid conversion, so marking a
  // refunded hold 'COMPLETED' would silently inflate those metrics.
  //
  // Fixed HERE (in the shared executeVerifiedRefund) rather than duplicated into both
  // callers' own Item.status = 'AVAILABLE' blocks (stripeController.ts's createRefund,
  // disputeController.ts's updateDisputeStatus) -- this function exists specifically so
  // those two callers share one hardened refund path instead of drifting copies (see the
  // file-level comment above), and any future refund caller gets this fix for free.
  // updateMany + a NOT-terminal filter (not a plain update to a hardcoded id) makes this a
  // safe no-op for the common case where the refunded purchase was a direct Buy-It-Now sale
  // with no ItemReservation row at all, and never clobbers a row that's already terminal.
  // Non-fatal: the buyer's refund has already succeeded on Stripe and Purchase.status is
  // already REFUNDED by this point, so a failure here must never surface as a failed refund.
  if (purchase.itemId) {
    try {
      await prisma.itemReservation.updateMany({
        where: { itemId: purchase.itemId, status: { notIn: ['CANCELLED', 'EXPIRED', 'COMPLETED'] } },
        data: { status: 'CANCELLED' },
      });
    } catch (err) {
      console.error(`[executeVerifiedRefund] Failed to reset ItemReservation for item ${purchase.itemId} after refund of purchase ${purchaseId} (non-fatal):`, err);
    }
  }

  // Stock-count reset (2026-08-27 fix): mirrors the ItemReservation fix directly above --
  // a refunded purchase decremented Item.stockSold at sale time (sellItemUnits.ts) but this
  // function never reversed that on refund, so a refunded item's stock counter stayed
  // permanently "sold" even after each caller resets Item.status back to AVAILABLE right
  // after this function returns. A single-stock item (stockTotal defaults to 1, matching
  // sellItemUnits' own COALESCE) is invisibly blocked from ever selling again -- confirmed
  // live 2026-08-27: a real $0.75 POS Payment Link payment was captured by Stripe for
  // exactly this reason, but posPaymentLinkRecorder.ts's own oversell guard correctly
  // refused to record a duplicate Purchase against a stockSold count that looked exhausted
  // (see S-PAYMENT-LINK-REDIRECT-WEBHOOK-2026-08-26 QA session). Floored at 0 via the
  // stockSold:{gt:0} WHERE guard (an atomic updateMany, never goes negative even under a
  // concurrent refund) -- same try/catch/non-fatal contract as the ItemReservation reset
  // above, since the buyer's refund has already succeeded on Stripe by this point.
  if (purchase.itemId) {
    try {
      await prisma.item.updateMany({
        where: { id: purchase.itemId, stockSold: { gt: 0 } },
        data: { stockSold: { decrement: 1 } },
      });
    } catch (err) {
      console.error(`[executeVerifiedRefund] Failed to decrement stockSold for item ${purchase.itemId} after refund of purchase ${purchaseId} (non-fatal):`, err);
    }
  }

  // Cash-fee-balance reversal (2026-08-30 fix): a CASH-settled purchase (isCashPurchase)
  // accrues its commission into Organizer.cashFeeBalance at sale time via
  // services/cashFeeService.ts's accrueCashFeeBalance (see reservationController.ts's RECORD
  // mode and terminalController.ts's cash paths, all three of which stamp the exact accrued
  // amount onto Purchase.platformFeeAmount for this reason). Before this fix, refunding a cash
  // purchase through ANY path (this shared function, including the admin refund tool) never
  // reversed that accrual -- the organizer's next payout still deducted commission on a sale
  // that was refunded and never actually kept. Confirmed live 2026-08-30: Artifact's dashboard
  // showed "$8.20 in commission due on your cash sales" while several of the underlying cash
  // Purchase rows had already been refunded (test data) -- the balance was never adjusted down.
  // Reverses by this purchase's own stored platformFeeAmount (not a recomputed rate -- avoids
  // rate drift if the organizer's tier changed between sale and refund), floored at 0 via the
  // same gte-guard-then-zero pattern as the stockSold reset above. A card purchase's commission
  // is already reversed by Stripe's own application-fee-refund mechanism (refund_application_fee
  // above) -- this block is cash-only. Non-fatal: the refund has already succeeded by this point.
  if (isCashPurchase && purchase.platformFeeAmount && purchase.platformFeeAmount > 0) {
    const organizerId = purchase.sale?.organizer?.id;
    if (organizerId) {
      try {
        const reversed = purchase.platformFeeAmount;
        const decremented = await prisma.organizer.updateMany({
          where: { id: organizerId, cashFeeBalance: { gte: reversed } },
          data: { cashFeeBalance: { decrement: reversed }, cashFeeBalanceUpdatedAt: new Date() },
        });
        if (decremented.count === 0) {
          // Balance is already lower than this purchase's own accrual (e.g. a payout already
          // ran and zeroed it since this sale) -- floor at 0 rather than go negative.
          await prisma.organizer.updateMany({
            where: { id: organizerId },
            data: { cashFeeBalance: 0, cashFeeBalanceUpdatedAt: new Date() },
          });
        }
      } catch (err) {
        console.error(`[executeVerifiedRefund] Failed to reverse cashFeeBalance for organizer ${organizerId} after refund of purchase ${purchaseId} (non-fatal):`, err);
      }
    } else {
      console.error(`[executeVerifiedRefund] Cash purchase ${purchaseId} refunded but sale.organizer.id did not resolve -- cashFeeBalance reversal skipped`);
    }
  }

  // Tell the VENDOR their booth sale was refunded. No-ops on non-booth-cart purchases.
  // Fire-and-forget and never-throwing: the buyer's refund has already succeeded on Stripe
  // and must not be disturbed by a notification. Exactly-once without a new column: the
  // PAID -> REFUNDING compare-and-swap claim above admits only one caller into this block
  // per purchase.
  notifyVendorBoothSaleRefunded(purchaseId).catch(err =>
    console.error(`[executeVerifiedRefund] Vendor refund notification failed for purchase ${purchaseId} (non-fatal):`, err)
  );

  // Tell the ORGANIZER their payout was just docked, when the STRIPE_REFUND_LIVE_CLAWBACK
  // clawback actually fired (see applyOrganizerClawback above -- only reverse_transfer /
  // refund_application_fee refunds land here, never a booth-cart or clawback-disabled
  // refund). Root cause of the gap this closes: applyOrganizerClawback silently reduces the
  // organizer's payout with zero explanation anywhere in the app -- notifyVendorBoothSaleRefunded
  // above covers a completely different path (booth-cart vendor refunds) and never fires for a
  // regular destination-charge purchase. Fire-and-forget and never-throwing, same contract as
  // the vendor notification above: the buyer's refund has already succeeded on Stripe and must
  // never be disturbed by a notification failure.
  if (applyOrganizerClawback) {
    const clawbackOrganizerUserId = purchase.sale?.organizer?.userId;
    if (clawbackOrganizerUserId) {
      createNotification({
        userId: clawbackOrganizerUserId,
        type: 'refund_clawback',
        title: 'Refund deducted from your payout',
        body: `$${refundAmount.toFixed(2)} was deducted from your payout -- "${purchase.item?.title || 'an item'}"'s purchase was refunded.`,
        link: '/organizer/payouts',
        channel: 'OPERATIONAL',
        sendEmail: true,
      }).catch(err =>
        console.error(`[executeVerifiedRefund] Organizer clawback notification failed for purchase ${purchaseId} (non-fatal):`, err)
      );
    } else {
      console.error(`[executeVerifiedRefund] Organizer clawback applied for purchase ${purchaseId} but organizer.userId did not resolve -- notification skipped`);
    }
  }

  // ADR-090 Phase 2 refund clawback: a plain PaymentIntent refund does NOT claw back a
  // completed platform -> hub-owner Transfer — so booth-cart purchases whose leg received a
  // hub-owner revenue-share Transfer must have that Transfer reversed, proportional to how
  // much of the LEG's total this specific item's refund represents. See stripeController.ts
  // (git history) for the full P1 race-fix rationale this was moved from, unchanged.
  if (isBoothCartPurchase && purchase.stripePaymentIntentId) {
    try {
      const leg = await prisma.boothCartLeg.findUnique({ where: { stripePaymentIntentId: purchase.stripePaymentIntentId } });
      if (
        leg &&
        leg.hubOwnerShareAmount &&
        Number(leg.hubOwnerShareAmount) > 0 &&
        leg.amountCents > 0
      ) {
        const refundedCents = Math.round(refundAmount * 100);
        const hubOwnerShareCents = Math.round(Number(leg.hubOwnerShareAmount) * 100);
        const reversalCents = Math.min(
          hubOwnerShareCents,
          Math.round(hubOwnerShareCents * (refundedCents / leg.amountCents))
        );
        if (reversalCents > 0) {
          // Seed then increment: `increment` on a NULL column is a no-op in SQL
          // (NULL + n = NULL). The seed is itself conditional on null, so it is safe
          // to run concurrently, and the increment that follows is atomic — two
          // Purchases on the same leg refunded at the same instant both land.
          await prisma.boothCartLeg.updateMany({
            where: { id: leg.id, hubOwnerReversalOwedCents: null },
            data: { hubOwnerReversalOwedCents: 0 },
          });
          await prisma.boothCartLeg.update({
            where: { id: leg.id },
            data: { hubOwnerReversalOwedCents: { increment: reversalCents } },
          });
          // Executes now if the Transfer is already a real tr_... id; no-ops while it
          // is still null or 'CLAIMING', in which case transferHubOwnerShareForLeg
          // drains the watermark as soon as the Transfer lands.
          await settleHubOwnerReversalForLeg(leg.id);
        }
      }
    } catch (reversalErr) {
      console.error(`[executeVerifiedRefund] Failed to reverse hub-owner Transfer for purchase ${purchaseId} — hubOwnerReversalOwedCents on the leg records the outstanding amount:`, reversalErr);
    }
  }

  return {
    refundedAmount: refundAmount,
    purchase: {
      id: purchase.id,
      userId: purchase.userId,
      amount: purchase.amount,
      itemId: purchase.itemId,
      user: purchase.user ? { id: purchase.user.id, email: purchase.user.email, name: purchase.user.name } : null,
      item: purchase.item ? { title: purchase.item.title } : null,
      sale: purchase.sale ? { organizer: purchase.sale.organizer ? { businessName: purchase.sale.organizer.businessName } : null } : null,
    },
  };
}
