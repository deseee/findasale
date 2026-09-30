import { prisma } from '../lib/prisma';
import * as Sentry from '@sentry/node';
import { SquareClient, SquareEnvironment } from 'square';
import { RefundError } from './refundService'; // SAME error class Stripe's refund path throws -- see file comment below for why this is not redeclared here.
import { notifyVendorBoothSaleRefunded } from './vendorBoothSaleNotificationService';
import { createNotification } from '../lib/notificationService';
import { resolveOrganizerSquareAccessToken, SquareOnboardingIncompleteError } from './squarePaymentService'; // Wave 0.5 (2026-09-07): reuse the SAME token-resolve/refresh seam checkout/POS already use rather than re-implementing it here -- see resolveSquareAccessToken() below.
import { resolveVendorBoothSquareAccessToken, SquareBoothOnboardingIncompleteError } from './squareVendorBoothCartService'; // vendor-booth-cart-checkout dispatch (2026-09-07): resolves the booth's OWN token for a booth-cart Square refund (see the extended purchase.boothCartTransactionId branch below).
import { resolveSplitRefund, roundMoney } from './cashFeeService'; // Split tender (2026-09-29): cap the processor refund at the card leg; the cash leg is refunded by hand
import type { SplitRefundResolution } from './cashFeeService'; // partial-refund finalize helpers (2026-09-29)
import { reverseSplitCashCommissionForRefund } from './cashFeeRefundReversalService'; // Split tender (2026-09-29): proportional, idempotent reversal of the cash-leg commission on the refunded cash value

/**
 * squareRefundService.ts -- Square-side mirror of refundService.ts's single-choke-point
 * shape (2026-09-07, Wave 1 #4 of the Square-replaces-Stripe migration -- see
 * claude_docs/feature-notes/square-replaces-stripe-architecture-and-scoping-2026-09-07.md,
 * "Wave 1" section, dispatch #4).
 *
 * WHY THIS REUSES RefundError FROM refundService.ts INSTEAD OF DEFINING ITS OWN: every
 * existing caller (stripeController.ts's createRefund, disputeController.ts's
 * updateDisputeStatus, adminController.ts's bulkRefundPurchases) already has a
 * `catch (err) { if (err instanceof RefundError) {...} }` block written against
 * refundService.ts's class. Throwing a second, differently-named error class from this file
 * would silently bypass every one of those catch blocks and fall through to each caller's
 * generic 500 handler -- losing the statusCode/details a caller is supposed to relay to the
 * client. Reusing the SAME class keeps the three call sites' existing catch logic correct
 * for BOTH processors with a one-line branch added at each site (see the "one added branch"
 * changes in stripeController.ts / disputeController.ts / adminController.ts alongside this
 * file), instead of needing a second parallel catch clause everywhere.
 *
 * WHAT DOES NOT NEED A DUAL-FLAG DANCE HERE (real simplification, confirmed via Square's own
 * docs, developer.squareup.com/docs/payments-api/collect-fees/payment-with-app-fee-refund):
 * Stripe's executeVerifiedRefund needs STRIPE_REFUND_LIVE_CLAWBACK + the
 * reverse_transfer/refund_application_fee pair because a Stripe DESTINATION charge splits the
 * payment via an explicit Transfer that has to be explicitly reversed. Square has no
 * Destination-charge equivalent -- every Square payment in this migration lives on the
 * connected MERCHANT's own account (OAuth-scoped, closer to Stripe's *Direct* charge shape --
 * see the architecture doc's "(2) Stripe -> Square Mapping" section), with only the platform's
 * `app_fee_money` cut sitting elsewhere. Square AUTOMATICALLY refunds `app_fee_money`
 * proportionally on every refund by default (confirmed, same doc) -- there is no organizer
 * "clawback" step for FindA.Sale to gate behind a flag here at all. That's why this file has
 * no `squareRefundClawbackEnabled()` equivalent to refundService.ts's `refundClawbackEnabled()`.
 * The ONE flag this migration wave does add (`SQUARE_DISPUTE_LIVE_CLAWBACK`, below) is for a
 * different, narrower, genuinely open question -- see its own comment.
 */

// ---------------------------------------------------------------------------------------
// SQUARE_DISPUTE_LIVE_CLAWBACK -- mirrors STRIPE_DISPUTE_LIVE_CLAWBACK (refundService.ts)
// in SHAPE (an independently-toggleable, default-OFF flag gating a dispute-lost money-path
// consequence) but NOT in mechanism -- see handleSquareDisputeWebhook's own comment on the
// LOST branch for exactly what this does and does not do today. Deliberately a SEPARATE env
// var from the Stripe flag per the dispatch spec -- never reuse STRIPE_DISPUTE_LIVE_CLAWBACK
// for Square events.
// ---------------------------------------------------------------------------------------
export const squareDisputeClawbackEnabled = (): boolean =>
  process.env.SQUARE_DISPUTE_LIVE_CLAWBACK === 'true';

/**
 * Square RefundPayment's own `reason` field is free text (max 192 chars, no confirmed
 * Stripe-Radar-style auto-blocklist mechanism -- unresearched either way this session, not
 * assumed safe). Kept mapped to plain, accurate strings rather than passed through verbatim
 * so this file carries forward the SAME labeling discipline the Stripe side follows
 * (adminController.ts's bulkRefundPurchases comment, 2026-08-30 fix): never default to
 * fraud-sounding language, and never invent a reason the caller didn't actually choose. The
 * principle holds regardless of whether Square auto-blocklists on it -- see dispatch prompt.
 */
function mapReasonToSquareText(reason: 'duplicate' | 'fraudulent' | 'requested_by_customer'): string {
  switch (reason) {
    case 'duplicate':
      return 'Duplicate charge';
    case 'fraudulent':
      return 'Reported as fraudulent';
    case 'requested_by_customer':
    default:
      return 'Requested by customer';
  }
}

/**
 * Resolves the Square OAuth access token that can act on this organizer's payments.
 *
 * RESOLVED (2026-09-07, Wave 0.5) -- see the function body below. The gap description that
 * follows is kept for historical context (why this function exists as its own named seam
 * instead of being inlined) -- do not read it as still-current; the schema fields it refers
 * to as missing now exist.
 *
 * HISTORICAL GAP DESCRIPTION (see RESOLVED note above): Square's RefundPayment
 * requires the Authorization header to be "the account that took the original payment"
 * (developer.squareup.com/docs/payments-api/refund-payments) -- unlike Stripe's platform-
 * secret-key + `Stripe-Account` header pattern, a Square Connect app must call the API using
 * the CONNECTED MERCHANT's own per-merchant OAuth access token, not a single platform-wide
 * token. Wave 0's schema migration (already deployed) added `Organizer.squareMerchantId` /
 * `squareOnboarded` / `squareLocationId` but did NOT add anywhere to store that per-merchant
 * access token -- there is no field in schema.prisma today this function could read. This is
 * NOT something Wave 1 dispatch #4 (this file) is scoped to invent (schema is frozen per this
 * dispatch's own instructions), and guessing a field name that doesn't exist would just fail
 * at runtime with a confusing Prisma error instead of a clear one.
 *
 * This function is the SINGLE integration point for wiring that up once it exists: the
 * Connect-equivalent onboarding dispatch (Wave 1 #2, squareConnectService.ts) is the one that
 * will actually design where a per-merchant Square access token lives. Once it does, only
 * this function's body needs to change -- every caller in this file already awaits it and
 * handles a thrown RefundError the same way it handles every other verification failure.
 * Deliberately throws instead of ever falling back to a platform-level env var: refunding
 * against the WRONG Square account (e.g. a single shared `SQUARE_ACCESS_TOKEN`) would either
 * hard-fail with a Square permission error or, worse, silently succeed against an unrelated
 * merchant's payment history -- an IDOR-shaped failure mode this function refuses to risk.
 */
async function resolveSquareAccessToken(organizerId: string): Promise<string> {
  // Wave 0.5 (2026-09-07): the gap described in this function's own doc comment above is
  // CLOSED -- Organizer now has squareAccessTokenEncrypted/squareRefreshTokenEncrypted/
  // squareTokenExpiresAt columns (migration 20260907020000_square_oauth_token_storage_and_
  // boothcartleg_processor). Delegates to squarePaymentService.ts's
  // resolveOrganizerSquareAccessToken -- the SAME seam checkout (Wave 1 #1) and POS (Wave 1
  // #3) already use -- rather than re-implementing decrypt/refresh/persist logic a second
  // time here. Re-wraps SquareOnboardingIncompleteError as a RefundError so every existing
  // caller of executeVerifiedSquareRefund (which already catches RefundError) keeps working
  // unchanged, matching this file's own "same error class" design principle stated above.
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: { id: true, squareMerchantId: true, squareOnboarded: true },
  });
  if (!organizer) {
    throw new RefundError('Could not resolve the organizer for this Square refund.', 404, { organizerId });
  }
  try {
    return await resolveOrganizerSquareAccessToken(organizer);
  } catch (err) {
    if (err instanceof SquareOnboardingIncompleteError) {
      throw new RefundError(
        `Square refunds aren't available for this organizer yet (organizerId=${organizerId}) -- ` +
          'Square onboarding is incomplete or the stored OAuth token is missing/expired with no ' +
          'usable refresh token on file.',
        501,
        { organizerId }
      );
    }
    throw err;
  }
}

// SECURITY FIX (findasale-hacker fix-and-reverify pass, 2026-09-08): this defaulted to
// PRODUCTION whenever SQUARE_ENVIRONMENT was anything other than the exact literal 'sandbox'
// (unset, blank, or differently-cased all fell through to Production) -- the opposite, riskier
// default from squareConnectService.ts's getSquareEnvironment() (safely defaults to SANDBOX
// unless SQUARE_ENVIRONMENT is exactly 'production') and from utils/square.ts's
// getSquareClientForMerchant (same fix applied there this pass). Flipped to match the same
// explicit-opt-in-to-production convention across all three files.
function getSquareClientForToken(accessToken: string): SquareClient {
  return new SquareClient({
    token: accessToken,
    environment: process.env.SQUARE_ENVIRONMENT === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
  });
}

// ---------------------------------------------------------------------------------------
// Refund bookkeeping helpers (2026-09-29, money review P1-14 / P1-15)
// ---------------------------------------------------------------------------------------

export type RefundInitiator = 'organizer' | 'admin' | 'dispute';
const REFUND_INITIATOR_CODE: Record<RefundInitiator, string> = { organizer: 'o', admin: 'a', dispute: 'd' };
const REFUND_INITIATOR_FROM_CODE: Record<string, RefundInitiator> = { o: 'organizer', a: 'admin', d: 'dispute' };

/**
 * Reconcile marker carried in the Square refund's own `reason` text. Purchase has no column for the
 * Square refund id, and this pass deliberately makes no schema change, so the refund itself is what
 * links Square back to the purchase: `[FindA.Sale ref <purchaseId>:<centsRefundedBefore>:<centsThisRefund>:<o|a|d>]`.
 * reconcileStuckSquareRefunds finds a refund that Square accepted but whose finalize update failed by
 * listing the payment's refunds and matching this tag, then finishes the purchase from it. The tag is
 * ASCII, about 60 characters, and appended after the human reason (Square allows 192).
 */
export function buildSquareRefundTag(purchaseId: string, priorCents: number, amountCents: number, initiatedBy: RefundInitiator): string {
  return `[FindA.Sale ref ${purchaseId}:${priorCents}:${amountCents}:${REFUND_INITIATOR_CODE[initiatedBy]}]`;
}

export function parseSquareRefundTag(
  reason: string | null | undefined
): { purchaseId: string; priorCents: number; amountCents: number; initiatedBy: RefundInitiator } | null {
  if (!reason) return null;
  const m = /\[FindA\.Sale ref ([^:\]\s]+):(\d+):(\d+):([oad])\]/.exec(reason);
  if (!m) return null;
  return {
    purchaseId: m[1],
    priorCents: parseInt(m[2], 10),
    amountCents: parseInt(m[3], 10),
    initiatedBy: REFUND_INITIATOR_FROM_CODE[m[4]],
  };
}

/**
 * Square refund idempotency key. A purchase's FIRST refund keeps the key it has always had
 * (`square-refund-<id>`), so a retry of an in-flight first refund still dedupes. A later partial
 * refund of the same purchase embeds the cents already refunded, because Square rejects the same key
 * with a different amount (IDEMPOTENCY_KEY_REUSED). Still deterministic per logical refund: a retry of
 * the same refund starts from the same prior total and so reuses the same key (no double refund).
 */
export function buildSquareRefundIdempotencyKey(purchaseId: string, priorRefundedCents: number): string {
  return priorRefundedCents > 0 ? `square-refund-${purchaseId}-r${priorRefundedCents}` : `square-refund-${purchaseId}`;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface FinalizablePurchase {
  id: string;
  amount: number;
  itemId: string | null;
  platformFeeAmount?: number | null;
  cashDebtCollectedAmount?: number | null;
  cashLegAmount?: number | null;
  refundedAmount?: number | null;
  refundCashPortion?: number | null;
  squarePaymentId?: string | null;
}

interface FinalizeOutcome {
  /** True when another finalize already moved the purchase out of REFUNDING (nothing was written). */
  alreadyFinalized: boolean;
  isFullRefund: boolean;
  totalRefundedAmount: number;
}

/**
 * The transactional half of finishing a Square refund: flip REFUNDING to its final status and do every
 * write that must happen exactly once with it (stock, reservations, debt re-accrual) in ONE
 * transaction, so a crash can never leave "status flipped, stock not restored" or the reverse, and a
 * replay (retry, or the reconcile sweep) that finds the row already finalized writes nothing.
 *
 * Final status comes from the amounts (money review P1-14/P1-15): REFUNDED only when the cumulative
 * refunded value reaches the purchase amount. A PARTIAL refund leaves the purchase PAID with
 * refundedAmount tracked, so the item is NOT put back on sale while the buyer keeps it, and a second
 * partial refund can still be issued up to the remaining balance.
 */
async function finalizeSquareRefundTx(args: {
  purchase: FinalizablePurchase;
  refundAmount: number;
  split: SplitRefundResolution;
  initiatedBy: RefundInitiator;
  isCashPurchase: boolean;
  organizerId?: string;
}): Promise<FinalizeOutcome> {
  const { purchase, refundAmount, split, initiatedBy, isCashPurchase, organizerId } = args;
  const priorRefunded = roundMoney(Number(purchase.refundedAmount) || 0);
  const newTotal = roundMoney(priorRefunded + refundAmount);
  const isFullRefund = Math.round(newTotal * 100) >= Math.round(purchase.amount * 100);
  const priorCash = Math.min(priorRefunded, Math.max(0, Number(purchase.refundCashPortion) || 0));

  // Cash-fee-DEBT-COLLECTION reversal (2026-09-12, Stripe removal). This purchase was a CARD sale
  // whose appFeeMoney was padded to recoup outstanding cashFeeBalance. Square refunds app_fee_money
  // proportionally on every refund, which claws the padded amount out of the platform's balance; if it
  // were not re-accrued here the debt would stay "collected" in our DB with the money gone. Now that a
  // partial refund keeps the purchase refundable, re-accrue the debt CUMULATIVELY in proportion to the
  // card value refunded (the first refund's share, then only the increment), which sums to the full
  // recorded amount once the card leg is fully refunded. Split rows measure against the card leg
  // (cash never went through Square); a non-split purchase measures against its whole amount.
  const collectedDebt = Number(purchase.cashDebtCollectedAmount) || 0;
  const cardCollected = split.cardCollectedAmount;
  const priorProcessor = split.isSplit ? roundMoney(priorRefunded - priorCash) : priorRefunded;
  const debtShare = (processorTotal: number) =>
    cardCollected > 0 ? roundMoney(collectedDebt * Math.min(1, Math.max(0, processorTotal) / cardCollected)) : 0;
  const debtToReaccrue =
    collectedDebt > 0 ? Math.max(0, roundMoney(debtShare(priorProcessor + split.processorRefundAmount) - debtShare(priorProcessor))) : 0;

  // Cash-purchase fee reversal (inert today, no Square cash path): proportional and cumulative too.
  const feeAmount = Number(purchase.platformFeeAmount) || 0;
  const feeShare = (total: number) => (purchase.amount > 0 ? roundMoney(feeAmount * Math.min(1, Math.max(0, total) / purchase.amount)) : 0);
  const cashFeeToReverse = isCashPurchase && feeAmount > 0 ? Math.max(0, roundMoney(feeShare(newTotal) - feeShare(priorRefunded))) : 0;

  return prisma.$transaction(async (tx) => {
    const flipped = await tx.purchase.updateMany({
      where: { id: purchase.id, status: 'REFUNDING' },
      data: {
        status: isFullRefund ? 'REFUNDED' : 'PAID',
        // Cumulative: this refund on top of everything refunded before it.
        refundedAmount: newTotal,
        refundedAt: new Date(),
        refundInitiatedBy: initiatedBy,
        // Split tender (2026-09-29): cumulative dollars the organizer must hand back in cash. Only written
        // when THIS refund has one, so a non-split refund's row (and its column set) is unchanged.
        ...(split.cashPortionToRefundByHand > 0 ? { refundCashPortion: roundMoney(priorCash + split.cashPortionToRefundByHand) } : {}),
      },
    });
    if (flipped.count !== 1) {
      return { alreadyFinalized: true, isFullRefund, totalRefundedAmount: newTotal };
    }

    if (isFullRefund && purchase.itemId) {
      await tx.itemReservation.updateMany({
        where: { itemId: purchase.itemId, status: { notIn: ['CANCELLED', 'EXPIRED', 'COMPLETED'] } },
        data: { status: 'CANCELLED' },
      });
      await tx.item.updateMany({
        where: { id: purchase.itemId, stockSold: { gt: 0 } },
        data: { stockSold: { decrement: 1 } },
      });
      // Put the unit back on sale (callers also restore status; this makes a reconcile-finished refund
      // complete on its own). Only ever SOLD -> AVAILABLE, never walks a later transition backwards.
      await tx.item.updateMany({ where: { id: purchase.itemId, status: 'SOLD' }, data: { status: 'AVAILABLE' } });
    }

    if (cashFeeToReverse > 0 && organizerId) {
      const decremented = await tx.organizer.updateMany({
        where: { id: organizerId, cashFeeBalance: { gte: cashFeeToReverse } },
        data: { cashFeeBalance: { decrement: cashFeeToReverse }, cashFeeBalanceUpdatedAt: new Date() },
      });
      if (decremented.count === 0) {
        await tx.organizer.updateMany({
          where: { id: organizerId },
          data: { cashFeeBalance: 0, cashFeeBalanceUpdatedAt: new Date() },
        });
      }
    }

    if (debtToReaccrue > 0 && organizerId) {
      await tx.organizer.update({
        where: { id: organizerId },
        data: {
          cashFeeBalance: { increment: debtToReaccrue },
          cashFeeBalanceUpdatedAt: new Date(),
        },
      });
    }

    return { alreadyFinalized: false, isFullRefund, totalRefundedAmount: newTotal };
  });
}

/**
 * Non-transactional follow-ups after a refund is finalized. Each is non-fatal and independently
 * healable, exactly as before: the refund itself already succeeded.
 */
async function runPostRefundBookkeeping(args: {
  purchase: FinalizablePurchase;
  split: SplitRefundResolution;
  organizerId?: string;
}): Promise<void> {
  const { purchase, split, organizerId } = args;
  const purchaseId = purchase.id;

  // Split tender (2026-09-29): reverse the CASH leg's commission on the cash value handed back
  // (industry standard: the platform keeps no fee on refunded value; the card leg's fee already
  // comes back through Square's proportional app_fee_money refund). Idempotent per refund via the
  // CashFeeAccrual ledger, clamped at a zero balance, see cashFeeRefundReversalService.ts. The
  // refundSequenceKey (cents refunded before this refund) keeps a SECOND partial refund's reversal from
  // being skipped as a duplicate of the first.
  if (split.isSplit && split.cashPortionToRefundByHand > 0 && organizerId) {
    try {
      const priorCents = Math.round((Number(purchase.refundedAmount) || 0) * 100);
      const reversal = await reverseSplitCashCommissionForRefund({
        organizerId,
        purchase: { id: purchase.id, squarePaymentId: purchase.squarePaymentId },
        cashPortionRefundedCents: Math.round(split.cashPortionToRefundByHand * 100),
        ...(priorCents > 0 ? { refundSequenceKey: priorCents } : {}),
      });
      if (reversal.shortfallCents > 0) {
        console.warn(`[executeVerifiedSquareRefund] Cash-leg commission reversal for purchase ${purchaseId} exceeded the organizer's remaining cashFeeBalance by ${reversal.shortfallCents} cents (already paid down); balance clamped at 0, manual credit may be owed.`);
        Sentry.captureMessage('Split refund: cash-leg commission reversal exceeded cashFeeBalance (clamped at 0)', {
          level: 'warning',
          tags: { area: 'split-refund-cash-commission-reversal' },
          extra: { purchaseId, organizerId, reversal },
        });
      }
    } catch (err) {
      console.error(`[executeVerifiedSquareRefund] Failed to reverse split cash-leg commission for organizer ${organizerId} after refund of purchase ${purchaseId} (non-fatal):`, err);
      try {
        Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
          tags: { area: 'split-refund-cash-commission-reversal' },
          extra: { purchaseId, organizerId, cashPortionToRefundByHand: split.cashPortionToRefundByHand },
        });
      } catch {
        // Sentry may not be initialized -- silently continue
      }
    }
  }

  // No-op for every Square purchase today (isBoothCartPurchase is guarded out above) -- kept
  // for structural parity with executeVerifiedRefund and forward-compatibility once/if a
  // Square-side vendor-booth path ever ships.
  notifyVendorBoothSaleRefunded(purchaseId).catch((err) =>
    console.error(`[executeVerifiedSquareRefund] Vendor refund notification failed for purchase ${purchaseId} (non-fatal):`, err)
  );
}

/**
 * executeVerifiedSquareRefund -- the Square-side choke point every Square refund caller routes
 * through, mirroring refundService.ts's executeVerifiedRefund shape/contract exactly (same
 * parameter order, same return shape, same RefundError class, same TOCTOU claim idiom) so the
 * three call sites (stripeController.ts createRefund, disputeController.ts
 * updateDisputeStatus, adminController.ts bulkRefundPurchases) can add one small
 * `purchase.processor === 'SQUARE'` branch each rather than a parallel code path.
 *
 * Does NOT do auth/ownership/role checks (same contract as the Stripe version -- callers own
 * that). Does NOT send the buyer confirmation email or the in-app "refund issued" notification
 * -- those are also caller-side in the Stripe version (sendRefundConfirmationEmail is called
 * by createRefund/updateDisputeStatus AFTER executeVerifiedRefund returns, not from inside
 * it) and are already fully processor-agnostic, so the existing call sites work unchanged for
 * a Square-routed refund once the "one added branch" lands.
 */
export async function executeVerifiedSquareRefund(
  purchaseId: string,
  refundAmount: number,
  initiatedBy: 'organizer' | 'admin' | 'dispute',
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
): Promise<{
  /** Dollars refunded by THIS call (not the cumulative total; see totalRefundedAmount). */
  refundedAmount: number;
  /**
   * Partial refunds (2026-09-29): cumulative dollars refunded on this purchase including this call, and
   * the balance still refundable. A purchase is only marked REFUNDED (and its item put back on sale)
   * when the cumulative total reaches the purchase amount; until then it stays PAID.
   */
  totalRefundedAmount: number;
  remainingRefundable: number;
  isFullRefund: boolean;
  /**
   * Split tender (2026-09-29): dollars of this refund the organizer must hand back in CASH because
   * that part of the sale never went through Square (0 for every non-split purchase and for any
   * refund that fits inside the card leg). Callers relay `message` to the organizer.
   */
  cashPortionToRefundByHand: number;
  /** Organizer-facing sentence about the cash hand-back, or null when nothing is owed by hand. */
  message: string | null;
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
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      user: { select: { id: true, email: true, name: true } },
      sale: {
        include: {
          organizer: { select: { id: true, userId: true, businessName: true, squareMerchantId: true } },
        },
      },
      // vendorBoothId added (2026-09-07, vendor-booth-cart-checkout dispatch) -- needed to
      // resolve which VendorBooth's own Square account a booth-cart refund runs against (see
      // the isBoothCartPurchase branch below). title was the only field selected before this.
      item: { select: { title: true, vendorBoothId: true } },
    },
  });

  if (!purchase) {
    throw new RefundError('Purchase not found', 404);
  }

  if (purchase.processor !== 'SQUARE') {
    // Defensive -- callers are expected to branch on purchase.processor BEFORE calling this
    // function (see the "one added branch" changes at each call site). A mismatch here means
    // a caller's own branch logic is wrong, not a real refund-eligibility failure -- surfaced
    // as a clear 500 rather than silently attempting a Square API call against a Stripe
    // payment id.
    throw new RefundError('executeVerifiedSquareRefund called for a non-SQUARE purchase', 500, { processor: purchase.processor });
  }

  if (purchase.status !== 'PAID') {
    throw new RefundError('Only paid purchases can be refunded', 400);
  }

  // RESOLVED (2026-09-07, vendor-booth-cart-checkout dispatch) -- the 501 guard that used to
  // live here is GONE. BoothCartLeg now has real Square schema (Wave 0.5:
  // processor/squarePaymentId, migration 20260907020000_...), and this dispatch researched
  // the open Transfer-reversal question directly (see squareVendorBoothCartService.ts's
  // file-header comment, "hub-owner-share live Transfer equivalent" section): Square has NO
  // platform-initiated Transfer-between-connected-merchants primitive at all, so there was
  // NEVER a live Transfer for a Square booth-cart leg's hub-owner share to reverse in the
  // first place -- the question isn't "unresearched," it's answered "not applicable." The
  // PRIMARY refund (reversing the shopper's charge on the booth's own connected Square
  // account) proceeds normally below via the booth's own OAuth token, mirroring
  // refundService.ts's isBoothCartPurchase branch's Stripe-side { stripeAccount } scoping.
  // The hub-owner-share reversal step itself is explicitly SKIPPED with a clear log a few
  // lines below (search "hub-owner-share reversal is a deliberate no-op") -- not silently
  // dropped, not guessed at.
  const isBoothCartPurchase = !!purchase.boothCartTransactionId;

  // Same cash-purchase discriminator convention as refundService.ts's isCashPurchase, applied
  // to squarePaymentId instead of stripePaymentIntentId -- forward-compatible with a future
  // Square-side cash/phone-POS path (Wave 1 #3) that may reuse the same `cash_<uuid>`
  // sentinel convention. No such path exists yet, so this branch is inert today.
  const isCashPurchase = !purchase.squarePaymentId || purchase.squarePaymentId.startsWith('cash_');

  const purchaseAgeMs = Date.now() - purchase.createdAt.getTime();
  const purchaseAgeDays = purchaseAgeMs / (1000 * 60 * 60 * 24);
  if (purchaseAgeDays > 30) {
    throw new RefundError(
      'Refunds can only be issued within 30 days of purchase',
      400,
      { purchaseAgeDays: Math.floor(purchaseAgeDays) }
    );
  }
  // Square's own hard limit is 1 year (developer.squareup.com/docs/payments-api/refund-payments)
  // -- FindA.Sale's 30-day policy above is always the binding constraint, so no separate check
  // is needed for Square's limit; noted here so a future policy change doesn't silently exceed it.

  // PARTIAL REFUNDS (2026-09-29, money review P1-14): the cap is the REMAINING balance, not the
  // original amount, because a partial refund now leaves the purchase PAID with refundedAmount tracked
  // (see finalizeSquareRefundTx) and a second partial refund is allowed up to what is left. Integer
  // cents so float dust can never reject or over-allow a refund by a hair.
  const purchaseAmountCents = Math.round(purchase.amount * 100);
  const priorRefundedAmount = roundMoney(Number(purchase.refundedAmount) || 0);
  const priorRefundedCents = Math.round(priorRefundedAmount * 100);
  const remainingRefundableCents = Math.max(0, purchaseAmountCents - priorRefundedCents);
  const requestedCents = Math.round(refundAmount * 100);
  if (!(refundAmount > 0) || requestedCents <= 0 || requestedCents > remainingRefundableCents) {
    throw new RefundError(
      priorRefundedCents > 0
        ? 'Refund amount must be greater than zero and cannot exceed the remaining refundable amount on this purchase'
        : 'Refund amount must be greater than zero and cannot exceed the original purchase amount',
      400,
      {
        requestedAmount: refundAmount,
        purchaseAmount: purchase.amount,
        alreadyRefunded: priorRefundedAmount,
        remainingRefundable: roundMoney(remainingRefundableCents / 100),
      }
    );
  }

  // SPLIT TENDER (2026-09-29): Square only ever captured `amount - cashLegAmount` for a
  // cash + card split row, so asking it to refund more than that fails at Square (and, worse, a
  // partially-refunded state could result). resolveSplitRefund caps the processor refund at the
  // card leg (card-first) and reports the rest as cash the organizer hands back. A non-split
  // purchase (no cashLegAmount) passes straight through: same amount, no message. The prior refunds
  // are passed so a second partial refund only counts the card value not already returned.
  const split = resolveSplitRefund(purchase, refundAmount, {
    refundedAmount: purchase.refundedAmount,
    refundCashPortion: purchase.refundCashPortion,
  });
  const squareRefundAmount = split.isSplit ? split.processorRefundAmount : refundAmount;

  // TOCTOU claim -- identical idiom to refundService.ts's PAID->REFUNDING compare-and-swap. Also
  // pinned to the refundedAmount this call read (money review P1-14): with partial refunds a purchase
  // returns to PAID between refunds, so without this a refund that completed after our read would
  // slip past the status check and this call would compute its cumulative total from a stale prior.
  const claim = await prisma.purchase.updateMany({
    where: { id: purchaseId, status: 'PAID', refundedAmount: purchase.refundedAmount ?? null },
    data: { status: 'REFUNDING' },
  });
  if (claim.count !== 1) {
    throw new RefundError('Refund already in progress or not refundable', 400);
  }

  const organizerId = purchase.sale?.organizer?.id;
  let squareRefundId: string | null = null;

  if (!isCashPurchase) {
    if (!purchase.squarePaymentId) {
      await prisma.purchase.updateMany({ where: { id: purchaseId, status: 'REFUNDING' }, data: { status: 'PAID' } });
      throw new RefundError('This Square purchase has no squarePaymentId on file. Cannot resolve which payment to refund.', 400);
    }
    // Vendor-booth-cart purchases refund against the BOOTH's OWN connected Square account
    // (the booth is the merchant of record for its own leg, exactly as it already is on the
    // Stripe side -- see refundService.ts's isBoothCartPurchase branch for the precedent this
    // mirrors). Every other Square purchase refunds against the ORGANIZER's own account,
    // unchanged from before this dispatch.
    let accessToken: string;
    if (isBoothCartPurchase) {
      const vendorBoothId = purchase.item?.vendorBoothId;
      if (!vendorBoothId) {
        await prisma.purchase.updateMany({ where: { id: purchaseId, status: 'REFUNDING' }, data: { status: 'PAID' } });
        throw new RefundError("Could not resolve this booth-cart purchase's vendor booth. Cannot resolve which Square account to refund against.", 400);
      }
      const booth = await prisma.vendorBooth.findUnique({
        where: { id: vendorBoothId },
        select: { id: true, userId: true, squareAccountId: true, squareOnboarded: true },
      });
      if (!booth) {
        await prisma.purchase.updateMany({ where: { id: purchaseId, status: 'REFUNDING' }, data: { status: 'PAID' } });
        throw new RefundError('The vendor booth for this purchase could not be found.', 404);
      }
      try {
        accessToken = await resolveVendorBoothSquareAccessToken(booth);
      } catch (err) {
        await prisma.purchase.updateMany({ where: { id: purchaseId, status: 'REFUNDING' }, data: { status: 'PAID' } });
        if (err instanceof SquareBoothOnboardingIncompleteError) {
          throw new RefundError(
            `Square refunds aren't available for this booth yet (vendorBoothId=${vendorBoothId}) -- ` +
              'Square onboarding is incomplete or the stored OAuth token is missing/expired with no ' +
              'usable refresh token on file.',
            501,
            { vendorBoothId }
          );
        }
        throw err;
      }
    } else {
      if (!organizerId) {
        await prisma.purchase.updateMany({ where: { id: purchaseId, status: 'REFUNDING' }, data: { status: 'PAID' } });
        throw new RefundError('Could not resolve the organizer for this Square purchase. Cannot resolve which Square account to refund against.', 400);
      }
      accessToken = await resolveSquareAccessToken(organizerId);
    }

    try {
      const client = getSquareClientForToken(accessToken);
      const refundReasonText = reason ? mapReasonToSquareText(reason) : undefined;

      // CONFIRMED 2026-09-07 (CI type error, this session): fetched refunds/client/Client.ts
      // directly from the Square Node SDK source (github.com/square/square-nodejs-sdk) -- the
      // real method is `refundPayment`, not `create`. Same request shape already used below.
      // Split tender (2026-09-29): skip the Square call entirely when the card leg has nothing to
      // refund (the whole refund is cash to hand back). Never ask Square for more than it captured.
      if (squareRefundAmount > 0) {
        const squareRefundCents = Math.round(squareRefundAmount * 100);
        // The reason carries the reconcile tag (see buildSquareRefundTag) so a refund Square accepted
        // but whose finalize failed can be matched back to this purchase by reconcileStuckSquareRefunds.
        const tag = buildSquareRefundTag(purchase.id, priorRefundedCents, requestedCents, initiatedBy);
        const reasonText = `${refundReasonText ? `${refundReasonText} ` : ''}${tag}`.slice(0, 192);
        const refundResponse: any = await client.refunds.refundPayment({
          idempotencyKey: buildSquareRefundIdempotencyKey(purchase.id, priorRefundedCents),
          paymentId: purchase.squarePaymentId,
          amountMoney: {
            amount: BigInt(squareRefundCents),
            currency: 'USD',
          },
          reason: reasonText,
          // No app_fee_money set deliberately -- omitting it is what makes Square refund the
          // application fee PROPORTIONALLY by default (see file header comment). Only ever set
          // this if a future caller needs to override that default, which no caller does today.
        });
        squareRefundId = refundResponse?.refund?.id ?? null;
        const squareRefundStatus: string | undefined = refundResponse?.refund?.status ?? undefined;
        if (squareRefundStatus === 'REJECTED' || squareRefundStatus === 'FAILED') {
          throw new RefundError(`Square did not process this refund (status ${squareRefundStatus}).`, 502, { squareRefundId });
        }
      }

      // Hub-owner-share reversal is a DELIBERATE NO-OP for a Square booth-cart refund -- see
      // this function's own comment above (RESOLVED 2026-09-07): Square has no
      // Transfer-between-merchants primitive, so no live Transfer was ever made for a Square
      // leg's hub-owner share (transferHubOwnerShareForLeg no-ops for SQUARE legs in
      // vendorBoothCartController.ts). There is therefore nothing here to reverse, unlike
      // refundService.ts's settleHubOwnerReversalForLeg call. The hub owner's
      // originally-computed share (BoothCartLeg.hubOwnerShareAmount) remains whatever it was
      // before this refund -- a future settlement-sweep mechanism (not built this dispatch,
      // see squareVendorBoothCartService.ts's file header) is the intended place to reconcile
      // a refunded Square leg's accrued-but-unsettled hub-owner share, not this function.
      if (isBoothCartPurchase) {
        console.log(
          `[squareRefundService] Square booth-cart refund for purchase ${purchase.id}: hub-owner-share ` +
            'reversal is a deliberate no-op (Square has no Transfer to reverse -- see file comment).'
        );
      }
    } catch (squareErr) {
      await prisma.purchase.updateMany({
        where: { id: purchaseId, status: 'REFUNDING' },
        data: { status: 'PAID' },
      });
      throw squareErr;
    }
  }

  // Finalize (money review P1-15). Square has ACCEPTED the refund by this point, so a failed finalize
  // must never be dropped or left to stick silently: retry it (transient DB blips are the common
  // cause; the transaction is idempotent, a second run that finds the row finalized writes nothing),
  // and if it still fails leave the purchase in REFUNDING as the reconcilable marker, alert Sentry
  // with every id needed, and tell the caller NOT to retry the refund. reconcileStuckSquareRefunds
  // finishes such rows from the Square refund.
  let outcome: FinalizeOutcome | null = null;
  let finalizeErr: unknown = null;
  for (let attempt = 1; attempt <= 3 && !outcome; attempt++) {
    try {
      outcome = await finalizeSquareRefundTx({ purchase, refundAmount, split, initiatedBy, isCashPurchase, organizerId });
    } catch (err) {
      finalizeErr = err;
      if (attempt < 3) await sleep(150 * attempt);
    }
  }
  if (!outcome) {
    console.error(`[executeVerifiedSquareRefund] Square accepted the refund but finalizing purchase ${purchaseId} failed after retries (left REFUNDING for reconcile):`, finalizeErr);
    try {
      Sentry.captureException(finalizeErr instanceof Error ? finalizeErr : new Error(String(finalizeErr)), {
        level: 'error',
        tags: { area: 'square-refund-finalize-stuck' },
        extra: {
          purchaseId,
          squarePaymentId: purchase.squarePaymentId,
          squareRefundId,
          refundAmount,
          priorRefundedAmount,
          initiatedBy,
          note: 'Square accepted the refund; purchase left REFUNDING. Run reconcileStuckSquareRefunds (squareRefundService) to finish it.',
        },
      });
    } catch {
      // Sentry may not be initialized -- silently continue
    }
    throw new RefundError(
      'The refund was sent to the card processor but we could not finish recording it. Do not issue it again. It will be completed automatically; contact support if this purchase still shows as refunding after a while.',
      500,
      { code: 'REFUND_FINALIZE_PENDING', purchaseId, squareRefundId }
    );
  }

  if (!outcome.alreadyFinalized) {
    await runPostRefundBookkeeping({ purchase, split, organizerId });
  }

  return {
    refundedAmount: refundAmount,
    totalRefundedAmount: outcome.totalRefundedAmount,
    remainingRefundable: Math.max(0, roundMoney(purchase.amount - outcome.totalRefundedAmount)),
    isFullRefund: outcome.isFullRefund,
    cashPortionToRefundByHand: split.cashPortionToRefundByHand,
    message: split.message,
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

// =========================================================================================
// Reconciliation sweeps (2026-09-29, money review P1-10 / P1-15). Nothing here is scheduled by this
// file: they are exported so an existing cron (posStrandedSaleReconcileCron is the natural home) or an
// admin action can call them. Both are idempotent and safe to run repeatedly.
// =========================================================================================

export interface StuckRefundReconcileSummary {
  checked: number;
  finalized: number;
  revertedToPaid: number;
  stillPending: number;
  skipped: number;
  errors: number;
}

/**
 * Finish Square refunds that got stuck in REFUNDING (money review P1-15). A purchase is left REFUNDING
 * when the process died between the PAID->REFUNDING claim and the finalize, or when Square accepted
 * the refund but the finalize write kept failing. For each purchase stuck longer than
 * `olderThanMinutes` this asks Square what actually happened, using the refund tag that
 * executeVerifiedSquareRefund puts in the refund's reason (see buildSquareRefundTag):
 *   - a COMPLETED refund carrying this purchase's tag: the money moved, so run the same finalize
 *     (status from the cumulative amounts, stock, debt) it would have run;
 *   - a PENDING one: leave it for the next sweep (Square has not settled it yet);
 *   - a REJECTED / FAILED one, or no tagged refund at all: no money moved, so put the purchase back to
 *     PAID so it can be refunded again (the deterministic idempotency key makes a re-issue safe).
 * Never guesses: if Square cannot be queried the row is left untouched and counted as an error.
 */
export async function reconcileStuckSquareRefunds(
  opts: { olderThanMinutes?: number; limit?: number } = {}
): Promise<StuckRefundReconcileSummary> {
  const olderThanMinutes = Math.max(1, opts.olderThanMinutes ?? 30);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  const summary: StuckRefundReconcileSummary = { checked: 0, finalized: 0, revertedToPaid: 0, stillPending: 0, skipped: 0, errors: 0 };

  const stuck = await prisma.purchase.findMany({
    where: { status: 'REFUNDING', processor: 'SQUARE', updatedAt: { lt: cutoff } },
    orderBy: { updatedAt: 'asc' },
    take: limit,
    include: {
      sale: { include: { organizer: { select: { id: true, userId: true, businessName: true, squareMerchantId: true } } } },
      item: { select: { title: true, vendorBoothId: true } },
    },
  });

  for (const purchase of stuck) {
    summary.checked += 1;
    try {
      const isCashPurchase = !purchase.squarePaymentId || purchase.squarePaymentId.startsWith('cash_');
      const organizerId = purchase.sale?.organizer?.id;
      if (isCashPurchase || !purchase.squarePaymentId) {
        // No Square refund exists to look up, and the amount of the interrupted refund is not recorded
        // anywhere else: needs a human. Loud, not silent.
        summary.skipped += 1;
        Sentry.captureMessage('Square refund reconcile: REFUNDING purchase has no Square payment to verify against', {
          level: 'warning',
          tags: { area: 'square-refund-reconcile' },
          extra: { purchaseId: purchase.id },
        });
        continue;
      }

      let accessToken: string;
      if (purchase.boothCartTransactionId) {
        const vendorBoothId = purchase.item?.vendorBoothId;
        const booth = vendorBoothId
          ? await prisma.vendorBooth.findUnique({
              where: { id: vendorBoothId },
              select: { id: true, userId: true, squareAccountId: true, squareOnboarded: true },
            })
          : null;
        if (!booth) {
          summary.skipped += 1;
          continue;
        }
        accessToken = await resolveVendorBoothSquareAccessToken(booth);
      } else {
        if (!organizerId) {
          summary.skipped += 1;
          continue;
        }
        accessToken = await resolveSquareAccessToken(organizerId);
      }

      const client = getSquareClientForToken(accessToken);
      const paymentResponse: any = await client.payments.get({ paymentId: purchase.squarePaymentId });
      const refundIds: string[] = paymentResponse?.payment?.refundIds ?? [];
      const priorCents = Math.round((Number(purchase.refundedAmount) || 0) * 100);

      let match: { refundId: string; status: string; tag: NonNullable<ReturnType<typeof parseSquareRefundTag>> } | null = null;
      for (const refundId of refundIds) {
        const refundResponse: any = await client.refunds.get({ refundId });
        const refund = refundResponse?.refund;
        const tag = parseSquareRefundTag(refund?.reason);
        // priorCents must equal what this row had refunded when the stuck refund started: that is what
        // tells THIS refund apart from an earlier, already-finalized partial refund of the same purchase.
        if (tag && tag.purchaseId === purchase.id && tag.priorCents === priorCents) {
          match = { refundId, status: String(refund?.status ?? ''), tag };
          break;
        }
      }

      if (match && match.status === 'COMPLETED') {
        const refundAmount = roundMoney(match.tag.amountCents / 100);
        const split = resolveSplitRefund(purchase, refundAmount, {
          refundedAmount: purchase.refundedAmount,
          refundCashPortion: purchase.refundCashPortion,
        });
        const outcome = await finalizeSquareRefundTx({
          purchase,
          refundAmount,
          split,
          initiatedBy: match.tag.initiatedBy,
          isCashPurchase: false,
          organizerId,
        });
        if (!outcome.alreadyFinalized) {
          await runPostRefundBookkeeping({ purchase, split, organizerId });
          summary.finalized += 1;
          Sentry.captureMessage('Square refund reconcile: finished a stuck refund from Square', {
            level: 'info',
            tags: { area: 'square-refund-reconcile' },
            extra: { purchaseId: purchase.id, squareRefundId: match.refundId, refundAmount },
          });
        }
      } else if (match && match.status === 'PENDING') {
        summary.stillPending += 1;
      } else {
        // No tagged refund, or Square rejected it: no money moved. Restore PAID (only if still stuck).
        const restored = await prisma.purchase.updateMany({ where: { id: purchase.id, status: 'REFUNDING' }, data: { status: 'PAID' } });
        if (restored.count === 1) {
          summary.revertedToPaid += 1;
          Sentry.captureMessage('Square refund reconcile: no completed refund at Square, purchase restored to PAID', {
            level: 'info',
            tags: { area: 'square-refund-reconcile' },
            extra: { purchaseId: purchase.id, squarePaymentId: purchase.squarePaymentId, squareRefundStatus: match?.status ?? null },
          });
        }
      }
    } catch (err) {
      summary.errors += 1;
      console.error(`[reconcileStuckSquareRefunds] purchase ${purchase.id} could not be reconciled:`, err);
      try {
        Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
          tags: { area: 'square-refund-reconcile' },
          extra: { purchaseId: purchase.id },
        });
      } catch {
        // Sentry may not be initialized -- silently continue
      }
    }
  }
  return summary;
}

export interface PosFulfillmentRefundResult {
  status: 'REFUNDED' | 'REFUND_PENDING' | 'NOT_APPLICABLE';
  squareRefundId?: string | null;
}

/**
 * Refund the card leg of a POS payment request whose fulfillment failed AFTER the card was captured
 * (an item was sold out or gone by the time the shopper's payment landed; money review P1-10). The
 * request must already be in FULFILLMENT_FAILED (confirmPaymentRequest puts it there); this refunds the
 * captured card amount by Square payment id (there is no Purchase row to refund: nothing was recorded)
 * and then moves the request to REFUNDED.
 *
 * Retryable and replay-safe: the Square idempotency key is derived from the request id, so calling it
 * again (the shopper taps Pay again, the sweep below, an admin) returns the same refund instead of
 * issuing a second one. Square refunds the platform app fee proportionally on its own. Never throws:
 * a failure is alerted and reported as REFUND_PENDING, leaving the request FULFILLMENT_FAILED so the
 * next attempt resumes it.
 */
export async function refundFailedPosFulfillment(requestId: string): Promise<PosFulfillmentRefundResult> {
  const request = await prisma.pOSPaymentRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      processor: true,
      organizerId: true,
      squarePaymentId: true,
      cardAmountCents: true,
      totalAmountCents: true,
    },
  });
  if (!request) return { status: 'NOT_APPLICABLE' };
  if (request.status === 'REFUNDED') return { status: 'REFUNDED' };
  if (request.status !== 'FULFILLMENT_FAILED') return { status: 'NOT_APPLICABLE' };

  const alertPending = (why: string, err?: unknown) => {
    console.error(`[refundFailedPosFulfillment] request ${requestId}: ${why}`, err ?? '');
    try {
      Sentry.captureException(err instanceof Error ? err : new Error(`${why} (request ${requestId})`), {
        level: 'error',
        tags: { area: 'pos-fulfillment-failed-refund' },
        extra: { requestId, squarePaymentId: request.squarePaymentId, organizerId: request.organizerId },
      });
    } catch {
      // Sentry may not be initialized -- silently continue
    }
  };

  if (request.processor !== 'SQUARE' || !request.squarePaymentId) {
    alertPending('no Square payment id on file to refund; needs a manual refund');
    return { status: 'REFUND_PENDING' };
  }
  const amountCents = request.cardAmountCents ?? request.totalAmountCents;
  if (!(amountCents > 0)) {
    alertPending('nothing to refund (zero card amount)');
    return { status: 'NOT_APPLICABLE' };
  }

  let squareRefundId: string | null = null;
  try {
    const accessToken = await resolveSquareAccessToken(request.organizerId);
    const client = getSquareClientForToken(accessToken);
    const refundResponse: any = await client.refunds.refundPayment({
      idempotencyKey: `pos-fulfil-refund-${request.id}`,
      paymentId: request.squarePaymentId,
      amountMoney: { amount: BigInt(Math.round(amountCents)), currency: 'USD' },
      reason: 'Item no longer available',
    });
    squareRefundId = refundResponse?.refund?.id ?? null;
    const refundStatus: string | undefined = refundResponse?.refund?.status ?? undefined;
    if (refundStatus === 'REJECTED' || refundStatus === 'FAILED') {
      alertPending(`Square did not process the refund (status ${refundStatus})`);
      return { status: 'REFUND_PENDING', squareRefundId };
    }
  } catch (err) {
    alertPending('Square refund call failed; will be retried', err);
    return { status: 'REFUND_PENDING' };
  }

  try {
    await prisma.pOSPaymentRequest.updateMany({
      where: { id: request.id, status: 'FULFILLMENT_FAILED' },
      data: { status: 'REFUNDED' },
    });
  } catch (err) {
    // The refund itself succeeded and is idempotent: the next attempt re-sends the same key (Square
    // returns the same refund) and retries this status write.
    alertPending('refund sent but the request could not be marked REFUNDED', err);
    return { status: 'REFUND_PENDING', squareRefundId };
  }
  return { status: 'REFUNDED', squareRefundId };
}

/**
 * Sweep for POS requests left FULFILLMENT_FAILED (their auto-refund did not complete in the request
 * that failed them). Idempotent; call from an existing cron. Returns how many were refunded.
 */
export async function reconcilePosFulfillmentFailures(
  opts: { olderThanMinutes?: number; limit?: number } = {}
): Promise<{ checked: number; refunded: number; pending: number }> {
  const olderThanMinutes = Math.max(0, opts.olderThanMinutes ?? 2);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  const rows = await prisma.pOSPaymentRequest.findMany({
    where: { status: 'FULFILLMENT_FAILED', updatedAt: { lt: cutoff } },
    orderBy: { updatedAt: 'asc' },
    take: limit,
    select: { id: true },
  });
  let refunded = 0;
  let pending = 0;
  for (const row of rows) {
    const result = await refundFailedPosFulfillment(row.id);
    if (result.status === 'REFUNDED') refunded += 1;
    else pending += 1;
  }
  return { checked: rows.length, refunded, pending };
}

// =========================================================================================
// Square dispute (card-network chargeback) handling -- handleSquareDisputeWebhook
// =========================================================================================

/**
 * Minimal local type for the Square dispute webhook payload shape. NOT imported from the
 * `square` package's own generated types -- this file was written without a working local
 * TypeScript check (see handoff item 7), and guessing at an exact exported type name
 * (`Square.Dispute` vs `Square.WebhookEvent` vs something else) risked a wrong import that
 * fails to compile instead of a loosely-typed object that is at worst under-strict. The field
 * names below ARE confirmed against Square's real webhook payload example
 * (developer.squareup.com/docs/disputes-api/process-disputes, "Webhook notifications"
 * section, fetched live 2026-09-07) -- not guessed.
 */
export interface SquareDisputeWebhookEvent {
  merchant_id: string;
  type: 'dispute.created' | 'dispute.state.updated' | string;
  event_id: string;
  created_at: string;
  data: {
    type: 'dispute';
    id: string;
    object: {
      dispute: {
        id: string;
        amount_money?: { amount: number; currency: string };
        reason?: string;
        // Confirmed states from Square's own docs (process-disputes page, "Dispute outcomes"
        // + webhook table): EVIDENCE_REQUIRED, PROCESSING, WON, LOST, ACCEPTED. Left as a
        // plain string union with a string fallback rather than a closed enum -- Square's own
        // reference lists these as the documented set but does not formally close the type.
        state: 'EVIDENCE_REQUIRED' | 'PROCESSING' | 'WON' | 'LOST' | 'ACCEPTED' | string;
        disputed_payment?: { payment_id?: string };
        due_at?: string;
        card_brand?: string;
        location_id?: string;
      };
    };
  };
}

/**
 * handleSquareDisputeWebhook -- Square-side mirror of stripeController.ts's
 * charge.dispute.created + charge.dispute.closed(lost) handling, built as a standalone
 * function (not wired into any route here) for the Webhooks dispatch (Wave 1 #5,
 * routes/square.ts + squareWebhookController.ts) to call from its own event switch, the same
 * way it will call other per-event-type handlers. This function does NOT do webhook signature
 * verification, NOT do ProcessedWebhookEvent idempotency dedup, and NOT parse the raw request
 * body -- all three are the Webhooks dispatch's own scope (WebhooksHelper.verifySignature +
 * the `square:${event_id}` ProcessedWebhookEvent namespace, per the architecture doc). This
 * function receives the already-verified, already-deduped, already-parsed event object.
 *
 * CONFIRMED exact Square dispute event names (live web fetch, 2026-09-07,
 * developer.squareup.com/docs/disputes-api/process-disputes "Webhook notifications" section
 * AND developer.squareup.com/reference/square/disputes-api/webhooks): `dispute.created` and
 * `dispute.state.updated`. The scoping doc's guess ("dispute.created -> dispute.state.updated")
 * was correct -- there is no third/different event name; `dispute.evidence.created` and
 * `dispute.evidence.deleted` also exist but are out of scope here (evidence submission is not
 * part of this dispatch).
 *
 * KEPT SEPARATE FROM FindA.Sale's OWN in-house `Dispute` model (disputeController.ts) -- same
 * boundary the Stripe side already maintains (see disputeController.ts's own file comment: the
 * in-house Dispute model is a buyer-filed support ticket keyed on a free-text `orderId`, with
 * zero Prisma relation to Purchase; a real card-network dispute here is tracked entirely via
 * `Purchase.status` ('DISPUTED' / 'DISPUTE_LOST'), mirroring exactly how stripeController.ts's
 * charge.dispute.* handlers never touch the in-house Dispute table either). This function
 * never reads or writes `prisma.dispute` for that reason.
 */
export async function handleSquareDisputeWebhook(event: SquareDisputeWebhookEvent): Promise<void> {
  const dispute = event.data?.object?.dispute;
  if (!dispute) {
    console.error('[squareRefundService] handleSquareDisputeWebhook received an event with no dispute object', { eventType: event.type, eventId: event.event_id });
    return;
  }

  const paymentId = dispute.disputed_payment?.payment_id;
  if (!paymentId) {
    console.warn(`[squareRefundService] Square dispute ${dispute.id} has no disputed_payment.payment_id -- cannot resolve a Purchase, skipping.`);
    return;
  }

  const purchase = await prisma.purchase.findFirst({
    where: { squarePaymentId: paymentId },
    include: {
      item: { include: { sale: { include: { organizer: { select: { userId: true, id: true } } } } } },
      sale: { include: { organizer: { select: { userId: true, id: true } } } },
      user: true,
    },
  });

  const disputeSale = purchase?.sale ?? purchase?.item?.sale;
  if (!purchase || !disputeSale) {
    console.warn(`[squareRefundService] Could not resolve a Purchase for Square dispute ${dispute.id} (payment ${paymentId}) -- event type ${event.type}.`);
    Sentry.captureMessage('Square dispute: could not resolve Purchase for a dispute event', {
      tags: { area: 'square-dispute' },
      extra: { disputeId: dispute.id, paymentId, eventType: event.type },
    });
    return;
  }

  if (event.type === 'dispute.created') {
    try {
      await prisma.purchase.update({ where: { id: purchase.id }, data: { status: 'DISPUTED' } });
      console.log(`[squareRefundService] Purchase marked DISPUTED: purchase_id=${purchase.id}, dispute_id=${dispute.id}`);

      if (purchase.user) {
        await prisma.user.update({ where: { id: purchase.user.id }, data: { chargebackCount: { increment: 1 } } });
        const updatedUser = await prisma.user.findUnique({ where: { id: purchase.user.id }, select: { chargebackCount: true, suspendedAt: true } });
        if (updatedUser && updatedUser.chargebackCount >= 3 && !updatedUser.suspendedAt) {
          await prisma.user.update({ where: { id: purchase.user.id }, data: { suspendedAt: new Date(), suspendReason: 'SERIAL_CHARGEBACKS' } });
          console.warn(`[squareRefundService] Buyer suspended after chargeback #${updatedUser.chargebackCount}: user=${purchase.user.id}`);
        }

        const { clawBackChargebackXp } = await import('./xpService');
        const clawedBackXp = await clawBackChargebackXp(purchase.id, purchase.user.id);
        console.log(`[squareRefundService] Clawed back ${clawedBackXp} XP from user ${purchase.user.id} for chargeback`);
      }

      const { recordChargebackIncident } = await import('./fraudService');
      await recordChargebackIncident(disputeSale!.organizerId, purchase.id, dispute.id);

      const monthYear = new Date().toISOString().slice(0, 7);
      const metrics = await prisma.platformMetrics.upsert({
        where: { monthYear },
        create: { monthYear, chargebackCount: 1, transactionCount: 1 },
        update: { chargebackCount: { increment: 1 } },
      });
      if (metrics.transactionCount > 0 && metrics.chargebackCount / metrics.transactionCount > 0.008) {
        console.error(`[squareRefundService] ALERT: Chargeback rate exceeded 0.8% for ${monthYear}:`, metrics);
      }

      const disputeOrganizerUserId = disputeSale!.organizer?.userId;
      if (disputeOrganizerUserId) {
        createNotification({
          userId: disputeOrganizerUserId,
          type: 'chargeback_opened',
          title: 'Chargeback filed against a sale',
          body: `A buyer's bank has filed a chargeback for "${purchase.item?.title || 'an item'}". This may affect your Square balance -- check your Square Dashboard for details and any response deadline.`,
          link: `/organizer/sales/${disputeSale!.id}`,
          channel: 'OPERATIONAL',
          sendEmail: true,
        }).catch((err) => console.error(`[squareRefundService] Failed to create chargeback_opened notification for purchase ${purchase.id}:`, err));
      } else {
        console.error(`[squareRefundService] Skipped chargeback_opened notification for purchase ${purchase.id} -- organizer.userId did not resolve`);
      }
    } catch (err) {
      console.error(`[squareRefundService] Failed to process dispute.created ${dispute.id}:`, err);
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { area: 'square-dispute' },
        extra: { disputeId: dispute.id, paymentId },
      });
    }
    return;
  }

  if (event.type === 'dispute.state.updated' && dispute.state === 'LOST') {
    try {
      // TOCTOU claim -- same compare-and-swap idiom as executeVerifiedSquareRefund /
      // refundService.ts, guarding against a duplicate/redelivered event applying this twice.
      const claim = await prisma.purchase.updateMany({
        where: { id: purchase.id, status: 'DISPUTED' },
        data: { status: 'DISPUTE_LOST' },
      });
      if (claim.count !== 1) {
        const current = await prisma.purchase.findUnique({ where: { id: purchase.id }, select: { status: true } });
        if (current?.status === 'DISPUTE_LOST') {
          console.log(`[squareRefundService] Purchase ${purchase.id} already DISPUTE_LOST -- skipping duplicate dispute.state.updated(LOST).`);
        } else {
          console.error(`[squareRefundService] dispute.state.updated(LOST) for purchase ${purchase.id} but it was NOT in DISPUTED state (actual: ${current?.status ?? 'not found'}) -- needs manual review.`);
          Sentry.captureMessage('Square dispute LOST but purchase was not in DISPUTED state', {
            tags: { area: 'square-dispute' },
            extra: { disputeId: dispute.id, purchaseId: purchase.id, actualStatus: current?.status ?? null },
          });
        }
        return;
      }

      // NO PLATFORM-SIDE REVERSAL OF THE DISPUTED PRINCIPAL -- by direct analogy to
      // stripeController.ts's own charge.dispute.closed(lost) handling of a Stripe DIRECT
      // charge ("no platform-side reversal needed, liability already on connected account"):
      // every Square payment in this migration lives on the connected merchant's OWN account
      // (see file header comment), so a lost dispute's disputed amount is pulled by
      // Square/the card network directly from THAT account's own balance -- FindA.Sale never
      // held those funds and has nothing to reverse. This is true regardless of the
      // SQUARE_DISPUTE_LIVE_CLAWBACK flag below.
      console.log(`[squareRefundService] Square dispute LOST for purchase ${purchase.id} (dispute ${dispute.id}) -- no platform-side principal reversal needed, liability already on the organizer's own Square account.`);

      if (squareDisputeClawbackEnabled()) {
        // GENUINELY UNRESEARCHED, NOT INVENTED (see handoff item 5): Square's own docs confirm
        // `app_fee_money` is refunded proportionally and automatically on a REFUND
        // (developer.squareup.com/docs/payments-api/collect-fees/payment-with-app-fee-refund)
        // but say nothing about what happens to an already-paid `app_fee_money` cut when the
        // underlying payment is LOST to a dispute instead of refunded -- that could mean
        // FindA.Sale keeps a small windfall on every lost Square dispute with no automatic
        // reconciliation. Rather than guess at an unconfirmed Square API call to claw back the
        // platform's own app_fee_money share, this flag (when on) raises a clear, actionable
        // signal for manual/product review instead of attempting unverified money movement.
        console.error(`[squareRefundService] SQUARE_DISPUTE_LIVE_CLAWBACK is on but the app_fee_money clawback mechanism for a lost Square dispute is UNRESEARCHED -- no automated action taken for purchase ${purchase.id} (dispute ${dispute.id}). Needs manual review: does FindA.Sale's platform fee for this sale need to be manually returned?`);
        Sentry.captureMessage('Square dispute LOST -- app_fee_money clawback mechanism unresearched, manual review needed', {
          tags: { area: 'square-dispute-clawback' },
          extra: { disputeId: dispute.id, purchaseId: purchase.id, amountMoney: dispute.amount_money },
        });
      } else {
        console.log(`[squareRefundService] SQUARE_DISPUTE_LIVE_CLAWBACK is off -- no clawback review flagged for dispute ${dispute.id} (purchase ${purchase.id}).`);
      }
    } catch (err) {
      console.error(`[squareRefundService] Failed to process dispute.state.updated(LOST) ${dispute.id}:`, err);
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { area: 'square-dispute' },
        extra: { disputeId: dispute.id, paymentId },
      });
    }
  }
}
