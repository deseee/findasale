import { Response } from 'express';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getIO } from '../lib/socket';
import { createNotification } from '../lib/notificationService';
import { awardXp, applyHuntPassMultiplier, XP_AWARDS } from '../services/xpService';
import { checkAndAward } from '../services/achievementService'; // Feature #58: Achievement tracking
import { endEbayListingIfExists } from './ebayController'; // Feature #244 Phase 2: eBay direct push — withdraw on sale
import { markShopifyItemSold } from '../services/shopifyService';
import { withdrawDiscogsListingIfExists } from '../services/marketplace/discogsListingConnector';
import { withdrawReverbListingIfExists } from '../services/marketplace/reverbConnector'; // 2026-09-23: withdraw Reverb listing on SOLD, beside Discogs
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService';
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService';
import { syncMarketplaceStock } from '../services/marketplaceStockSyncService'; // ADR-087 Phase 4: revise-on-partial eBay quantity sync
import { resolveOrganizerOrTeamMember } from '../utils/posAuth'; // S1183 Fix 1: TEAM_MEMBER fallback for non-venue POS
import { assertCheckoutAllowed, CheckoutGuardError, recordSuspectedSignal } from '../services/checkoutGuard'; // S1072 Finding #4 gap fix: POS payment-request self-dealing guard; recordSuspectedSignal: manual card entry has no verifiable buyer account either (2026-09-12)
import { snapshotForCommissionOnly, getInclusivePlatformFeeRate, calculateInclusiveCommissionCents } from '../utils/feeCalculator'; // Purchase fee snapshot (2026-08-17); inclusive-fee migration (2026-09-24, Patrick ruling): replaces getPlatformFeeRate (flat tier rate) at both card-fee sites in this file -- both are IN_PERSON channel (POS register, not buyer self-serve)
import { resolveCashCommissionRate, cashCommissionOn, accrueCashFeeBalance, applyCashDebtToAppFee, settleCashDebtCollection, wouldExceedCashFeeExposureCap, accrueSplitCashLegOnce, allocateCentsProportionally, validateSplitTender, cardLegProblem, isValidCents, MAX_POS_AMOUNT_CENTS } from '../services/cashFeeService'; // Split-payment cash-half commission accrual (2026-08-22) -- same mechanism terminalController/reservationController use; applyCashDebtToAppFee/settleCashDebtCollection: manual card entry cash-fee-debt recoupment (2026-09-12); wouldExceedCashFeeExposureCap: cash-fee exposure cap pre-check (2026-09-24, Patrick ruling)
import { resolvePosDiscount } from '../services/posDiscountService';
import { isPayoutFlaggedForReview } from '../services/connectAccountGuard'; // S1198 (2026-09-06): bank-fingerprint collusion hold, Organizer POS wiring
import * as stripePos from '../services/stripePosPaymentAdapter'; // Square migration Wave 1 #3 (2026-09-07): Stripe POS logic extracted verbatim, zero behavior change
import * as squarePos from '../services/squarePosPaymentAdapter'; // Square migration Wave 1 #3 (2026-09-07): phone-based Square POS adapter -- charge creation moved to accept/confirm time, see file header
import { transactionalEmailService } from '../lib/transactionalEmailService'; // 2026-09-16 fix: shopper receipt/notification email gap on manual-card + QR POS payments (mirrors cashPaymentController.ts's receipt pattern)


// ─── QA Test-Transaction Harness (2026-09-17) ───────────────────────────────────
// Reuses the SAME X-QA-Bypass / QA_RATE_LIMIT_BYPASS_SECRET mechanism
// squarePaymentController.ts's createSquareTestTransaction, index.ts and
// routes/auth.ts already gate QA-only behavior with. Re-declared locally here (not
// imported) -- none of those are exported, the same convention every other file
// re-declaring this identical 4-line check already follows (see
// squarePaymentController.ts's own header comment on isQABypassRequest for why).
// This is layered ON TOP OF, never instead of, each endpoint's own existing
// organizer/shopper authorization -- see manualCardPayment's and
// confirmPaymentRequest's own isTestBypassActive comments below for the exact
// authorization order each one uses.
const isQABypassRequest = (req: AuthRequest): boolean => {
  const secret = process.env.QA_RATE_LIMIT_BYPASS_SECRET;
  if (!secret) return false;
  return req.headers['x-qa-bypass'] === secret;
};

// Cash-fee exposure cap (2026-09-29): thrown INSIDE createPaymentRequest's SERIALIZABLE
// transaction so the authoritative cap re-check (which now also counts pending split cash) runs
// atomically with the insert -- see the call site for why the early pre-check alone was racy.
class CashFeeCapExceededError extends Error {}
const CASH_FEE_CAP_MESSAGE =
  'This cash amount would exceed the outstanding cash-commission limit on your account. Settle your balance with a card sale first, or contact support.';


// POS fulfillment failure (2026-09-29, money review P1-10): thrown INSIDE confirmPaymentRequest's
// fulfillment transaction when an item is sold out or gone AFTER the card was captured, so the whole
// transaction (PAID flip, cash-leg accrual, earlier stock decrements, Purchase rows) rolls back together.
class PosFulfillmentUnavailableError extends Error {
  itemId: string;
  detail: string;
  constructor(itemId: string, detail: string) {
    super(`Item ${itemId} unavailable after the card was captured: ${detail}`);
    this.name = 'PosFulfillmentUnavailableError';
    this.itemId = itemId;
    this.detail = detail;
  }
}

/**
 * Handle a POS request whose card was captured but whose items can no longer be fulfilled. Parks the
 * request in FULFILLMENT_FAILED (compare-and-swap, only from the pre-PAID states), auto-refunds the
 * captured card amount through the Square refund service, notifies the organizer and the shopper, and
 * answers the confirm call. Safe to call again for the same request (replay): it only resumes the
 * refund, which is idempotent, and re-notifies only when a previously pending refund newly completes.
 */
async function respondToPosFulfillmentFailure(
  res: Response,
  args: {
    posRequest: any;
    requestId: string;
    externalPaymentId: string | null;
    unavailableItemId: string | null;
    detail: string;
    firstFailure: boolean;
  }
) {
  const { posRequest, requestId, externalPaymentId, unavailableItemId, detail, firstFailure } = args;
  const wasAlreadyRefunded = posRequest.status === 'REFUNDED';
  try {
    if (firstFailure) {
      await prisma.pOSPaymentRequest.updateMany({
        where: { id: requestId, status: { in: ['ACCEPTED', 'EXPIRED', 'CANCELLED', 'DECLINED'] } },
        data: { status: 'FULFILLMENT_FAILED' },
      });
      try {
        Sentry.captureMessage(
          `[pos-payment] Item unavailable after capture on request ${requestId} (item ${unavailableItemId}); refunding the card amount.`,
          'error'
        );
      } catch {
        // Sentry may not be initialized -- silently continue
      }
    }
  } catch (err: any) {
    console.error('[pos-payment] could not mark request FULFILLMENT_FAILED:', err);
  }

  let refundStatus: 'REFUNDED' | 'REFUND_PENDING' | 'NOT_APPLICABLE' = 'REFUND_PENDING';
  try {
    const refundService = await import('../services/squareRefundService');
    const result = await refundService.refundFailedPosFulfillment(requestId);
    refundStatus = result.status;
  } catch (err: any) {
    console.error('[pos-payment] auto-refund after failed fulfillment threw:', err);
    try {
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { area: 'pos-fulfillment-failed-refund' },
        extra: { requestId, externalPaymentId },
      });
    } catch {
      // Sentry may not be initialized -- silently continue
    }
  }

  const refunded = refundStatus === 'REFUNDED';
  const cashCents = posRequest.isSplitPayment && posRequest.cashAmountCents ? Number(posRequest.cashAmountCents) : 0;
  const cardCents = posRequest.cardAmountCents ?? posRequest.totalAmountCents;
  const cardDollars = (Number(cardCents) / 100).toFixed(2);
  const cashNote = cashCents > 0 ? ` The $${(cashCents / 100).toFixed(2)} you paid in cash is returned by the organizer.` : '';

  const shouldNotify = firstFailure || (refunded && !wasAlreadyRefunded);
  if (shouldNotify) {
    try {
      const io = getIO();
      const payload = { type: 'POS_PAYMENT_STATUS', requestId, status: refunded ? 'REFUNDED' : 'FULFILLMENT_FAILED', totalAmountCents: posRequest.totalAmountCents };
      io.to(`user:${posRequest.organizerUserId}`).emit('POS_PAYMENT_STATUS', payload);
      io.to(`user:${posRequest.shopperUserId}`).emit('POS_PAYMENT_STATUS', payload);
    } catch (err: any) {
      console.warn('[pos-payment] Failed to emit socket event:', err.message);
    }
    try {
      await createNotification({
        userId: posRequest.organizerUserId,
        type: 'pos_payment_fulfillment_failed',
        title: 'Payment refunded: item unavailable',
        body: refunded
          ? `An item was no longer available when ${posRequest.shopper?.name || 'the shopper'} paid, so the $${cardDollars} card payment was refunded automatically.${cashNote}`
          : `An item was no longer available when ${posRequest.shopper?.name || 'the shopper'} paid. The $${cardDollars} card payment is being refunded; check the register if it does not complete shortly.${cashNote}`,
        link: `/organizer/pos`,
        channel: 'OPERATIONAL',
      });
    } catch (err: any) {
      console.warn('[pos-payment] Failed to notify organizer of fulfillment failure:', err.message);
    }
    try {
      await createNotification({
        userId: posRequest.shopperUserId,
        type: 'pos_payment_fulfillment_failed_shopper',
        title: refunded ? 'Your payment was refunded' : 'Your payment is being refunded',
        body: refunded
          ? `An item in your purchase was no longer available, so your $${cardDollars} card payment has been refunded. It can take a few days to show on your statement.${cashNote}`
          : `An item in your purchase was no longer available. Your $${cardDollars} card payment is being refunded and will show on your statement shortly.${cashNote}`,
        link: `/shopper/history?view=receipts`,
        channel: 'OPERATIONAL',
        sendEmail: true,
        emailSubject: refunded ? 'Your FindA.Sale payment was refunded' : 'Your FindA.Sale payment is being refunded',
      });
    } catch (err: any) {
      console.warn('[pos-payment] Failed to notify shopper of fulfillment failure:', err.message);
    }
  }

  return res.status(409).json({
    success: false,
    code: 'ITEM_UNAVAILABLE',
    refunded,
    refundPending: !refunded,
    message: refunded
      ? `An item in your purchase was no longer available, so your card payment was refunded.${cashNote}`
      : `An item in your purchase was no longer available. Your card payment is being refunded, so do not pay again.${cashNote}`,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the organizer record for the authenticated user.
 * Requires ORGANIZER role and valid Stripe Connect account.
 */
// ─── Endpoints ────────────────────────────────────────────────────────────────

/**
 * POST /api/pos/payment-request
 * Organizer sends a payment request to a shopper
 *
 * Body: {
 *   shopperUserId: string;
 *   saleId: string;
 *   itemIds: string[];
 *   totalAmountCents: number;
 *   expiresInSeconds?: number;
 * }
 */
export const createPaymentRequest = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const organizer = await resolveOrganizerOrTeamMember(req, res);
    if (!organizer) return;
    // posAuth's ResolvedPosActor now carries the resolved organizer's OWN userId as
    // `ownerUserId` (added 2026-08-16 with the HoldInvoice P0-A fix -- three
    // HoldInvoice.create sites had independently papered over its absence by writing an
    // Organizer.id into a User-FK column). It is distinct from organizer.actingUserId, who
    // is whoever is actually standing at the register under the TEAM_MEMBER branch. Used
    // below for POSPaymentRequest.organizerUserId / Stripe metadata / socket payload.
    // This replaces a second round-trip that re-read Organizer.userId by id -- same value,
    // one query fewer, and one fewer place for the two id spaces to drift apart again.
    const organizerUserId = organizer.ownerUserId;

    const {
      shopperUserId,
      saleId,
      itemIds,
      totalAmountCents,
      expiresInSeconds = 900, // 15 minutes default
      isSplitPayment = false,
      cashAmountCents,
      cardAmountCents,
      discountType,
      discountValue,
      discountReasonNote,
      // Stripe removal (2026-09-12): Stripe's platform account is permanently closed,
      // and this endpoint always creates a BRAND-NEW POSPaymentRequest row -- there is no
      // "existing in-flight row" for a client-supplied 'STRIPE' value to legitimately
      // service here (unlike a resume/confirm endpoint reading an already-created row).
      // Processor is now always SQUARE; a client-supplied value is ignored rather than
      // trusted, closing the hole where any raw API caller (stale build, curl, an
      // attacker) could force this endpoint down the guaranteed-to-fail Stripe branch.
      processor: _requestedProcessor,
      isTestTransaction,
    } = req.body as {
      shopperUserId?: string;
      saleId?: string;
      itemIds?: string[];
      totalAmountCents?: number;
      expiresInSeconds?: number;
      isSplitPayment?: boolean;
      cashAmountCents?: number;
      cardAmountCents?: number;
      // POS Cashier Discount Permission (2026-08-28) -- see posDiscountService.ts
      discountType?: string;
      discountValue?: number;
      discountReasonNote?: string;
      // Stripe removal (2026-09-12): accepted for backward-compatible request shapes but
      // ignored -- see the const above, processor is always SQUARE now.
      processor?: 'STRIPE' | 'SQUARE';
      isTestTransaction?: boolean;
    };
    const processor: 'SQUARE' = 'SQUARE';
    void _requestedProcessor;

    // QA Test-Transaction Harness (2026-09-17): createPaymentRequest was the one
    // function in this file's QA-bypass trio (alongside confirmPaymentRequest and
    // manualCardPayment) that never got this exception -- which made
    // confirmPaymentRequest itself untestable, since it requires a pre-existing
    // POSPaymentRequest row in ACCEPTED status, and this function is the ONLY place
    // that row can ever be created. Same X-QA-Bypass / QA_RATE_LIMIT_BYPASS_SECRET
    // mechanism as those two (isQABypassRequest, defined near the top of this file --
    // not re-declared here). Computed here, AFTER resolveOrganizerOrTeamMember(req, res)
    // above has already run -- organizer auth has already happened by this point, same
    // authorization ordering manualCardPayment's own isTestBypassActive uses. processor
    // is unconditionally forced to 'SQUARE' above (Stripe removal, 2026-09-12), so
    // unlike confirmPaymentRequest's version there is no separate processor check needed
    // here -- there is nothing left that isn't SQUARE.
    const isTestBypassActive = isTestTransaction === true && isQABypassRequest(req);

    // Validation
    if (!shopperUserId || typeof shopperUserId !== 'string') {
      return res.status(400).json({ message: 'shopperUserId is required' });
    }
    if (!saleId || typeof saleId !== 'string') {
      return res.status(400).json({ message: 'saleId is required' });
    }
    if (!itemIds || !Array.isArray(itemIds)) {
      return res.status(400).json({ message: 'itemIds must be an array' });
    }
    // Whole cents only, with a sane upper bound (2026-09-29): a fractional or absurd amount used to
    // sail through this `> 0` check and surface later as a 500 from Square or the database.
    if (!isValidCents(totalAmountCents)) {
      return res.status(400).json({
        message: `totalAmountCents must be a whole number of cents greater than 0 and at most ${MAX_POS_AMOUNT_CENTS}`,
        code: 'INVALID_AMOUNT',
      });
    }

    // Validate split payment amounts if split is enabled
    let splitCashAmountCents = cashAmountCents;
    let splitCardAmountCents = cardAmountCents;

    if (isSplitPayment) {
      if (splitCashAmountCents == null || splitCardAmountCents == null) {
        return res.status(400).json({
          message: 'When isSplitPayment is true, both cashAmountCents and cardAmountCents are required',
          code: 'INVALID_SPLIT_AMOUNT',
        });
      }

      // Cash that covers the whole sale is a cash sale, not a split (2026-09-29): say so plainly
      // instead of the generic "card amount must be greater than 0".
      if (isValidCents(splitCashAmountCents) && splitCashAmountCents >= totalAmountCents) {
        return res.status(400).json({
          message: 'The cash received covers the whole sale, so this is a cash sale, not a split. Record it as a cash sale.',
          code: 'CASH_COVERS_TOTAL',
        });
      }

      // cash + card must equal the total EXACTLY, every field a whole number of cents (2026-09-29:
      // the old +-1 cent tolerance is gone -- the register computes card = total - cash in integer
      // cents, so there is no rounding source left for it to absorb). See validateSplitTender.
      const splitCheck = validateSplitTender({
        totalCents: totalAmountCents,
        cashCents: splitCashAmountCents,
        cardCents: splitCardAmountCents,
      });
      if (!splitCheck.ok) {
        return res.status(splitCheck.status).json({ message: splitCheck.message, code: splitCheck.code });
      }
    } else {
      // Non-split: card amount is total
      splitCardAmountCents = totalAmountCents;
    }

    // Cash-fee exposure cap (2026-09-24, Patrick ruling: inclusive-fee restructuring --
    // "whatever's recommended and won't leave gaps"). A cash leg never touches Square, so its
    // commission only ever collects via cashFeeService's opportunistic recoupment against a
    // LATER card sale (applyCashDebtToAppFee/settleCashDebtCollection, confirmPaymentRequest
    // below) -- an organizer who never makes another card sale leaves that debt uncollectible
    // forever. This bounds the tail risk BEFORE the cash leg is even accepted: reject a split
    // cash amount that would push Organizer.cashFeeBalance past CASH_FEE_EXPOSURE_CAP_CENTS
    // ($100), rather than silently letting an unbounded balance accrue.
    if (isSplitPayment && splitCashAmountCents && splitCashAmountCents > 0) {
      const cashFeeRate = await resolveCashCommissionRate(organizer);
      const estimatedCashCommission = cashCommissionOn(splitCashAmountCents / 100, cashFeeRate);
      if (await wouldExceedCashFeeExposureCap({ organizerId: organizer.id, commission: estimatedCashCommission })) {
        return res.status(400).json({
          message: CASH_FEE_CAP_MESSAGE,
          code: 'CASH_FEE_EXPOSURE_CAP_EXCEEDED',
        });
      }
    }

    // Verify sale exists, is PUBLISHED, and belongs to organizer
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true, status: true, organizerId: true, title: true, address: true, city: true, state: true, sourceName: true, organizer: { select: { isUnmanagedListing: true } } },
    });


    // Guard: reject POS on unmanaged listings
    if (sale?.sourceName != null && sale?.organizer?.isUnmanagedListing) {
      return res.status(403).json({
        message: 'This listing is not yet claimed by an organizer. Try one of our verified organizer sales.',
        code: 'UNMANAGED_LISTING'
      });
    }
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    if (sale.status !== 'PUBLISHED') {
      return res.status(400).json({ message: 'Sale is not published' });
    }
    if (sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'You do not own this sale' });
    }

    // Verify items only when itemIds are provided (POS carts may contain custom-amount items with no DB id)
    let items: Array<{ id: string; title: string; status: string; price: number | null }> = [];
    if (itemIds.length > 0) {
      items = await prisma.item.findMany({
        where: {
          id: { in: itemIds },
          saleId,
        },
        select: { id: true, title: true, status: true, price: true },
      });

      if (items.length !== itemIds.length) {
        return res.status(400).json({ message: 'One or more items not found or not in this sale' });
      }

      // POS cashier has physical possession — exclude already-SOLD items silently
      // rather than rejecting the entire request (common in test/reuse scenarios)
      items = items.filter((item) => ['AVAILABLE', 'RESERVED'].includes(item.status));
    }

    // POS Cashier Discount Permission (2026-08-28): resolve + validate any requested
    // discount against the actor's permission and the workspace's cap BEFORE creating
    // any Stripe resources. No-op (discountAmountCents: 0) when no discount was sent --
    // zero behavior change to the pre-existing flow in that case.
    const catalogSubtotalCents = Math.round(items.reduce((sum, i) => sum + (i.price ?? 0), 0) * 100);
    const discountResolution = await resolvePosDiscount({
      actor: organizer,
      input: { discountType, discountValue, discountReasonNote },
      catalogSubtotalCents,
    });
    if (!discountResolution.ok) {
      return res.status(discountResolution.status).json({ message: discountResolution.message });
    }
    // ADR-112 (2026-08-28): this floor check now runs UNCONDITIONALLY, not just when a
    // discount is present. Lower-bound check: catalog items can only be discounted
    // through this authorized, capped path -- misc/custom-amount items (no catalog
    // price) can still add to the total freely (unchanged, separate trust boundary --
    // see ADR-112), but the total can never come in BELOW what the real catalog
    // subtotal minus any authorized discount explains. With no discount requested,
    // discountAmountCents is 0 and this simply enforces totalAmountCents >=
    // catalogSubtotalCents - 1, closing the gap where a lowballed total with no
    // discount fields sent was previously trusted completely. 1-cent tolerance for
    // rounding.
    const minAllowedTotalCents = catalogSubtotalCents - discountResolution.discountAmountCents - 1;
    if (totalAmountCents < minAllowedTotalCents) {
      return res.status(400).json({
        message: discountResolution.discountAmountCents > 0
          ? `Total does not match the applied discount. Expected at least ${minAllowedTotalCents} cents.`
          : `Total does not match catalog pricing. Expected at least ${minAllowedTotalCents} cents.`,
      });
    }

    // Verify shopper exists
    const shopper = await prisma.user.findUnique({
      where: { id: shopperUserId },
      select: { id: true, name: true, email: true },
    });

    if (!shopper) return res.status(404).json({ message: 'Shopper not found' });

    // S1072 Finding #4 gap fix (fix-and-reverify, findasale-hacker): this POS
    // payment-request flow always has a real, identified buyer (shopperUserId,
    // validated required above) charged via a Stripe PaymentIntent -- unlike
    // terminalController.ts's cash/card-present walk-in flows (Purchase.userId is
    // null there, no verifiable buyer account, correctly log-only via
    // recordSuspectedSignal), this path is structurally identical to the online
    // checkout paths (placeBid/placeHold/createCartCheckoutSession) and gets the
    // same hard block. Fired before any Stripe PaymentIntent is created so a
    // colluding organizer+buyer pair is rejected before value moves, not after.
    try {
      await assertCheckoutAllowed({
        buyerUserId: shopperUserId,
        saleId,
        prisma,
        context: 'posCreatePaymentRequest',
      });
    } catch (guardError) {
      if (guardError instanceof CheckoutGuardError) {
        return res.status(403).json({ message: guardError.message });
      }
      throw guardError;
    }

    // Platform fee on the CARD portion only, resolved through the organizer's own tier rate --
    // NOT a hardcoded 10% (P2 fix, 2026-08-22). Mirrors terminalController.createTerminalPaymentIntent's
    // card-fee resolution exactly (baseFeeRate + referral-discount override), which itself got the
    // fee-precedence fix (tier rate always wins over a wildcard FeeStructure row) the same day. The
    // CASH portion of a split tender is never touched by Stripe, so it cannot be folded into this
    // application_fee_amount -- its commission is accrued separately via cashFeeService.ts at
    // confirmPaymentRequest (below), once the payment has actually succeeded.
    const hasReferralDiscount =
      organizer.referralDiscountExpiry != null && organizer.referralDiscountExpiry > new Date();
    const cardFeeRate = hasReferralDiscount ? 0 : getInclusivePlatformFeeRate(organizer.subscriptionTier as any, 'IN_PERSON');
    const platformFeeCents = hasReferralDiscount
      ? 0
      : calculateInclusiveCommissionCents(splitCardAmountCents!, organizer.subscriptionTier as any, 'IN_PERSON');
    // Card-leg floor (2026-09-29): a card charge below Square's minimum, or one the platform's
    // per-transaction minimum fee would swallow, can never succeed -- reject it here with a message
    // the cashier can act on, before any request row exists or the shopper is prompted.
    const legProblem = cardLegProblem({
      cardCents: splitCardAmountCents!,
      appFeeCents: platformFeeCents,
      isSplit: isSplitPayment,
    });
    if (legProblem) {
      return res.status(400).json({ message: legProblem, code: 'CARD_AMOUNT_TOO_SMALL' });
    }
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    // P2 idempotency fix (fix-and-reverify batch, same bug class fixed at P1 elsewhere this
    // batch): the previous "60-second duplicate block" was a plain check-then-act read
    // (SELECT recent PENDING, then a Stripe round-trip, then INSERT) with a wide race
    // window -- two near-simultaneous submits (double-tap, or a client retry after a
    // slow/lost response) could both pass the check and each create their own Stripe
    // PaymentIntent + POSPaymentRequest, sending the shopper two live charge prompts for
    // the same cart. Closed by creating the placeholder POSPaymentRequest row FIRST,
    // inside a SERIALIZABLE transaction that re-does the dedup read and the insert
    // atomically -- Postgres aborts one side of any genuinely concurrent pair with a
    // serialization failure (Prisma error code P2034), handled below the same as the old
    // 429. The Stripe PaymentIntent is then created against the already-claimed row (with
    // requestId in its metadata from the start -- no follow-up metadata.update needed) and
    // an idempotencyKey tied to that row.
    //
    // NOTE (client-token limitation, per dispatch instructions): a real client-supplied
    // idempotency token would be a stronger fix (it would also survive a full page
    // reload/retry, not just concurrent in-flight requests). The organizer POS page
    // (packages/frontend/pages/organizer/pos.tsx, "Send to Phone" handler, ~L2152-2166)
    // currently calls `api.post('/pos/payment-request', payload)` with no generated
    // token, and POSPaymentRequest has no column to store one -- adding both a schema
    // field and the frontend token-generation/threading is a larger change than this
    // batch's scope. Flagged here rather than silently skipped: this server-side fix
    // closes the concurrent-request race (the documented failure mode for this bug
    // class) but not a slow human double-tap that happens to straddle a page reload.
    let posRequest;
    try {
      posRequest = await prisma.$transaction(
        async (tx) => {
          const recentRequest = await tx.pOSPaymentRequest.findFirst({
            where: {
              shopperUserId,
              organizerId: organizer.id,
              saleId,
              status: 'PENDING',
              createdAt: { gte: new Date(Date.now() - 60 * 1000) },
            },
          });
          if (recentRequest) return null; // duplicate -- handled below

          // Authoritative cash-fee exposure cap re-check (2026-09-29). The early pre-check above
          // is a cheap fast-fail, but it reads outside any lock, so two split requests created back
          // to back could each see the same balance and both pass. Re-run it HERE, inside the
          // SERIALIZABLE transaction and against the same rows the insert below touches, so
          // Postgres aborts one side of any genuinely concurrent pair (P2034, handled below). It
          // also counts pending, not-yet-accrued split cash (see getPendingSplitCashCommission),
          // not just the accrued balance.
          if (isSplitPayment && splitCashAmountCents && splitCashAmountCents > 0) {
            const txCashRate = await resolveCashCommissionRate(organizer);
            const txCashCommission = cashCommissionOn(splitCashAmountCents / 100, txCashRate);
            if (await wouldExceedCashFeeExposureCap({ organizerId: organizer.id, commission: txCashCommission, tx })) {
              throw new CashFeeCapExceededError();
            }
          }

          return tx.pOSPaymentRequest.create({
            data: {
              organizerId: organizer.id,
              organizerUserId: organizerUserId,
              processor,
              shopperUserId,
              saleId,
              itemIds: items.map((i) => i.id), // use only available items (SOLD filtered out above)
              totalAmountCents,
              platformFeeCents,
              expiresAt,
              isSplitPayment,
              cashAmountCents: isSplitPayment ? splitCashAmountCents : null,
              cardAmountCents: isSplitPayment ? splitCardAmountCents : null,
              // POS Cashier Discount Permission (2026-08-28): null when no discount was
              // applied (discountResolution.discountAmountCents === 0).
              discountType: discountResolution.discountAmountCents > 0 ? discountResolution.discountType : null,
              discountValueRaw: discountResolution.discountAmountCents > 0 ? discountResolution.discountValueRaw : null,
              discountAmountCents: discountResolution.discountAmountCents > 0 ? discountResolution.discountAmountCents : null,
              discountReasonNote: discountResolution.discountAmountCents > 0 ? discountResolution.discountReasonNote : null,
              discountAppliedByUserId: discountResolution.discountAmountCents > 0 ? organizer.actingUserId : null,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (err: any) {
      if (err instanceof CashFeeCapExceededError) {
        return res.status(400).json({ message: CASH_FEE_CAP_MESSAGE, code: 'CASH_FEE_EXPOSURE_CAP_EXCEEDED' });
      }
      if (err?.code === 'P2034') {
        // Serializable transaction conflict: Postgres aborted one side of a race. This is NOT proof of a
        // duplicate (the other transaction may have been for a different shopper or even rolled back), so
        // tell the client it is safe to retry instead of claiming a request was already sent. The genuine
        // duplicate-within-60s case is the 429 below, decided by the guard inside the transaction.
        res.set('Retry-After', '1');
        return res.status(409).json({
          message: 'Another payment request was being created at the same time. Please try again.',
          code: 'SERIALIZATION_RETRY',
          retryAfterSeconds: 1,
        });
      }
      console.error('[pos-payment] Failed to create POSPaymentRequest placeholder:', err);
      return res.status(500).json({ message: 'Failed to create payment request' });
    }

    if (!posRequest) {
      return res.status(429).json({
        message: 'A payment request was already sent to this shopper in the last 60 seconds',
      });
    }

    // S1198 (2026-09-06): bank-fingerprint collusion hold. Checked FIRST -- before the
    // live getAccountStatus preflight below -- consistent with the other 3 fixes of this
    // shape (terminalController.ts, vendorBoothCartController.ts TERMINAL+QR), all of
    // which check this cheap DB flag before spending a live Stripe API round-trip.
    // REORDERED 2026-09-07: originally placed after the preflight in this file only: an
    // inconsistency caught during live QA of this exact fix (a real connected account
    // happened to be independently Stripe-rejected for an unrelated reason, and the
    // fraud-hold check never got a chance to fire since the preflight failed first) --
    // no functional difference when the account IS chargeable, but firing this first is
    // both cheaper (skips a live Stripe call for an already-known-flagged account) and
    // consistent with every sibling fix. Releases the placeholder the same way every
    // other pre-charge failure path in this function already does.
    if (await isPayoutFlaggedForReview('ORGANIZER', organizer.id)) {
      await prisma.pOSPaymentRequest
        .update({ where: { id: posRequest.id }, data: { status: 'CANCELLED', declineReason: 'PAYMENT_FAILED' } })
        .catch((releaseErr) => console.error('[pos-payment] Failed to release placeholder after fraud-hold check:', releaseErr));
      return res.status(403).json({ message: 'Your payments are on hold pending admin review. Contact support@finda.sale for details.' });
    }

    // Square migration Wave 1 #3 (2026-09-07): account-status preflight.
    // Stripe removal (2026-09-12): this endpoint's split-payment card leg used to branch
    // on a client-supplied `processor` and could still attempt a live Stripe PaymentIntent
    // for a non-Square organizer. Stripe's platform account is permanently closed and
    // `processor` is now always forced to 'SQUARE' above, so that branch is dead code and
    // has been removed outright (not converted to a 409 throw) -- there is nothing left
    // that can ever select it. SQUARE has no "create now, confirm later" object -- charge
    // creation is deferred entirely to confirmPaymentRequest, once the shopper's device has
    // tokenized a card via the Web Payments SDK (see squarePosPaymentAdapter.ts file header
    // for the full researched rationale, including the confirmed 7-day delayed-capture hold
    // window).
    if (!isTestBypassActive) {
      const preflight = await squarePos.preflightAccountStatus({
        id: organizer.id,
        squareOnboarded: organizer.squareOnboarded,
        squareMerchantId: organizer.squareMerchantId,
        squareLocationId: organizer.squareLocationId,
      });
      if (!preflight.ok) {
        await prisma.pOSPaymentRequest
          .update({ where: { id: posRequest.id }, data: { status: 'CANCELLED', declineReason: 'PAYMENT_FAILED' } })
          .catch((releaseErr) => console.error('[pos-payment] Failed to release placeholder after Square preflight failure:', releaseErr));
        return res.status(preflight.status).json({ message: preflight.message });
      }
    }

    // Emit socket event to shopper
    try {
      const io = getIO();
      const itemNames = items.map((item) => item.title);
      io.to(`user:${shopperUserId}`).emit('POS_PAYMENT_REQUEST', {
        type: 'POS_PAYMENT_REQUEST',
        requestId: posRequest.id,
        organizerName: `${organizerUserId}`, // Will use sale.organizer.businessName in prod
        saleName: sale.title,
        saleLocation: [sale.address, sale.city, sale.state].filter(Boolean).join(', ') || undefined,
        itemNames,
        totalAmountCents,
        displayAmount: `$${(totalAmountCents / 100).toFixed(2)}`,
        expiresAt: expiresAt.toISOString(),
        expiresIn: expiresInSeconds,
        processor,
        // Stripe removal (2026-09-12): processor is always SQUARE now; no PaymentIntent
        // secret is ever created here (deferred to confirmPaymentRequest's Square flow).
        stripePaymentIntentSecret: undefined,
        squareLocationId: organizer.squareLocationId ?? undefined,
        deepLink: `/shopper/pay-request/${posRequest.id}`,
        isSplitPayment,
        cashAmountCents: isSplitPayment ? splitCashAmountCents : undefined,
        cardAmountCents: isSplitPayment ? splitCardAmountCents : undefined,
        cashDisplayAmount: isSplitPayment ? `$${(splitCashAmountCents! / 100).toFixed(2)}` : undefined,
        cardDisplayAmount: isSplitPayment ? `$${(splitCardAmountCents! / 100).toFixed(2)}` : undefined,
      });
    } catch (err: any) {
      console.warn('[pos-payment] Failed to emit socket event:', err.message);
      // Don't fail the request — socket is optional fallback
    }

    // Create in-app notification for shopper
    try {
      await createNotification({
        userId: shopperUserId,
        type: 'pos_payment_request',
        title: 'Payment Request Received',
        body: `Payment request for $${(totalAmountCents / 100).toFixed(2)} from ${sale.title}`,
        link: `/shopper/pay-request/${posRequest.id}`,
        channel: 'OPERATIONAL',
      });
    } catch (err: any) {
      console.warn('[pos-payment] Failed to create notification:', err.message);
    }

    return res.status(201).json({
      requestId: posRequest.id,
      status: 'PENDING',
      shopperName: shopper.name,
      totalAmountCents,
      isSplitPayment,
      cashAmountCents: isSplitPayment ? splitCashAmountCents : undefined,
      cardAmountCents: isSplitPayment ? splitCardAmountCents : undefined,
      cashDisplayAmount: isSplitPayment ? `$${(splitCashAmountCents! / 100).toFixed(2)}` : undefined,
      cardDisplayAmount: isSplitPayment ? `$${(splitCardAmountCents! / 100).toFixed(2)}` : undefined,
      displayAmount: `$${(totalAmountCents / 100).toFixed(2)}`,
      expiresAt: expiresAt.toISOString(),
      processor,
      // Stripe removal (2026-09-12): processor is always SQUARE now; neither field is
      // ever populated at creation time (Square charge creation is deferred to confirm).
      stripePaymentIntentId: undefined,
      stripePaymentIntentSecret: undefined,
      // Square migration Wave 1 #3 (2026-09-07): frontend needs this to init the Web
      // Payments SDK (payments(applicationId, locationId)) -- applicationId itself is a
      // static NEXT_PUBLIC_ env var, not organizer-specific, so it is not sent here.
      squareLocationId: processor === 'SQUARE' ? organizer.squareLocationId ?? undefined : undefined,
    });
  } catch (err: any) {
    console.error('[pos-payment] createPaymentRequest error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * GET /api/pos/payment-request/:requestId
 * Shopper or organizer retrieves payment request details
 */
export const getPaymentRequest = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const { requestId } = req.params;
    if (!requestId) return res.status(400).json({ message: 'requestId is required' });

    const request = await prisma.pOSPaymentRequest.findUnique({
      where: { id: requestId },
      include: {
        organizer: {
          select: { id: true, name: true },
        },
        shopper: {
          select: { id: true, name: true },
        },
        sale: {
          select: { id: true, title: true, address: true, city: true, state: true },
        },
      },
    });

    if (!request) return res.status(404).json({ message: 'Payment request not found' });

    // Verify user has access (is shopper or organizer)
    if (req.user.id !== request.shopperUserId && req.user.id !== request.organizerUserId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Fetch the Organizer record to get stripeConnectId (needed for frontend Stripe Elements)
    // Square migration Wave 1 #3 (2026-09-07): also fetch squareLocationId, needed by the
    // frontend to init the Web Payments SDK for SQUARE-processor rows.
    const organizerRecord = await prisma.organizer.findUnique({
      where: { id: request.organizerId },
      select: { stripeConnectId: true, squareLocationId: true },
    });

    // Fetch item names when itemIds are present
    let itemNames: string[] = [];
    if (request.itemIds && request.itemIds.length > 0) {
      const items = await prisma.item.findMany({
        where: { id: { in: request.itemIds } },
        select: { title: true },
      });
      itemNames = items.map((i) => i.title);
    }

    // Check expiration
    const isExpired = new Date() > request.expiresAt;

    return res.json({
      id: request.id,
      organizerName: request.organizer?.name || 'Unknown Organizer',
      saleName: request.sale?.title,
      saleLocation: request.sale ? [request.sale.address, request.sale.city, request.sale.state].filter(Boolean).join(', ') : undefined,
      itemIds: request.itemIds,
      itemNames,
      totalAmountCents: request.totalAmountCents,
      displayAmount: `$${(request.totalAmountCents / 100).toFixed(2)}`,
      isSplitPayment: request.isSplitPayment,
      cashAmountCents: request.cashAmountCents ?? undefined,
      cardAmountCents: request.cardAmountCents ?? undefined,
      cardDisplayAmount: request.cardAmountCents ? `$${(request.cardAmountCents / 100).toFixed(2)}` : undefined,
      platformFeeCents: request.platformFeeCents,
      status: request.status,
      expiresAt: request.expiresAt.toISOString(),
      isExpired,
      stripePaymentIntentId: request.stripePaymentIntentId,
      clientSecret: request.clientSecret,
      organizerStripeAccountId: organizerRecord?.stripeConnectId || null,
      // Square migration Wave 1 #3 (2026-09-07)
      processor: request.processor,
      organizerSquareLocationId: organizerRecord?.squareLocationId || null,
      createdAt: request.createdAt.toISOString(),
      acceptedAt: request.acceptedAt?.toISOString() || null,
      paidAt: request.paidAt?.toISOString() || null,
    });
  } catch (err: any) {
    console.error('[pos-payment] getPaymentRequest error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * POST /api/pos/payment-request/:requestId/accept
 * Shopper accepts the payment request
 */
export const acceptPaymentRequest = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const { requestId } = req.params;
    if (!requestId) return res.status(400).json({ message: 'requestId is required' });

    const request = await prisma.pOSPaymentRequest.findUnique({
      where: { id: requestId },
      include: {
        sale: { select: { id: true } },
      },
    });

    if (!request) return res.status(404).json({ message: 'Payment request not found' });

    // Verify shopper owns this request
    if (request.shopperUserId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Verify status is PENDING
    if (request.status !== 'PENDING') {
      return res.status(400).json({
        message: `Cannot accept request with status ${request.status}`,
      });
    }

    // Verify not expired
    if (new Date() > request.expiresAt) {
      // Update to EXPIRED
      await prisma.pOSPaymentRequest.update({
        where: { id: requestId },
        data: { status: 'EXPIRED', declineReason: 'TIMEOUT' },
      });
      return res.status(400).json({ message: 'Payment request has expired' });
    }

    // Update status to ACCEPTED
    const updated = await prisma.pOSPaymentRequest.update({
      where: { id: requestId },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });

    // Emit socket event to both organizer and shopper
    try {
      const io = getIO();
      io.to(`user:${request.organizerUserId}`).emit('POS_PAYMENT_STATUS', {
        type: 'POS_PAYMENT_STATUS',
        requestId,
        status: 'ACCEPTED',
      });
      io.to(`user:${request.shopperUserId}`).emit('POS_PAYMENT_STATUS', {
        type: 'POS_PAYMENT_STATUS',
        requestId,
        status: 'ACCEPTED',
      });
    } catch (err: any) {
      console.warn('[pos-payment] Failed to emit accept socket event:', err.message);
    }

    return res.json({
      requestId,
      status: 'ACCEPTED',
      stripePaymentIntentId: updated.stripePaymentIntentId,
      stripePaymentIntentSecret: updated.clientSecret,
      clientSecret: updated.clientSecret,
      displayAmount: `$${(updated.totalAmountCents / 100).toFixed(2)}`,
    });
  } catch (err: any) {
    console.error('[pos-payment] acceptPaymentRequest error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * POST /api/pos/payment-request/:requestId/decline
 * Shopper declines the payment request
 */
export const declinePaymentRequest = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const { requestId } = req.params;
    if (!requestId) return res.status(400).json({ message: 'requestId is required' });

    const { reason } = req.body as { reason?: string };

    const request = await prisma.pOSPaymentRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) return res.status(404).json({ message: 'Payment request not found' });

    // Verify shopper owns this request
    if (request.shopperUserId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Verify status is PENDING or ACCEPTED
    if (!['PENDING', 'ACCEPTED'].includes(request.status)) {
      return res.status(400).json({
        message: `Cannot decline request with status ${request.status}`,
      });
    }

    const declineReason = reason || 'USER_CANCEL';

    // Update status to DECLINED
    const updated = await prisma.pOSPaymentRequest.update({
      where: { id: requestId },
      data: {
        status: 'DECLINED',
        declineReason,
      },
    });

    // Emit socket event to organizer
    try {
      const io = getIO();
      io.to(`user:${request.organizerUserId}`).emit('POS_PAYMENT_STATUS', {
        type: 'POS_PAYMENT_STATUS',
        requestId,
        status: 'DECLINED',
        reason: declineReason,
      });
    } catch (err: any) {
      console.warn('[pos-payment] Failed to emit decline socket event:', err.message);
    }

    // Create notification to organizer
    try {
      await createNotification({
        userId: request.organizerUserId,
        type: 'pos_payment_declined',
        title: 'Payment Request Declined',
        body: `Shopper declined your payment request for $${(request.totalAmountCents / 100).toFixed(2)}`,
        link: `/organizer/pos`,
        channel: 'OPERATIONAL',
      });
    } catch (err: any) {
      console.warn('[pos-payment] Failed to create decline notification:', err.message);
    }

    return res.json({
      requestId,
      status: 'DECLINED',
      reason: declineReason,
    });
  } catch (err: any) {
    console.error('[pos-payment] declinePaymentRequest error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * GET /api/pos/payment-request/pending
 * Shopper polls for any PENDING, non-expired payment requests directed at them.
 * Used as a socket fallback for mobile PWA where WebSocket may be suspended.
 */
export const getPendingPaymentRequests = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const requests = await prisma.pOSPaymentRequest.findMany({
      where: {
        shopperUserId: req.user.id,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      include: {
        sale: { select: { id: true, title: true, address: true, city: true, state: true } },
        organizer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const formatted = requests.map((r) => ({
      requestId: r.id,
      organizerName: r.organizer?.name || 'Organizer',
      saleName: r.sale?.title || 'Sale',
      saleLocation: r.sale
        ? [r.sale.address, r.sale.city, r.sale.state].filter(Boolean).join(', ')
        : undefined,
      itemNames: [] as string[], // itemIds stored, not names — keep lightweight for polling
      totalAmountCents: r.totalAmountCents,
      displayAmount: `$${(r.totalAmountCents / 100).toFixed(2)}`,
      expiresAt: r.expiresAt.toISOString(),
      deepLink: `/shopper/pay-request/${r.id}`,
      isSplitPayment: r.isSplitPayment,
      cashAmountCents: r.cashAmountCents ?? undefined,
      cardAmountCents: r.cardAmountCents ?? undefined,
      cashDisplayAmount: r.cashAmountCents ? `$${(r.cashAmountCents / 100).toFixed(2)}` : undefined,
      cardDisplayAmount: r.cardAmountCents ? `$${(r.cardAmountCents / 100).toFixed(2)}` : undefined,
    }));

    return res.json({ requests: formatted });
  } catch (err: any) {
    console.error('[pos-payment] getPendingPaymentRequests error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * GET /api/pos/payment-requests/active
 * Organizer sees their PENDING + ACCEPTED requests from the last 90 minutes.
 * Used by POS UI to display the pending payments panel.
 */
export const getOrganizerActiveRequests = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const organizer = await resolveOrganizerOrTeamMember(req, res);
    if (!organizer) return;

    // Fetch PENDING and ACCEPTED requests from the last 90 minutes
    const ninetyMinutesAgo = new Date(Date.now() - 90 * 60 * 1000);

    const requests = await prisma.pOSPaymentRequest.findMany({
      where: {
        organizerId: organizer.id,
        status: { in: ['PENDING', 'ACCEPTED'] },
        createdAt: { gte: ninetyMinutesAgo },
      },
      include: {
        shopper: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = requests.map((r) => ({
      id: r.id,
      shopperName: r.shopper?.name || 'Unknown Shopper',
      totalAmountCents: r.totalAmountCents,
      displayAmount: `$${(r.totalAmountCents / 100).toFixed(2)}`,
      status: r.status,
      expiresAt: r.expiresAt.toISOString(),
      isExpired: new Date() > r.expiresAt,
      isSplitPayment: r.isSplitPayment,
      cashAmountCents: r.cashAmountCents,
      cardAmountCents: r.cardAmountCents,
      cardDisplayAmount: r.cardAmountCents ? `$${(r.cardAmountCents / 100).toFixed(2)}` : undefined,
    }));

    return res.json(formatted);
  } catch (err: any) {
    console.error('[pos-payment] getOrganizerActiveRequests error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * GET /api/pos/transactions/today-summary
 * Returns today's completed POS payment totals for the authenticated organizer.
 * "Today" = midnight UTC.
 */
export const getTodaySummary = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const organizer = await resolveOrganizerOrTeamMember(req, res);
    if (!organizer) return;

    // Calculate today's midnight UTC
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Query for PAID transactions since today's midnight
    const result = await prisma.pOSPaymentRequest.aggregate({
      where: {
        organizerId: organizer.id,
        status: 'PAID',
        paidAt: {
          gte: today,
        },
      },
      _sum: {
        totalAmountCents: true,
      },
      _count: {
        id: true,
      },
    });

    return res.json({
      totalAmountCents: result._sum.totalAmountCents || 0,
      transactionCount: result._count.id || 0,
    });
  } catch (err: any) {
    console.error('[pos-payment] getTodaySummary error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * POST /api/pos/payment-request/:id/cancel
 * Organizer cancels a pending or accepted payment request.
 * Body: { reason?: string }
 */
export const cancelPaymentRequest = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const organizer = await resolveOrganizerOrTeamMember(req, res);
    if (!organizer) return;

    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'id is required' });

    const { reason } = req.body as { reason?: string };

    // Find the payment request
    const request = await prisma.pOSPaymentRequest.findUnique({
      where: { id },
    });

    if (!request) return res.status(404).json({ message: 'Payment request not found' });

    // Verify organizer owns this request
    if (request.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Verify status is PENDING or ACCEPTED (cannot cancel PAID/DECLINED/EXPIRED/CANCELLED)
    if (!['PENDING', 'ACCEPTED'].includes(request.status)) {
      return res.status(400).json({
        message: `Cannot cancel request with status ${request.status}`,
      });
    }

    const cancelReason = reason || 'ORGANIZER_CANCEL';

    // Update status to CANCELLED
    const updated = await prisma.pOSPaymentRequest.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        declineReason: cancelReason,
      },
    });

    // Emit socket event to shopper
    try {
      const io = getIO();
      io.to(`user:${request.shopperUserId}`).emit('POS_PAYMENT_STATUS', {
        type: 'POS_PAYMENT_STATUS',
        requestId: id,
        status: 'CANCELLED',
        reason: cancelReason,
      });
    } catch (err: any) {
      console.warn('[pos-payment] Failed to emit cancel socket event:', err.message);
    }

    // Create notification to shopper
    try {
      await createNotification({
        userId: request.shopperUserId,
        type: 'pos_payment_cancelled',
        title: 'Payment Request Cancelled',
        body: `The payment request for $${(request.totalAmountCents / 100).toFixed(2)} was cancelled`,
        link: `/shopper/pay-request/${id}`,
        channel: 'OPERATIONAL',
      });
    } catch (err: any) {
      console.warn('[pos-payment] Failed to create cancel notification:', err.message);
    }

    return res.json({
      requestId: id,
      status: 'CANCELLED',
      reason: cancelReason,
    });
  } catch (err: any) {
    console.error('[pos-payment] cancelPaymentRequest error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * POST /api/pos/payment-request/:requestId/confirm
 * Shopper confirms payment was successful (called by client after confirmCardPayment succeeds).
 * Creates Purchase records and finalizes payment without waiting for webhook.
 *
 * Body: { paymentIntentId: string }
 */
export const confirmPaymentRequest = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const { requestId } = req.params;
    // Square migration Wave 1 #3 (2026-09-07): sourceId is the Web Payments SDK card
    // token, submitted instead of paymentIntentId when posRequest.processor === 'SQUARE'.
    // Which field is actually required depends on the row's OWN processor (checked below,
    // once posRequest is loaded) -- not guessable from the request body alone.
    // QA Test-Transaction Harness (2026-09-17): isTestTransaction only ever takes effect
    // for the shopper who already owns this specific POSPaymentRequest (the
    // `posRequest.shopperUserId !== req.user.id` ownership check below, which this
    // endpoint already requires unconditionally) AND only when the X-QA-Bypass header
    // matches QA_RATE_LIMIT_BYPASS_SECRET (isQABypassRequest, defined above -- same
    // secret + header squarePaymentController.ts's createSquareTestTransaction gates its
    // own bypass with; see that function's header comment for why no isolated
    // per-organizer Square sandbox exists in this codebase). A client cannot use
    // isTestTransaction to skip a real charge on a request it doesn't already own, and
    // cannot skip the real charge on a request it DOES own without the server-side
    // secret either -- see isTestBypassActive below for the exact authorization order.
    const { paymentIntentId, sourceId, isTestTransaction } = req.body as {
      paymentIntentId?: string;
      sourceId?: string;
      isTestTransaction?: boolean;
    };

    if (!requestId) return res.status(400).json({ message: 'requestId is required' });

    // Lookup POSPaymentRequest
    const posRequest = await prisma.pOSPaymentRequest.findUnique({
      where: { id: requestId },
      include: {
        shopper: { select: { id: true, email: true, name: true } },
        organizer: { select: { id: true, name: true } },
        sale: { select: { id: true, title: true } },
      },
    });

    if (!posRequest) return res.status(404).json({ message: 'Payment request not found' });

    // Verify shopper owns this request
    if (posRequest.shopperUserId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Idempotency: if already PAID, return 200 quietly
    if (posRequest.status === 'PAID') {
      return res.json({
        success: true,
        receiptUrl: '/shopper/history?view=receipts',
        message: 'Payment already completed',
      });
    }

    // Fulfillment-failed replay (2026-09-29, money review P1-10): the card was captured but an item was
    // gone, so the request was parked in FULFILLMENT_FAILED and the captured amount is being refunded.
    // A repeated confirm (the shopper taps Pay again) resumes that refund instead of dead-ending on a
    // 400; the Square idempotency key is derived from the request id, so it can never refund twice.
    if (posRequest.status === 'FULFILLMENT_FAILED' || posRequest.status === 'REFUNDED') {
      return respondToPosFulfillmentFailure(res, {
        posRequest,
        requestId,
        externalPaymentId: posRequest.squarePaymentId ?? null,
        unavailableItemId: null,
        detail: '',
        firstFailure: false,
      });
    }

    // Verify status is ACCEPTED
    if (posRequest.status !== 'ACCEPTED') {
      return res.status(400).json({
        message: `Payment request is no longer available (status: ${posRequest.status})`,
      });
    }

    // QA Test-Transaction Harness (2026-09-17): computed here, AFTER the
    // shopper-ownership + status checks above -- mirrors createSquareTestTransaction's
    // exact authorization order (resource-ownership check BEFORE the QA-header check
    // takes effect). Only ever applies to the SQUARE branch below -- the STRIPE branch
    // is dead code for new rows (processor is unconditionally forced to 'SQUARE' at
    // request-creation time now, see createPaymentRequest's "Stripe removal
    // (2026-09-12)" comment), so there is nothing left to test-bypass there.
    const isTestBypassActive =
      isTestTransaction === true && posRequest.processor === 'SQUARE' && isQABypassRequest(req);

    // Square migration Wave 1 #3 (2026-09-07): body-field requirement depends on this
    // specific row's processor, not a global assumption.
    if (posRequest.processor === 'SQUARE') {
      if (!isTestBypassActive && (!sourceId || typeof sourceId !== 'string')) {
        return res.status(400).json({ message: 'sourceId is required' });
      }
      // findasale-hacker fix (2026-09-17, sandbox-QA adversarial pass): the check above only
      // validated sourceId's type on the non-test path -- when isTestBypassActive is true,
      // sourceId is optional (createAndCaptureSandboxPayment defaults it), but a caller who
      // DOES supply one had no type check at all before it reached the Square SDK call
      // (`params.sourceId || DEFAULT_SANDBOX_TEST_SOURCE_ID` treats a truthy non-string, e.g.
      // an object/array, as "supplied" and passes it straight through). Not exploitable
      // (Square's client validates/rejects malformed payloads and every throw path here is
      // already caught and turned into a clean error response -- no SQL/shell/log injection
      // surface), but reject malformed input at the edge rather than relying on the SDK to
      // fail safely.
      if (isTestBypassActive && sourceId !== undefined && typeof sourceId !== 'string') {
        return res.status(400).json({ message: 'sourceId must be a string' });
      }
    } else {
      if (!paymentIntentId || typeof paymentIntentId !== 'string') {
        return res.status(400).json({ message: 'paymentIntentId is required' });
      }
    }

    // Fetch Organizer profile to get stripeConnectId (stripeConnectId lives on Organizer, not User)
    const organizerProfile = await prisma.organizer.findUnique({
      where: { userId: posRequest.organizerUserId },
      // id/subscriptionTier/referralDiscountExpiry added (2026-08-22) so the split-payment
      // cash-half commission accrual below can resolve the rate without a second round-trip.
      // squareOnboarded/squareMerchantId/squareLocationId added (2026-09-07, Square
      // migration Wave 1 #3) so the SQUARE branch below can preflight + charge without a
      // second round-trip either.
      select: {
        id: true,
        stripeConnectId: true,
        subscriptionTier: true,
        referralDiscountExpiry: true,
        squareOnboarded: true,
        squareMerchantId: true,
        squareLocationId: true,
      },
    });
    if (posRequest.processor === 'SQUARE') {
      // squareLocationId deliberately NOT checked here (2026-09-13 fix): a null
      // squareLocationId with squareOnboarded+squareMerchantId both true is a
      // self-healable gap (see squarePosPaymentAdapter.ts's preflightAccountStatus doc
      // comment), not "never connected" -- the live preflight call just below is what
      // decides that, including attempting the backfill. Gating on it here would
      // short-circuit before preflightAccountStatus ever runs, permanently defeating
      // the self-heal for this endpoint.
      if (!organizerProfile?.squareOnboarded || !organizerProfile.squareMerchantId) {
        return res.status(400).json({ message: 'Organizer Square account not configured' });
      }
    } else if (!organizerProfile?.stripeConnectId) {
      return res.status(400).json({ message: 'Organizer Stripe account not configured' });
    }
    // Belt-and-suspenders TS-narrowing guard (both branches above already return on falsy
    // organizerProfile fields, which implies organizerProfile is non-null -- this makes
    // that explicit for the compiler too, so every `organizerProfile.x` reference below is
    // safe without individual non-null assertions scattered through the function).
    if (!organizerProfile) {
      return res.status(400).json({ message: 'Organizer account not configured' });
    }

    // Square migration Wave 1 #3 (2026-09-07): retrieve/confirm + status check branch by
    // processor. STRIPE keeps the exact retrieve-and-verify logic this project already
    // relies on, unchanged. SQUARE creates (or, on a retry, re-fetches) the actual Square
    // Payment HERE -- this is the "accept-time" charge-creation moment the Wave 1 scoping
    // doc calls for, since Square requires a real card token that only exists once the
    // shopper's device has tokenized it via the Web Payments SDK.
    let externalPaymentId: string;

    if (posRequest.processor === 'SQUARE') {
      if (isTestBypassActive) {
        // Real Square Sandbox ADR (2026-09-17, supersedes the old no-op bypass): routes to
        // FindA.Sale's platform-level Square SANDBOX credential set
        // (getSquareSandboxClient/getSquareSandboxLocationId, utils/square.ts) via
        // createAndCaptureSandboxPayment (squarePosPaymentAdapter.ts) -- NEVER the
        // organizer's own live connected account. sourceId defaults to Square's
        // always-succeeds sandbox nonce ('cnon:card-nonce-ok') when the request body
        // doesn't supply one, so existing QA calls keep working unchanged; an explicit
        // override (e.g. 'cnon:card-nonce-declined') is honored below. A real decline is
        // NOT swallowed -- it falls through to the same DECLINE_MESSAGE-shaped response
        // the non-test branch returns, same as a real captured/held distinction.
        const sandboxResult = await squarePos.createAndCaptureSandboxPayment({
          sourceId,
          amountCents: posRequest.cardAmountCents ?? posRequest.totalAmountCents,
          posRequestId: posRequest.id,
          existingSquarePaymentId: posRequest.squarePaymentId,
        });

        if (!sandboxResult.ok) {
          return res.status(sandboxResult.status).json({ message: sandboxResult.message, error: sandboxResult.message });
        }

        // Persist regardless of captured state -- same retry-safety reasoning as the real
        // (non-test) branch below: a retried confirm must find this id via
        // existingSquarePaymentId rather than re-authorizing.
        await prisma.pOSPaymentRequest
          .update({ where: { id: requestId }, data: { squarePaymentId: sandboxResult.paymentId } })
          .catch((err) => console.error('[pos-payment] Failed to persist sandbox squarePaymentId:', err));

        if (!sandboxResult.captured) {
          try {
            Sentry.captureMessage(
              `[pos-payment] Square SANDBOX CompletePayment did not capture immediately -- requestId=${requestId} squarePaymentId=${sandboxResult.paymentId} (isTestTransaction). Authorization held; needs manual retry/reconciliation.`,
              'warning'
            );
          } catch {
            // Sentry may not be initialized -- silently continue
          }
          return res.status(202).json({
            success: false,
            processing: true,
            message: 'Your payment is still processing. Please wait a moment and check your receipts, or ask the organizer to try again.',
          });
        }

        externalPaymentId = sandboxResult.paymentId;
      } else {
        const preflight = await squarePos.preflightAccountStatus({
          id: organizerProfile.id,
          squareOnboarded: organizerProfile.squareOnboarded,
          squareMerchantId: organizerProfile.squareMerchantId,
          squareLocationId: organizerProfile.squareLocationId,
        });
        if (!preflight.ok) {
          return res.status(preflight.status).json({ message: preflight.message });
        }

        const result = await squarePos.createAndCapturePayment({
          organizer: {
            id: organizerProfile.id,
            squareOnboarded: organizerProfile.squareOnboarded,
            squareMerchantId: organizerProfile.squareMerchantId,
            // preflight.squareLocationId (not organizerProfile.squareLocationId): if this
            // organizer's location was just backfilled by preflightAccountStatus above,
            // organizerProfile's own field is still the stale pre-preflight value fetched
            // at the top of this request.
            squareLocationId: preflight.squareLocationId,
          },
          accessToken: preflight.accessToken,
          sourceId: sourceId!,
          amountCents: posRequest.cardAmountCents ?? posRequest.totalAmountCents,
          appFeeCents: posRequest.platformFeeCents,
          posRequestId: posRequest.id,
          existingSquarePaymentId: posRequest.squarePaymentId,
        });

        if (!result.ok) {
          return res.status(result.status).json({ message: result.message, error: result.message });
        }

        // Persist the Square paymentId regardless of captured state -- a held (captured:
        // false) authorization must not be lost if the shopper's client retries: the next
        // confirm attempt will find this id via existingSquarePaymentId above and complete
        // it rather than re-authorizing the card a second time.
        await prisma.pOSPaymentRequest
          .update({ where: { id: requestId }, data: { squarePaymentId: result.paymentId } })
          .catch((err) => console.error('[pos-payment] Failed to persist squarePaymentId:', err));

        if (!result.captured) {
          // KNOWN GAP (see squarePosPaymentAdapter.ts file header): no reconciliation job
          // built this session. The authorization is safely held (Square's own confirmed
          // 7-day default for card-not-present delayed capture) -- surfaced to Sentry for
          // manual follow-up rather than silently told to the shopper as success.
          try {
            Sentry.captureMessage(
              `[pos-payment] Square CompletePayment did not capture immediately -- requestId=${requestId} squarePaymentId=${result.paymentId}. Authorization held (Square default 7-day window); needs manual retry/reconciliation.`,
              'warning'
            );
          } catch {
            // Sentry may not be initialized -- silently continue
          }
          return res.status(202).json({
            success: false,
            processing: true,
            message: 'Your payment is still processing. Please wait a moment and check your receipts, or ask the organizer to try again.',
          });
        }

        externalPaymentId = result.paymentId;
      }

      // The PAID transition itself moved (2026-09-29) to the single guarded, transactional block
      // below (search "EXACTLY-ONCE PAID TRANSITION"): it used to be an unconditional update here
      // and a second copy in the Stripe branch, which let a replayed or concurrent confirm re-run
      // the whole fulfillment and double-accrue the cash-leg commission.
    } else {
      const result = await stripePos.retrieveAndVerifyPayment({
        paymentIntentId: paymentIntentId!,
        stripeConnectId: organizerProfile.stripeConnectId!,
        posRequestId: requestId,
      });

      if (!result.ok) {
        return res.status(result.status).json({ message: result.message, error: result.message });
      }

      externalPaymentId = result.externalPaymentId;

      // PAID transition: see the guarded block below (2026-09-29), shared by both processors.
    }

    // Square migration Wave 1 #3 (2026-09-07): per-item and misc Purchase rows below need
    // processor-shaped fields. For SQUARE, Wave 0's schema comment + the checkout
    // dispatch's own precedent (squarePaymentController.ts) store the RAW Square payment
    // id on EVERY item row -- uniqueness for a multi-item cart is enforced by the
    // (squarePaymentId, itemId) compound partial-unique index, NOT a per-item string
    // suffix the way the legacy stripePaymentIntentId column uses. chargeType/
    // stripeAccountId are deliberately left unset for SQUARE rows -- those are
    // Stripe-specific concepts refundService.ts's DIRECT/DESTINATION routing depends on,
    // and Square POS refunds are not yet built (Wave 1 #4) -- setting a value here would
    // mislead that future code, not help it.
    const buildProcessorPurchaseFields = (itemId: string | null): Record<string, any> =>
      posRequest.processor === 'SQUARE'
        ? { processor: 'SQUARE' as const, squarePaymentId: externalPaymentId }
        : {
            // PI ID is @unique — use per-item suffix to allow multiple items per PI
            stripePaymentIntentId: itemId ? `${externalPaymentId}_${itemId}` : externalPaymentId,
            chargeType: 'DIRECT' as const,
            stripeAccountId: organizerProfile.stripeConnectId,
          };

    // Cash-half commission accrual (P2 fix, 2026-08-22): the cash leg of a split tender is
    // never touched by Stripe -- nothing charged it any commission before this fix, at any
    // rate. Resolved through the SAME shared, tier-aware resolver cashFeeService.ts's other
    // callers use (terminalController's cash path, reservationController's RECORD mode),
    // NOT the removed hardcoded 0.10. Resolved now (at confirm/settlement time), matching
    // every other cash-commission call site -- not at request-creation time, and not from
    // the card-portion rate computed above (a referral discount or tier change between
    // request and confirm should apply the same way it would to any other cash sale).
    // QA Test-Transaction Harness (2026-09-17): the cash-half commission accrual below
    // mutates the organizer's real cashFeeBalance -- a fake test sale must never touch
    // it, same posture cashPaymentController.ts already takes for its own
    // isTestTransaction rows (see that file's own "deliberately NEVER accrued" comment).
    // ── EXACTLY-ONCE PAID TRANSITION + CASH-LEG ACCRUAL (2026-09-29) ─────────────────────────
    // Before this fix the request was set PAID unconditionally and the cash-leg commission was
    // then incremented in a separate, try/catch-swallowed step, so (a) two concurrent or replayed
    // confirms both ran the whole fulfillment below and both accrued, and (b) an accrual failure
    // was logged and forgotten, permanently losing the fee.
    //
    // Now one transaction does both: a compare-and-swap ACCEPTED -> PAID (only the caller whose
    // updateMany reports count === 1 proceeds; the loser returns the already-paid success), and,
    // for a split sale, the idempotent CashFeeAccrual ledger insert + cashFeeBalance increment
    // (accrueSplitCashLegOnce, unique per POSPaymentRequest.id). If the accrual throws, the whole
    // transaction rolls back, the request STAYS ACCEPTED, and Sentry is alerted -- so the failure
    // is loud, not silent, and a retried confirm is safe: the Square payment id is already
    // persisted, so createAndCapturePayment re-fetches that same payment instead of charging the
    // card again, then re-runs this block.
    //
    // A captured payment must never be dropped: if the request was expired or cancelled while the
    // charge was in flight, it is still recorded as PAID (with a Sentry warning), exactly as the
    // old unconditional update did.
    // FULFILLMENT IN THE SAME TRANSACTION (2026-09-29, money review P1-9 / P1-10 / P1-12). The PAID flip,
    // the split cash-leg accrual, the stock decrement and the Purchase rows now commit or roll back
    // TOGETHER:
    //   - P1-12: fulfillment runs only inside the transaction whose compare-and-swap won the
    //     ACCEPTED -> PAID flip, so a replayed or concurrent confirm (which reads PAID and returns early,
    //     or loses the swap) can never run it a second time: no double stock decrement.
    //   - P1-10: because the Purchase rows and the stock decrement are part of the flip, a crash or a DB
    //     error leaves the request ACCEPTED with nothing half-recorded, and the retried confirm (the
    //     Square payment id is persisted, so the card is not charged again) redoes the whole thing.
    //     The old order (flip PAID, then create rows, then decrement) could strand a PAID request with a
    //     captured card and missing rows that no replay would ever repair.
    //   - An item that is sold out or gone AFTER the card was captured aborts the whole transaction
    //     (PosFulfillmentUnavailableError), the request is moved to FULFILLMENT_FAILED and the captured
    //     card amount is refunded through squareRefundService.refundFailedPosFulfillment. That step is
    //     retryable: a replayed confirm resumes the refund (deterministic Square idempotency key), and
    //     reconcilePosFulfillmentFailures sweeps any that were left pending.
    //   - P1-9: each Purchase row records its share of what was ACTUALLY charged (discounts and misc
    //     lines allocated with allocateCentsProportionally, largest remainder), of the platform fee and
    //     of the cash leg, so per-row revenue, fee and refunds add back up to the sale.
    let lateCaptureFromStatus: string | null = null;
    let wonPaidTransition = false;
    // Post-commit work collected inside the transaction (only used once it has committed).
    const fullySoldOutItemIds: string[] = [];
    const partialSaleUpdates: Array<{ itemId: string; remainingStock: number }> = [];
    try {
      wonPaidTransition = await prisma.$transaction(
        async (tx) => {
          const paidAt = new Date();
          let flip = await tx.pOSPaymentRequest.updateMany({
            where: { id: requestId, status: 'ACCEPTED' },
            data: { status: 'PAID', paidAt },
          });
          if (flip.count !== 1) {
            const current = await tx.pOSPaymentRequest.findUnique({ where: { id: requestId }, select: { status: true } });
            if (!current || current.status === 'PAID') return false; // a concurrent confirm already won
            if (['EXPIRED', 'CANCELLED', 'DECLINED'].includes(current.status)) {
              flip = await tx.pOSPaymentRequest.updateMany({
                where: { id: requestId, status: current.status },
                data: { status: 'PAID', paidAt },
              });
              if (flip.count !== 1) return false;
              lateCaptureFromStatus = current.status;
            } else {
              throw new Error(`POSPaymentRequest ${requestId} is in unexpected status ${current.status} after the payment was captured`);
            }
          }
          // QA Test-Transaction Harness (2026-09-17): a fake test sale must never touch the
          // organizer's real cashFeeBalance (see cashPaymentController.ts's own posture).
          if (posRequest.isSplitPayment && posRequest.cashAmountCents && !isTestBypassActive) {
            await accrueSplitCashLegOnce({
              organizer: {
                id: organizerProfile.id,
                subscriptionTier: organizerProfile.subscriptionTier,
                referralDiscountExpiry: organizerProfile.referralDiscountExpiry,
              },
              sourceType: 'POS_PAYMENT_REQUEST',
              sourceId: requestId,
              cashAmountCents: posRequest.cashAmountCents,
              tx,
            });
          }

          // ── Fulfillment: allocate, decrement stock, record the rows ──────────────────────────
          const fulfillItems = await tx.item.findMany({
            where: { id: { in: posRequest.itemIds }, saleId: posRequest.saleId },
            select: { id: true, price: true },
          });
          const totalCents = posRequest.totalAmountCents;
          const itemCentsList = fulfillItems.map((it) => Math.round((it.price || 0) * 100));
          const itemsListTotalCents = itemCentsList.reduce((sum, c) => sum + c, 0);
          const miscRemainderCents = totalCents - itemsListTotalCents;
          // A misc row carries whatever the catalog items do not explain (custom-amount lines). Also
          // used when no item carries any price, so the whole charge is still recorded exactly once.
          const noPricedItems = fulfillItems.length === 0 || itemsListTotalCents <= 0;
          const needsMiscRow = noPricedItems || miscRemainderCents > 1;
          const rowWeights = [...itemCentsList];
          if (needsMiscRow) rowWeights.push(noPricedItems ? totalCents : miscRemainderCents);

          // What was ACTUALLY charged (cash + card, net of any discount) split across the rows. The old
          // code wrote the LIST price on every row and stamped the whole cart fee on EVERY row, so a
          // discounted or multi-item sale overstated revenue and fees per row and any later refund of one
          // row was computed against the wrong numbers.
          const rowAmountCents = allocateCentsProportionally(totalCents, rowWeights);
          const rowFeeCents = allocateCentsProportionally(posRequest.platformFeeCents, rowAmountCents);
          const confirmCashCents = posRequest.isSplitPayment && posRequest.cashAmountCents ? posRequest.cashAmountCents : 0;
          const rowCashCents =
            confirmCashCents > 0
              ? allocateCentsProportionally(confirmCashCents, rowAmountCents).map((c, i) => Math.min(c, rowAmountCents[i]))
              : rowWeights.map(() => 0);
          const discountTotalCents = Number(posRequest.discountAmountCents) > 0 ? Number(posRequest.discountAmountCents) : 0;
          const rowDiscountCents =
            discountTotalCents > 0
              ? allocateCentsProportionally(discountTotalCents, itemCentsList).map((c, i) => Math.min(c, itemCentsList[i]))
              : itemCentsList.map(() => 0);

          // Belt and suspenders for a state the old non-atomic order could leave behind (rows written but
          // the request never finalized): never write a second row for a payment/item already recorded,
          // and never decrement that item's stock twice.
          const recordedRows =
            (await tx.purchase.findMany({
              where:
                posRequest.processor === 'SQUARE'
                  ? { squarePaymentId: externalPaymentId }
                  : { stripePaymentIntentId: { startsWith: externalPaymentId } },
              select: { itemId: true },
            })) ?? [];
          const recordedItemIds = new Set(recordedRows.map((r: { itemId: string | null }) => r.itemId).filter(Boolean) as string[]);
          const miscAlreadyRecorded = recordedRows.some((r: { itemId: string | null }) => r.itemId === null);

          for (let idx = 0; idx < fulfillItems.length; idx++) {
            const item = fulfillItems[idx];
            if (recordedItemIds.has(item.id)) continue;

            // ADR-085 Track B Phase 1 Step 4: atomic, race-safe stock decrement replaces the old
            // unconditional status update. QA Test-Transaction Harness (2026-09-17): the irreversible
            // decrement / SOLD flip is skipped for a test transaction (2026-08-29 incident: a real QA pass
            // permanently marked a real production item SOLD with no clean undo). The Purchase row below is
            // still created for real (tagged isTestTransaction) so pricing/fee math is genuinely exercised.
            if (!isTestBypassActive) {
              try {
                const sold = await sellItemUnits(item.id, 1, tx);
                if (sold.fullySoldOut) fullySoldOutItemIds.push(item.id);
                else partialSaleUpdates.push({ itemId: item.id, remainingStock: sold.remainingStock });
              } catch (stockErr: any) {
                const gone = stockErr instanceof InsufficientStockError || /not found/i.test(String(stockErr?.message ?? ''));
                if (gone) {
                  console.error(`[pos-payment] Item ${item.id} unavailable after the card was captured:`, stockErr?.message);
                  throw new PosFulfillmentUnavailableError(item.id, String(stockErr?.message ?? 'unavailable'));
                }
                throw stockErr;
              }
            }

            const rowFeeDollars = rowFeeCents[idx] / 100;
            const discountForRow = rowDiscountCents[idx] ?? 0;
            await tx.purchase.create({
              data: {
                userId: posRequest.shopperUserId,
                itemId: item.id,
                saleId: posRequest.saleId,
                amount: rowAmountCents[idx] / 100,
                platformFeeAmount: rowFeeDollars,
                // FEE SNAPSHOT (2026-08-17): commission-only, and commissionRate is null by design: this
                // flow charges ONE cart-level fee, now allocated across the rows (see above), so there is no
                // honest per-row rate to record. Must match the idempotent webhook backstop in
                // stripeController.ts exactly.
                ...snapshotForCommissionOnly(rowFeeDollars, null),
                // Direct-charge / Square processor fields: see buildProcessorPurchaseFields above.
                ...buildProcessorPurchaseFields(item.id),
                source: 'POS',
                status: 'PAID',
                isTestTransaction: isTestBypassActive,
                // Split tender (2026-09-29): this row's share of the cash leg, so refunds cap the card
                // processor at what it actually collected. Left unset (column stays NULL) when not split.
                ...(rowCashCents[idx] > 0 ? { cashLegAmount: rowCashCents[idx] / 100 } : {}),
                // Cashier discount (2026-08-28): this row's share, so the audit columns reconcile.
                ...(discountForRow > 0
                  ? {
                      discountType: posRequest.discountType,
                      discountValueRaw: posRequest.discountValueRaw,
                      discountAmountCents: discountForRow,
                      discountReasonNote: posRequest.discountReasonNote,
                      discountAppliedByUserId: posRequest.discountAppliedByUserId,
                    }
                  : {}),
              },
            });

            // Update ItemReservation if exists
            await tx.itemReservation.updateMany({
              where: { itemId: item.id, userId: posRequest.shopperUserId },
              data: { status: 'COMPLETED' },
            });
          }

          // Misc-only carts: no DB item IDs, one Purchase for the full amount. Mixed carts: a misc Purchase
          // for any remainder beyond catalog item prices.
          if (needsMiscRow && !miscAlreadyRecorded) {
            const miscIdx = rowWeights.length - 1;
            const miscFeeDollars = rowFeeCents[miscIdx] / 100;
            await tx.purchase.create({
              data: {
                userId: posRequest.shopperUserId,
                itemId: null,
                saleId: posRequest.saleId,
                amount: rowAmountCents[miscIdx] / 100,
                platformFeeAmount: miscFeeDollars,
                // FEE SNAPSHOT (2026-08-17): see the item rows above for why the rate is null.
                ...snapshotForCommissionOnly(miscFeeDollars, null),
                // findasale-hacker fix (2026-08-09), STRIPE rows only: genuine Direct charge, see
                // buildProcessorPurchaseFields. SQUARE rows use the raw squarePaymentId (itemId is null here,
                // so no per-item suffix/uniqueness concern applies).
                ...(posRequest.processor === 'SQUARE'
                  ? { processor: 'SQUARE' as const, squarePaymentId: externalPaymentId }
                  : {
                      stripePaymentIntentId: fulfillItems.length === 0 ? externalPaymentId : `${externalPaymentId}_misc`,
                      chargeType: 'DIRECT' as const,
                      stripeAccountId: organizerProfile.stripeConnectId,
                    }),
                source: 'POS',
                status: 'PAID',
                isTestTransaction: isTestBypassActive,
                ...(rowCashCents[miscIdx] > 0 ? { cashLegAmount: rowCashCents[miscIdx] / 100 } : {}),
              },
            });
          }
          return true;
        },
        // Interactive transaction: a cart of many items does several statements per item.
        { timeout: 30000, maxWait: 10000 }
      );
    } catch (finalizeErr: any) {
      if (finalizeErr instanceof PosFulfillmentUnavailableError) {
        // Card captured, but an item is sold out or gone. The transaction rolled back (request still
        // ACCEPTED, nothing recorded, cash-leg accrual undone). Refund and tell everyone.
        return respondToPosFulfillmentFailure(res, {
          posRequest,
          requestId,
          externalPaymentId,
          unavailableItemId: finalizeErr.itemId,
          detail: finalizeErr.detail,
          firstFailure: true,
        });
      }
      console.error('[pos-payment] confirmPaymentRequest: payment captured but PAID transition / fulfillment failed:', finalizeErr);
      try {
        Sentry.captureException(finalizeErr instanceof Error ? finalizeErr : new Error(String(finalizeErr)), {
          tags: { area: 'pos-payment-request-confirm-finalize', processor: posRequest.processor },
          level: 'error',
          extra: {
            requestId,
            externalPaymentId,
            organizerUserId: posRequest.organizerUserId,
            shopperUserId: posRequest.shopperUserId,
            isSplitPayment: posRequest.isSplitPayment,
            cashAmountCents: posRequest.cashAmountCents,
            note: 'Card captured; request left ACCEPTED (transaction rolled back, nothing recorded). Retrying confirm is safe: squarePaymentId is persisted so the card is not charged again.',
          },
        });
      } catch {
        // Sentry may not be initialized -- silently continue
      }
      return res.status(500).json({
        message:
          'Your card was charged, but we could not finish recording the sale. Do not pay again. Wait a moment and tap Pay once more, or ask the organizer to check the register.',
        charged: true,
      });
    }
    if (!wonPaidTransition) {
      // Another confirm already finalized this request (and ran its fulfillment). Nothing more to do.
      return res.json({
        success: true,
        receiptUrl: '/shopper/history?view=receipts',
        message: 'Payment already completed',
      });
    }
    // (closure-assigned above, so TypeScript's flow analysis still sees the initial `null`)
    const lateCaptureStatus = lateCaptureFromStatus as string | null;
    if (lateCaptureStatus) {
      try {
        Sentry.captureMessage(
          `[pos-payment] Payment captured after request ${requestId} had already moved to ${lateCaptureStatus}; recorded as PAID anyway (externalPaymentId ${externalPaymentId}).`,
          'warning'
        );
      } catch {
        // Sentry may not be initialized -- silently continue
      }
    }

    // Cross-channel hooks, fired only now that the transaction has COMMITTED (they used to fire inside the
    // per-item loop, before anything was durable). Downstream removal hooks only fire once the item is
    // actually fully sold out (stockSold reached stockTotal). Fire-and-forget.
    for (const soldOutItemId of fullySoldOutItemIds) {
      endEbayListingIfExists(soldOutItemId).catch(err =>
        console.error('[eBay] Failed to withdraw offer:', err)
      );
      markShopifyItemSold(soldOutItemId).catch(err =>
        console.error('[Shopify] Failed to mark item sold:', err)
      );
      withdrawDiscogsListingIfExists(soldOutItemId).catch(err =>
        console.error('[Discogs] Failed to withdraw listing:', err)
      );
      withdrawReverbListingIfExists(soldOutItemId).catch(err =>
        console.error('[Reverb] Failed to withdraw listing:', err)
      );
      notifyFacebookExportedItemSold(soldOutItemId).catch(err =>
        console.warn(`[FB Nudge] failed for item ${soldOutItemId}:`, err.message)
      );
    }
    for (const partial of partialSaleUpdates) {
      // ADR-087 Phase 4: partial sale, revise eBay listing quantity if linked.
      syncMarketplaceStock(partial.itemId, { fullySoldOut: false, remainingStock: partial.remainingStock }).catch(err =>
        console.error('[eBay ReviseQty] sync failed for item', partial.itemId, err)
      );
    }


    // Feature #58: Award PURCHASE_MADE achievement for linked shopper (fire-and-forget)
    if (posRequest.shopperUserId) {
      checkAndAward(posRequest.shopperUserId, 'PURCHASE_MADE').catch(err =>
        console.warn('[achievement] Failed to check PURCHASE_MADE (POS):', err)
      );
    }

    // Award XP to shopper for purchase
    if (posRequest.shopperUserId) {
      try {
        const baseXp = XP_AWARDS.PURCHASE;
        const multipliedXp = await applyHuntPassMultiplier(posRequest.shopperUserId, baseXp);
        awardXp(posRequest.shopperUserId, 'PURCHASE_COMPLETED', multipliedXp, {
          saleId: posRequest.saleId,
          preMultipliedHuntPassXp: true,
        }).catch((err: any) =>
          console.error('[XP] Failed to award XP for POS purchase:', err)
        );
      } catch (err: any) {
        console.warn('[pos-payment] Failed to award XP:', err.message);
      }
    }

    // Emit socket event to both organizer and shopper
    try {
      const io = getIO();
      io.to(`user:${posRequest.organizerUserId}`).emit('POS_PAYMENT_STATUS', {
        type: 'POS_PAYMENT_STATUS',
        requestId,
        status: 'PAID',
        totalAmountCents: posRequest.totalAmountCents,
        paidAt: new Date().toISOString(),
      });
      io.to(`user:${posRequest.shopperUserId}`).emit('POS_PAYMENT_STATUS', {
        type: 'POS_PAYMENT_STATUS',
        requestId,
        status: 'PAID',
        totalAmountCents: posRequest.totalAmountCents,
        paidAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.warn('[pos-payment] Failed to emit socket event:', err.message);
    }

    // Create notification to organizer
    try {
      await createNotification({
        userId: posRequest.organizerUserId,
        type: 'pos_payment_completed',
        title: 'Payment Received',
        body: `${posRequest.shopper?.name || 'Shopper'} paid $${(posRequest.totalAmountCents / 100).toFixed(2)}${posRequest.itemIds.length > 0 ? ` for ${posRequest.itemIds.length} item(s)` : ''}`,
        link: `/organizer/pos`,
        channel: 'OPERATIONAL',
      });
    } catch (err: any) {
      console.warn('[pos-payment] Failed to create notification:', err.message);
    }

    // 2026-09-16 fix: shopper email/notification gap -- this QR/phone flow previously only
    // notified the organizer on a completed payment. Unlike manualCardPayment's walk-up
    // buyers, posRequest.shopperUserId here is a real, logged-in FindA.Sale account (same
    // account confirmPaymentRequest already authenticated req.user against above), so it
    // gets the same createNotification + email treatment the organizer side already has.
    //
    // DELIBERATELY NOT suppressed for isTestBypassActive (2026-09-17) -- unlike
    // cashPaymentController.ts's isTestTransaction rows, which suppress their receipt
    // email because that suppression is about not spamming a real buyerEmail during
    // routine fee-math QA (no money-safety requirement), this QA Test-Transaction Harness
    // exists specifically so QA CAN verify this exact email/notification fires end-to-end
    // without a real Square charge. Suppressing it here would defeat the harness's entire
    // purpose. Do not "fix" this back to suppressed.
    try {
      await createNotification({
        userId: posRequest.shopperUserId,
        type: 'pos_payment_completed_shopper',
        title: 'Payment Successful',
        body: `Your payment of $${(posRequest.totalAmountCents / 100).toFixed(2)} to ${posRequest.organizer?.name || 'the organizer'}${posRequest.sale?.title ? ` for ${posRequest.sale.title}` : ''} was successful.`,
        link: `/shopper/history?view=receipts`,
        channel: 'OPERATIONAL',
        sendEmail: true,
        emailSubject: 'Your FindA.Sale payment was successful',
      });
    } catch (err: any) {
      console.warn('[pos-payment] Failed to create shopper notification:', err.message);
    }

    return res.json({
      success: true,
      receiptUrl: '/shopper/history?view=receipts',
      isTestTransaction: isTestBypassActive,
    });
  } catch (err: any) {
    console.error('[pos-payment] confirmPaymentRequest error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── CNP FEE (register-entered / manually-keyed card) ────────────────────────────────────
// CONFIRMED (2026-09-18, live-verified against Square's own published fee schedule this
// session): Square's real "Keyed-in" (manually-entered / card-not-present) rate is 3.5% +
// $0.15 per transaction -- notably higher than the 2.9% + $0.30 placeholder this constant
// previously held, which was actually Square's Payments/Online API rate for a DIFFERENT
// integration surface (see payoutController.ts's SQUARE_RATE/SQUARE_FIXED), not the real
// keyed-in rate. That placeholder understated the true cost, exactly as its own prior
// comment warned it might.
//
// Also confirmed this session (findasale-architect investigation, 2026-09-18): this
// endpoint's Square calls (squarePaymentService.ts's SquareChargeParams,
// squarePosPaymentAdapter.ts's CreateAndCapturePaymentParams) never send AVS/billing-address
// data to Square, so this transaction can't reach the card network's cheaper "qualified"
// card-not-present interchange tier today regardless of this surcharge -- pricing for
// Square's flat keyed-in rate is the correct, safe assumption until AVS capture is added.
//
// Surcharge design: the CNP fee is ADDED ON TOP of the sale subtotal and charged to the buyer
// -- mirrors the pre-existing (dead) Stripe manual-entry flow's own design, not a new decision
// made in this rebuild. Platform commission (appFeeCents below) is computed on the subtotal
// only, not on this surcharge -- the surcharge exists to cover this organizer's higher
// effective processing cost for a manually-keyed card, not to enlarge the platform's own cut.
const CNP_FEE_RATE_PLACEHOLDER = 0.035;
const CNP_FEE_FIXED_CENTS_PLACEHOLDER = 15;

/**
 * POST /api/pos/manual-card-payment
 * Organizer (or authorized TEAM_MEMBER register operator) keys in a walk-up shopper's card
 * directly at the register -- no card reader, no shopper account, no POSPaymentRequest row.
 *
 * SQUARE REBUILD (2026-09-12, Stripe removal): replaces the dead
 * /stripe/terminal/manual-card-payment-intent route (confirmed via repo-wide grep to never
 * have been registered server-side -- see pos.tsx's ENABLE_MANUAL_CARD_ENTRY history). This
 * is a genuinely NEW endpoint, not a Stripe-to-Square swap of an existing one.
 *
 * WHY THIS DOESN'T REUSE confirmPaymentRequest's SQUARE BRANCH: that function is
 * shopper-initiated -- it requires an existing POSPaymentRequest row (created by
 * createPaymentRequest) and a real shopperUserId (the shopper has a FindA.Sale account,
 * confirmed via req.user in that flow). Manual card entry has NEITHER: there is no shopper
 * account at all (a walk-up buyer standing at the register, card physically handed over),
 * so there is nothing to create a POSPaymentRequest row against, and the actor making this
 * request IS the organizer/register operator, not a shopper confirming their own payment.
 * Purchase rows here therefore get `userId: null`, the SAME convention
 * cashPaymentController.processCashSaleCore already uses for its own walk-up buyers (see
 * Purchase.userId's own schema comment: "Nullable: POS walk-in buyers have no FindA.Sale
 * account").
 *
 * WHY sourceId (not a persisted request id) IS THE IDEMPOTENCY SEED: squarePosPaymentAdapter's
 * createAndCapturePayment takes `posRequestId` to build its Square idempotency key and
 * referenceId -- it was built for the QR/phone flow's POSPaymentRequest.id. There is no such
 * row here, but Square's card token (sourceId) is itself single-use and unique per
 * card.tokenize() call, so it is passed as `posRequestId` directly: a genuine client retry of
 * the EXACT SAME tokenized submission (e.g. a double-tap before the button disabled, or a
 * dropped response) reuses the SAME sourceId and therefore the SAME Square idempotency key --
 * Square's own CreatePayment idempotency guarantees this can never be charged twice. A user who
 * clicks "Try Again" after a genuine decline re-tokenizes a brand-new sourceId, so that never
 * collides with a prior attempt's key. See squarePaymentService.ts's buildSquareIdempotencyKey
 * doc comment for the same pattern used by the online-checkout surfaces.
 *
 * Purchase-row idempotency (separate from the Square-charge idempotency above): once Square
 * confirms the charge, this checks whether ANY Purchase row already exists for the resulting
 * squarePaymentId before creating new ones -- covers a concurrent duplicate submit that both
 * reached Square with the same sourceId (both get back the same paymentId from Square's own
 * dedup) racing to write Purchase rows. Deliberately checked ONCE for the whole charge (not
 * per item via itemId) because this cart can contain multiple misc/no-itemId lines (custom
 * amount buttons), and the Purchase.squarePaymentId+itemId partial unique index does not
 * constrain itemId=NULL rows against each other (Postgres never treats NULL=NULL as a
 * collision) -- a per-item itemId=null lookup would have incorrectly matched a DIFFERENT
 * misc line from the same charge. A tiny TOCTOU window remains between this check and the
 * creates below for two truly concurrent requests; low severity (Square itself already
 * prevents the money from being charged twice) and flagged in the dev handoff for the
 * adversarial pass rather than engineered away with a transaction this dispatch didn't budget.
 *
 * KNOWN GAP (mirrors squarePosPaymentAdapter.ts's own file-header gap, worse here): if
 * CreatePayment succeeds but the immediate CompletePayment call fails, the QR/phone flow can
 * retry against its persisted POSPaymentRequest.squarePaymentId -- this flow has NO persisted
 * row at all to retry against. A held authorization here is surfaced to Sentry for manual
 * reconciliation and the organizer is told to check Square's dashboard, never told the sale
 * succeeded. See the `!result.captured` branch below.
 */
export const manualCardPayment = async (req: AuthRequest, res: Response) => {
  try {
    const organizer = await resolveOrganizerOrTeamMember(req, res);
    if (!organizer) return;

    // QA Test-Transaction Harness (2026-09-17): isTestTransaction only ever takes effect
    // for the organizer/team-member resolveOrganizerOrTeamMember already resolved above,
    // AND only when the X-QA-Bypass header matches QA_RATE_LIMIT_BYPASS_SECRET
    // (isQABypassRequest, defined near the top of this file -- same secret + header
    // squarePaymentController.ts's createSquareTestTransaction gates its own bypass with).
    // Computed immediately (both inputs -- the flag and the header -- are already
    // available here), but it has NO effect on anything until AFTER the sale-ownership
    // check below passes: a client cannot use isTestTransaction to reach a sale this
    // organizer doesn't already have full charge rights to.
    const { sourceId, saleId, items, buyerEmail, discountType, discountValue, discountReasonNote, isTestTransaction, cashAmountCents, expectedTotalCents } = req.body as {
      sourceId?: string;
      saleId?: string;
      items?: Array<{ itemId?: string; amount: number; label?: string }>;
      buyerEmail?: string;
      discountType?: string;
      discountValue?: number;
      discountReasonNote?: string;
      isTestTransaction?: boolean;
      // Split tender (2026-09-29): cash the cashier already collected at the register, in whole
      // cents. The card is charged the REMAINDER (server-computed subtotal minus this), never the
      // full cart. Omitted / 0 = a normal all-card sale. expectedTotalCents is the register's own
      // cart total, used only to refuse a split when the server's total disagrees (see below).
      cashAmountCents?: number;
      expectedTotalCents?: number;
    };
    const isTestBypassActive = isTestTransaction === true && isQABypassRequest(req);

    if (!isTestBypassActive) {
      if (!sourceId || typeof sourceId !== 'string') {
        return res.status(400).json({ message: 'sourceId is required' });
      }
    }
    // findasale-hacker fix (2026-09-17, sandbox-QA adversarial pass): same sourceId
    // type-validation gap as confirmPaymentRequest above -- see that function's comment on
    // this identical check for the full rationale.
    if (isTestBypassActive && sourceId !== undefined && typeof sourceId !== 'string') {
      return res.status(400).json({ message: 'sourceId must be a string' });
    }
    if (!saleId || typeof saleId !== 'string') {
      return res.status(400).json({ message: 'saleId is required' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'items array is required and must be non-empty' });
    }
    if (!items.every((i) => typeof i.amount === 'number' && i.amount > 0)) {
      return res.status(400).json({ message: 'Each item must have a positive amount' });
    }

    // Sale ownership -- same check every other POS payment endpoint in this file makes.
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true, status: true, organizerId: true, organizer: { select: { userId: true } } },
    });
    if (!sale || sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Sale does not belong to your account' });
    }
    if (sale.status !== 'PUBLISHED') {
      return res.status(400).json({ message: 'Sale is not published' });
    }

    // Reject duplicate itemIds -- each physical item can only be charged once per transaction.
    const itemIds = items.filter((i) => i.itemId).map((i) => i.itemId!);
    if (itemIds.length !== new Set(itemIds).size) {
      return res.status(400).json({ message: 'Duplicate items in cart. Each item can only be charged once per transaction.' });
    }

    let dbItems: Record<string, { id: string; title: string; status: string; draftStatus: string | null; price: number | null }> = {};
    if (itemIds.length > 0) {
      const fetched = await prisma.item.findMany({
        where: { id: { in: itemIds }, saleId },
        select: { id: true, title: true, status: true, draftStatus: true, price: true },
      });
      dbItems = Object.fromEntries(fetched.map((item) => [item.id, item]));
      const notAvailableItemIds: string[] = [];
      for (const itemId of itemIds) {
        if (!dbItems[itemId]) {
          return res.status(404).json({ message: 'Item not found in this sale' });
        }
        if (dbItems[itemId].status !== 'AVAILABLE') {
          // Don't reject immediately -- this could be a genuine idempotent retry of an
          // already-completed charge (the item was marked SOLD by THIS SAME charge's first
          // attempt via sellItemUnits below, and the client is retrying after e.g. a dropped
          // response). Collect it and resolve after the loop by checking for a prior PAID
          // Purchase behind every item in this cart -- see the check below this loop.
          notAvailableItemIds.push(itemId);
          continue;
        }
        if (dbItems[itemId].draftStatus !== null && dbItems[itemId].draftStatus !== 'PUBLISHED') {
          return res.status(400).json({ message: `"${dbItems[itemId].title}" is pending review and cannot be sold yet` });
        }
      }
      if (notAvailableItemIds.length > 0) {
        // findasale-dev fix (2026-09-13, posManualCardPayment idempotent-retry regression):
        // the availability gate above runs BEFORE this function ever reaches Square or the
        // whole-charge squarePaymentId idempotency check further down (see this function's
        // header comment). A genuine retry of an already-successful charge -- same
        // sourceId/items/saleId, e.g. a dropped response -- lands here with the item already
        // SOLD from the first attempt's sellItemUnits call, and would otherwise be rejected
        // with this same 400 instead of returning the original successful response. Only
        // treat it as a safe retry when EVERY item in this cart (not just the not-available
        // ones) already has a PAID Purchase row from ONE shared prior Square payment -- an
        // attacker cannot manufacture that state without having already legitimately paid for
        // these exact items in one shared charge. Otherwise fall through to the original
        // reject-with-400 behavior unchanged.
        const priorPurchases = itemIds.length > 0
          ? await prisma.purchase.findMany({
              where: { itemId: { in: itemIds }, saleId, processor: 'SQUARE', status: 'PAID' },
              select: { id: true, itemId: true, squarePaymentId: true },
            })
          : [];
        const priorPurchaseByItemId = new Map(priorPurchases.map((p) => [p.itemId, p]));
        const distinctPaymentIds = new Set(
          priorPurchases.map((p) => p.squarePaymentId).filter((id): id is string => !!id)
        );
        const isSafeRetry =
          itemIds.length > 0 &&
          itemIds.every((itemId) => priorPurchaseByItemId.has(itemId)) &&
          distinctPaymentIds.size === 1;
        if (isSafeRetry) {
          const [reusedSquarePaymentId] = distinctPaymentIds;
          // Mirrors the whole-charge idempotent-retry-safe lookup further down this function
          // (see its own comment there) -- return every Purchase row tied to that one prior
          // payment, not just the ones for the not-available items in THIS request.
          const allPurchasesForPayment = await prisma.purchase.findMany({
            where: { squarePaymentId: reusedSquarePaymentId },
          });
          return res.json({
            success: true,
            purchaseIds: allPurchasesForPayment.map((p) => p.id),
            squarePaymentId: reusedSquarePaymentId,
          });
        }
        const firstNotAvailableItemId = notAvailableItemIds[0];
        return res.status(400).json({
          message: `"${dbItems[firstNotAvailableItemId].title}" is sold or unavailable`,
        });
      }
    }

    // POS Cashier Discount Permission -- same server-side resolution every other POS charge
    // path in this codebase uses (never trusts a client-supplied discount amount directly).
    const catalogSubtotalCents = Math.round(
      items.reduce((sum, i) => sum + (i.itemId && dbItems[i.itemId]?.price ? dbItems[i.itemId].price! : 0), 0) * 100
    );
    const discountResolution = await resolvePosDiscount({
      actor: organizer,
      input: { discountType, discountValue, discountReasonNote },
      catalogSubtotalCents,
    });
    if (!discountResolution.ok) {
      return res.status(discountResolution.status).json({ message: discountResolution.message });
    }

    // findasale-hacker fix (2026-09-12, manual-card-entry adversarial pass): ADR-112's
    // catalog-price floor (createPaymentRequest above enforces this same invariant via its
    // own minAllowedTotalCents check) was MISSING here entirely -- unlike createPaymentRequest,
    // this endpoint never compared the client-supplied items[].amount against
    // dbItems[itemId].price at all before charging. A tampered/compromised frontend (or a
    // dishonest organizer/team-member submitting a raw request) could send
    // items:[{itemId, amount: 0.01}] for a catalog item the DB prices at any real value, and
    // the server would charge the buyer's card, create the Purchase row, and mark the item
    // SOLD at that arbitrary low amount -- confirmed exploitable via code trace, not caught by
    // this file's own test suite. Only catalog (itemId-bearing) lines are floored here --
    // misc/custom-amount lines (no itemId) remain free-form, same trust boundary
    // createPaymentRequest's own floor check and ADR-112 already document.
    const rawCatalogItemsCents = Math.round(
      items.filter((i) => i.itemId).reduce((sum, i) => sum + i.amount, 0) * 100
    );
    const minAllowedCatalogItemsCents = catalogSubtotalCents - discountResolution.discountAmountCents - 1;
    if (rawCatalogItemsCents < minAllowedCatalogItemsCents) {
      return res.status(400).json({
        message: discountResolution.discountAmountCents > 0
          ? `Total does not match the applied discount. Expected at least ${minAllowedCatalogItemsCents} cents for catalog items.`
          : `Total does not match catalog pricing. Expected at least ${minAllowedCatalogItemsCents} cents for catalog items.`,
      });
    }

    const discountRatio = discountResolution.discountAmountCents > 0 && catalogSubtotalCents > 0
      ? discountResolution.discountAmountCents / catalogSubtotalCents
      : 0;
    const chargedItems = items.map((i) => {
      if (discountRatio === 0 || !i.itemId) return { ...i, rowDiscountCents: 0 };
      const beforeCents = Math.round(i.amount * 100);
      const afterCents = Math.round(beforeCents * (1 - discountRatio));
      return { ...i, amount: afterCents / 100, rowDiscountCents: beforeCents - afterCents };
    });

    const subtotalCents = Math.round(chargedItems.reduce((sum, i) => sum + i.amount, 0) * 100);
    if (subtotalCents <= 0) {
      return res.status(400).json({ message: 'Total must be greater than $0' });
    }

    if (subtotalCents > MAX_POS_AMOUNT_CENTS) {
      return res.status(400).json({
        message: `Total must be at most $${(MAX_POS_AMOUNT_CENTS / 100).toFixed(2)}`,
        code: 'INVALID_AMOUNT',
      });
    }

    // ── SPLIT TENDER (2026-09-29, P1 double-collect fix) ─────────────────────────────────────
    // Before this, the register passed only the cart items, so a cashier who had already taken
    // partial cash and then tapped "Enter card manually" charged the card the FULL cart total:
    // the shopper paid the cash portion twice. The card leg is now subtotal - cash, exactly as in
    // the Send-to-Phone split, and the cash leg is recorded (Purchase.cashLegAmount + a
    // CashFeeAccrual ledger row, commission accrued to cashFeeBalance).
    const hasCashLeg = cashAmountCents !== undefined && cashAmountCents !== null && cashAmountCents !== 0;
    const manualCashCents = hasCashLeg ? (cashAmountCents as number) : 0;
    if (hasCashLeg) {
      if (!isValidCents(manualCashCents)) {
        return res.status(400).json({
          message: `cashAmountCents must be a whole number of cents greater than 0 and at most ${MAX_POS_AMOUNT_CENTS}`,
          code: 'INVALID_SPLIT_AMOUNT',
        });
      }
      if (manualCashCents >= subtotalCents) {
        return res.status(400).json({
          message: 'The cash received covers the whole sale, so this is a cash sale, not a card sale. Record it as a cash sale instead of charging a card.',
          code: 'CASH_COVERS_TOTAL',
        });
      }
      // The cash figure was typed against the register's total. If the server's own total (which
      // applies a discount to catalog lines only) disagrees by more than a cent of rounding, the
      // card charge would not match what the cashier was shown, so refuse rather than charge it.
      if (expectedTotalCents !== undefined && (!isValidCents(expectedTotalCents) || Math.abs(expectedTotalCents - subtotalCents) > 1)) {
        return res.status(409).json({
          message: `The register total ($${isValidCents(expectedTotalCents) ? (expectedTotalCents / 100).toFixed(2) : '?'}) does not match the sale total ($${(subtotalCents / 100).toFixed(2)}). Re-enter the cash amount against the sale total, or remove the discount and try again.`,
          code: 'TOTAL_MISMATCH',
          serverTotalCents: subtotalCents,
        });
      }
    }
    const isManualSplit = manualCashCents > 0;
    const cardSubtotalCents = subtotalCents - manualCashCents;

    const cnpFeeCents = Math.round(cardSubtotalCents * CNP_FEE_RATE_PLACEHOLDER) + CNP_FEE_FIXED_CENTS_PLACEHOLDER;
    const totalChargeCents = cardSubtotalCents + cnpFeeCents;

    // Platform commission on the sale's own subtotal (never the CNP surcharge) -- same
    // resolution createPaymentRequest above uses for the card portion of its own charges.
    const hasReferralDiscount =
      organizer.referralDiscountExpiry != null && organizer.referralDiscountExpiry > new Date();
    const cardFeeRate = hasReferralDiscount ? 0 : getInclusivePlatformFeeRate(organizer.subscriptionTier as any, 'IN_PERSON');
    const baseAppFeeCents = hasReferralDiscount
      ? 0
      : calculateInclusiveCommissionCents(cardSubtotalCents, organizer.subscriptionTier as any, 'IN_PERSON');

    // Card-leg floor (2026-09-29): the actual charge (card subtotal + CNP surcharge) must be a
    // charge Square will accept with this fee on it. Checked before anything is sent to Square.
    const manualLegProblem = cardLegProblem({
      cardCents: totalChargeCents,
      appFeeCents: baseAppFeeCents,
      isSplit: isManualSplit,
    });
    if (manualLegProblem) {
      return res.status(400).json({ message: manualLegProblem, code: 'CARD_AMOUNT_TOO_SMALL' });
    }

    // Cash-fee exposure cap (2026-09-24 ruling, now also applied to this split path 2026-09-29):
    // best-effort pre-charge check (this endpoint has no request row to lock against, so two
    // simultaneous manual splits are not serialized the way createPaymentRequest's are; the
    // overshoot is bounded by the number of concurrent registers and the cap is a tail-risk
    // limit, not an exact ledger).
    if (isManualSplit && !isTestBypassActive) {
      const manualCashRate = await resolveCashCommissionRate(organizer);
      const manualCashCommission = cashCommissionOn(manualCashCents / 100, manualCashRate);
      if (await wouldExceedCashFeeExposureCap({ organizerId: organizer.id, commission: manualCashCommission })) {
        return res.status(400).json({ message: CASH_FEE_CAP_MESSAGE, code: 'CASH_FEE_EXPOSURE_CAP_EXCEEDED' });
      }
    }

    // QA Test-Transaction Harness (2026-09-17): mirrors squarePaymentController.ts's
    // createSquareTestTransaction -- see that function's header comment for the full "why
    // no isolated Square sandbox exists" reasoning, which applies identically here (this
    // endpoint always charges the organizer's own live connected Square account). When
    // isTestBypassActive: skip the real Square preflight + createAndCapturePayment call
    // entirely, AND skip the cash-fee-debt recoupment (applyCashDebtToAppFee only reads
    // organizer.cashFeeBalance and returns a computed split -- the actual mutation happens
    // later in settleCashDebtCollection, which is already a no-op for debtAppliedCents=0,
    // so setting debtAppliedCents=0 here is sufficient to guarantee a fake test sale never
    // touches the organizer's real cash-fee balance, same posture cashPaymentController.ts
    // already takes for its own isTestTransaction rows). cardFeeRate/baseAppFeeCents above
    // are still computed the normal way so the Purchase row's fee math is genuinely
    // exercised -- exactly what this test path exists to verify.
    let appFeeCents: number;
    let debtAppliedCents: number;
    let squarePaymentId: string;
    if (isTestBypassActive) {
      appFeeCents = baseAppFeeCents;
      debtAppliedCents = 0;

      // Real Square Sandbox ADR (2026-09-17, supersedes the old synthetic-id no-op): real
      // sandbox charge/capture round-trip via createAndCaptureSandboxPayment
      // (squarePosPaymentAdapter.ts) -- see confirmPaymentRequest's own isTestBypassActive
      // comment above for the full rationale (sourceId defaults to 'cnon:card-nonce-ok',
      // honors an explicit override, never touches the organizer's live account). A fresh
      // random posRequestId seeds the idempotency key here (unlike the non-test branch
      // below, which reuses the one-time sourceId itself) because a test-bypass sourceId is
      // often the SAME shared nonce across many unrelated test purchases (e.g. the default
      // 'cnon:card-nonce-ok') -- reusing it as the idempotency seed would incorrectly
      // collapse distinct test transactions into one cached Square payment. A real decline
      // is not swallowed -- it returns the same DECLINE_MESSAGE shape the non-test path
      // below returns.
      const sandboxResult = await squarePos.createAndCaptureSandboxPayment({
        sourceId,
        amountCents: totalChargeCents,
        posRequestId: `manual-test-${crypto.randomUUID()}`,
      });

      if (!sandboxResult.ok) {
        return res.status(sandboxResult.status).json({ message: sandboxResult.message });
      }

      if (!sandboxResult.captured) {
        try {
          Sentry.captureMessage(
            `[pos-payment] Square SANDBOX CompletePayment did not capture immediately for manual card entry (isTestTransaction) -- organizerId=${organizer.id} squarePaymentId=${sandboxResult.paymentId}. No POSPaymentRequest row exists to retry against; needs manual reconciliation.`,
            'warning'
          );
        } catch {
          // Sentry may not be initialized -- silently continue
        }
        return res.status(202).json({
          success: false,
          processing: true,
          message: "Your payment is still processing. Please check Square's dashboard in a moment, or try the sale again.",
        });
      }

      squarePaymentId = sandboxResult.paymentId;
    } else {
      const preflight = await squarePos.preflightAccountStatus({
        id: organizer.id,
        squareOnboarded: organizer.squareOnboarded,
        squareMerchantId: organizer.squareMerchantId,
        squareLocationId: organizer.squareLocationId,
      });
      if (!preflight.ok) {
        return res.status(preflight.status).json({ message: preflight.message });
      }

      // Cash-fee-debt recoupment (2026-09-12 Stripe removal) -- same mechanism every other
      // Square card charge in this codebase applies, see cashFeeService.ts's file header.
      ({ appFeeCents, debtAppliedCents } = await applyCashDebtToAppFee({
        organizerId: organizer.id,
        baseAppFeeCents,
        saleAmountCents: totalChargeCents,
      }));

      const result = await squarePos.createAndCapturePayment({
        organizer: {
          id: organizer.id,
          squareOnboarded: organizer.squareOnboarded,
          squareMerchantId: organizer.squareMerchantId,
          // preflight.squareLocationId (not organizer.squareLocationId): if this organizer's
          // location was just backfilled by preflightAccountStatus above, `organizer` itself
          // still holds the stale pre-preflight value resolved at the top of this request.
          squareLocationId: preflight.squareLocationId,
        },
        accessToken: preflight.accessToken,
        sourceId: sourceId!,
        amountCents: totalChargeCents,
        appFeeCents,
        // No POSPaymentRequest row exists for this flow -- sourceId itself is the idempotency
        // seed. See this function's own header comment for the full reasoning.
        posRequestId: sourceId!,
      });

      if (!result.ok) {
        return res.status(result.status).json({ message: result.message });
      }

      if (!result.captured) {
        // KNOWN GAP -- see this function's header comment. No persisted request row to retry
        // against for this walk-up flow, unlike the QR/phone rail's POSPaymentRequest.
        try {
          Sentry.captureMessage(
            `[pos-payment] Square CompletePayment did not capture immediately for manual card entry -- organizerId=${organizer.id} squarePaymentId=${result.paymentId}. No POSPaymentRequest row exists to retry against; needs manual reconciliation via Square dashboard.`,
            'warning'
          );
        } catch {
          // Sentry may not be initialized -- silently continue
        }
        return res.status(202).json({
          success: false,
          processing: true,
          message: "Your payment is still processing. Please check Square's dashboard in a moment, or try the sale again.",
        });
      }

      squarePaymentId = result.paymentId;
    }

    // Cash-leg commission accrual (2026-09-29). Keyed by the Square payment id in the
    // CashFeeAccrual ledger, so it is idempotent across a retried submit (same sourceId ->
    // same Square payment id) and safe to run BEFORE the purchase-row idempotency check below.
    // Failure never fails the sale: the card is already charged and a client "Try Again"
    // re-tokenizes a NEW sourceId (a new Square idempotency key), so surfacing an error here
    // could double-charge. Instead it is alerted loudly to Sentry and flagged in the response;
    // the Purchase rows below carry cashLegAmount, so a missing ledger row is findable with:
    //   SELECT p.* FROM "Purchase" p LEFT JOIN "CashFeeAccrual" c ON c."sourceId" = p."squarePaymentId"
    //   WHERE p."cashLegAmount" > 0 AND p."source" = 'POS' AND c.id IS NULL;
    // and re-running accrueSplitCashLegOnce (idempotent) heals it.
    let cashFeeAccrualPending = false;
    if (isManualSplit && !isTestBypassActive) {
      try {
        await accrueSplitCashLegOnce({
          organizer: {
            id: organizer.id,
            subscriptionTier: organizer.subscriptionTier,
            referralDiscountExpiry: organizer.referralDiscountExpiry,
          },
          sourceType: 'MANUAL_CARD',
          sourceId: squarePaymentId,
          cashAmountCents: manualCashCents,
        });
      } catch (accrualErr: any) {
        cashFeeAccrualPending = true;
        console.error('[pos-payment] manualCardPayment: cash-leg commission accrual FAILED (card already charged):', accrualErr);
        try {
          Sentry.captureException(accrualErr instanceof Error ? accrualErr : new Error(String(accrualErr)), {
            tags: { area: 'pos-manual-card-split-cash-commission' },
            level: 'error',
            extra: { organizerId: organizer.id, squarePaymentId, cashAmountCents: manualCashCents, saleId },
          });
        } catch {
          // Sentry may not be initialized -- silently continue
        }
      }
    }

    // Whole-charge idempotent-retry-safe lookup -- see this function's header comment for why
    // this is checked once per charge rather than per item.
    const existingPurchases = await prisma.purchase.findMany({ where: { squarePaymentId } });
    if (existingPurchases.length > 0) {
      return res.json({
        success: true,
        purchaseIds: existingPurchases.map((p) => p.id),
        squarePaymentId,
        subtotalCents,
        cnpFeeCents,
        totalChargedCents: totalChargeCents,
        isSplitPayment: isManualSplit,
        cashAmountCents: isManualSplit ? manualCashCents : undefined,
        cardSubtotalCents,
        cashFeeAccrualPending,
        isTestTransaction: isTestBypassActive,
      });
    }

    const purchaseIds: string[] = [];
    let remainingDebtCentsToAllocate = debtAppliedCents;
    // Split tender (2026-09-29): each row's proportional share of the cash leg, in whole cents,
    // summing exactly to the cash the cashier collected.
    const manualCashShares = isManualSplit
      ? allocateCentsProportionally(manualCashCents, chargedItems.map((ci) => Math.round(ci.amount * 100)))
      : chargedItems.map(() => 0);
    // Inclusive-fee migration (2026-09-24): baseAppFeeCents may include the per-transaction
    // minimum-fee floor (calculateInclusiveCommissionCents), which a flat itemAmountCents *
    // cardFeeRate multiplication would not reflect on a small-ticket sale where the floor is
    // what actually applies. Allocate it the same remainder-tracked way debt is allocated just
    // below (proportional per item, last item absorbs the rounding remainder) so the summed
    // per-item platformFeeAmount always equals baseAppFeeCents exactly -- the real amount
    // charged to Square -- instead of silently under-reporting it on floor-priced sales.
    let remainingAppFeeCentsToAllocate = baseAppFeeCents;
    for (let idx = 0; idx < chargedItems.length; idx++) {
      const item = chargedItems[idx];
      const itemAmountCents = Math.round(item.amount * 100);
      const isLastItem = idx === chargedItems.length - 1;
      const itemFeeCents = isLastItem
        ? remainingAppFeeCentsToAllocate
        : Math.min(
            remainingAppFeeCentsToAllocate,
            subtotalCents > 0 ? Math.round(baseAppFeeCents * (itemAmountCents / subtotalCents)) : 0
          );
      remainingAppFeeCentsToAllocate -= itemFeeCents;
      const itemDebtCents = isLastItem
        ? remainingDebtCentsToAllocate
        : Math.min(
            remainingDebtCentsToAllocate,
            subtotalCents > 0 ? Math.round(debtAppliedCents * (itemAmountCents / subtotalCents)) : 0
          );
      remainingDebtCentsToAllocate -= itemDebtCents;

      try {
        const purchase = await prisma.purchase.create({
          data: {
            userId: null, // walk-up buyer, no FindA.Sale account -- see Purchase.userId schema comment
            itemId: item.itemId ?? null,
            saleId,
            amount: item.amount,
            platformFeeAmount: (itemFeeCents + itemDebtCents) / 100,
            cashDebtCollectedAmount: itemDebtCents > 0 ? itemDebtCents / 100 : undefined,
            cashLegAmount: manualCashShares[idx] > 0 ? manualCashShares[idx] / 100 : undefined,
            ...snapshotForCommissionOnly(itemFeeCents / 100, cardFeeRate),
            discountType: item.rowDiscountCents > 0 ? discountResolution.discountType : null,
            discountValueRaw: item.rowDiscountCents > 0 ? discountResolution.discountValueRaw : null,
            discountAmountCents: item.rowDiscountCents > 0 ? item.rowDiscountCents : null,
            discountReasonNote: item.rowDiscountCents > 0 ? discountResolution.discountReasonNote : null,
            discountAppliedByUserId: item.rowDiscountCents > 0 ? organizer.actingUserId : null,
            processor: 'SQUARE',
            squarePaymentId,
            status: 'PAID',
            source: 'POS',
            buyerEmail: buyerEmail && buyerEmail.trim() ? buyerEmail.trim() : undefined,
            isTestTransaction: isTestBypassActive,
          },
        });
        purchaseIds.push(purchase.id);
      } catch (err: any) {
        // P0 fix precedent (2026-08-08, Terminal readiness audit / confirmPaymentRequest
        // above): the Square charge is ALREADY captured by this point -- a failure here
        // means money was taken but this one line item wasn't recorded as sold. Alert and
        // keep processing the rest of the cart rather than aborting (which would silently
        // drop every item after the failed one, on top of the payment already succeeding).
        console.error(`[pos-payment] manualCardPayment: failed to create Purchase for item ${item.itemId ?? '(misc)'} (payment already captured):`, err);
        try {
          Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
            tags: { area: 'pos-manual-card-payment-purchase-create' },
            extra: { saleId, itemId: item.itemId ?? null, organizerId: organizer.id, squarePaymentId },
          });
        } catch {
          // Sentry may not be initialized
        }
        continue;
      }

      // QA Test-Transaction Harness (2026-09-17): the irreversible stock decrement / SOLD
      // flip / cross-channel (eBay/Shopify/Discogs) withdraw-on-sale below is skipped for a
      // test transaction -- same "Test Transaction safety net" precedent
      // cashPaymentController.ts already established (2026-08-29 incident). The Purchase
      // row above was still created for real (tagged isTestTransaction) so the pricing/fee
      // math and the receipt email below are genuinely exercised.
      if (item.itemId && !isTestBypassActive) {
        try {
          const { fullySoldOut, remainingStock } = await sellItemUnits(item.itemId, 1);
          if (fullySoldOut) {
            endEbayListingIfExists(item.itemId).catch((err) => console.error('[eBay] Failed to withdraw offer:', err));
            markShopifyItemSold(item.itemId).catch((err) => console.error('[Shopify] Failed to mark item sold:', err));
            withdrawDiscogsListingIfExists(item.itemId).catch((err) => console.error('[Discogs] Failed to withdraw listing:', err));
            withdrawReverbListingIfExists(item.itemId).catch((err) => console.error('[Reverb] Failed to withdraw listing:', err));
            notifyFacebookExportedItemSold(item.itemId).catch((err) => console.warn(`[FB Nudge] failed for item ${item.itemId}:`, err.message));
          } else {
            syncMarketplaceStock(item.itemId, { fullySoldOut: false, remainingStock }).catch((err) =>
              console.error('[eBay ReviseQty] sync failed for item', item.itemId, err)
            );
          }
        } catch (stockErr: any) {
          if (stockErr instanceof InsufficientStockError) {
            console.error(`[pos-payment] manualCardPayment: oversold race on item ${item.itemId} despite captured payment:`, stockErr.message);
          }
          console.error(`[pos-payment] manualCardPayment: post-payment stock update FAILED for item ${item.itemId} (payment already captured):`, stockErr);
          try {
            Sentry.captureException(stockErr instanceof Error ? stockErr : new Error(String(stockErr)), {
              tags: { area: 'pos-manual-card-payment-post-payment-stock-update' },
              extra: { saleId, itemId: item.itemId, organizerId: organizer.id, squarePaymentId },
            });
          } catch {
            // Sentry may not be initialized
          }
        }
      }
    }

    // 2026-09-16 fix: manual-card-entry buyer receipt-email gap -- this endpoint has always
    // accepted and stored buyerEmail on each Purchase row but never actually sent a receipt.
    // Mirrors cashPaymentController.ts's processCashSaleCore receipt block exactly (same
    // buildEmail template helper, same transactionalEmailService rail, fail-open on error).
    //
    // 2026-09-17 update: isTestTransaction now exists on this endpoint (QA Test-Transaction
    // Harness, see isTestBypassActive above) -- but this block is DELIBERATELY NOT
    // suppressed for it, unlike cashPaymentController.ts's own isTestTransaction rows. That
    // suppression is about not spamming a real buyerEmail during routine fee-math QA (no
    // money-safety requirement); this harness exists specifically so QA CAN verify this
    // exact receipt email fires end-to-end without a real Square charge. Suppressing it
    // here would defeat the harness's entire purpose. Do not "fix" this back to suppressed.
    if (buyerEmail && buyerEmail.trim()) {
      try {
        const { buildEmail } = await import('../services/emailTemplateService');
        const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
        const itemsList = chargedItems
          .map((i) => `<li>${(i.itemId && dbItems[i.itemId]?.title) || i.label || 'Item'}: $${i.amount.toFixed(2)}</li>`)
          .join('');
        const html = buildEmail({
          preheader: `Receipt for your purchase`,
          headline: 'Your receipt from FindA.Sale 🎉',
          body: `<p>Thank you for your purchase!</p><ul>${itemsList}</ul>${isManualSplit ? `<p>Paid in cash: $${(manualCashCents / 100).toFixed(2)}</p>` : ''}<p><strong>Total${isManualSplit ? ' charged to card' : ''}: $${(totalChargeCents / 100).toFixed(2)}</strong></p>`,
          ctaText: 'Visit FindA.Sale',
          ctaUrl: process.env.FRONTEND_URL || 'https://finda.sale',
          accentColor: '#10b981',
        });
        await transactionalEmailService.emails.send({
          from: fromEmail,
          to: buyerEmail.trim(),
          subject: `Receipt: Your in-person purchase`,
          html,
        });
      } catch (emailErr) {
        console.warn('[pos-payment] Failed to send manual-card sale receipt email:', emailErr);
      }
    }

    await settleCashDebtCollection({ organizerId: organizer.id, debtAppliedCents });

    // S1072 Finding #4 shape: no verifiable buyer account for this walk-up register sale --
    // same posture as cashPaymentController.cashPayment's own recordSuspectedSignal call.
    // Log-only, never blocks a legitimate sale.
    // Skipped for isTestBypassActive (2026-09-17): no real money moved and no real buyer
    // exists for a test transaction -- same posture cashPaymentController.ts's own
    // isTestTransaction check on this identical call already takes ("nothing here worth an
    // admin's self-dealing review; recording one anyway would just be false-positive noise").
    if (sale.organizer?.userId && !isTestBypassActive) {
      recordSuspectedSignal({
        prisma,
        userId: sale.organizer.userId,
        saleId,
        signalType: 'SELF_DEALING',
        notes: '[manualCardPayment] Manual card-entry sale recorded with no verifiable buyer account: offsite/unpreventable, logged for review only.',
      }).catch((err) => console.warn('[pos-payment] recordSuspectedSignal failed (non-fatal):', err));
    }

    return res.json({
      success: true,
      purchaseIds,
      squarePaymentId,
      subtotalCents,
      cnpFeeCents,
      totalChargedCents: totalChargeCents,
      isSplitPayment: isManualSplit,
      cashAmountCents: isManualSplit ? manualCashCents : undefined,
      cardSubtotalCents,
      cashFeeAccrualPending,
      isTestTransaction: isTestBypassActive,
    });
  } catch (err: any) {
    console.error('[pos-payment] manualCardPayment error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
