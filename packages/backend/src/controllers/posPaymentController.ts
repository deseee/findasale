import { Response } from 'express';
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
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService';
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService';
import { syncMarketplaceStock } from '../services/marketplaceStockSyncService'; // ADR-087 Phase 4: revise-on-partial eBay quantity sync
import { resolveOrganizerOrTeamMember } from '../utils/posAuth'; // S1183 Fix 1: TEAM_MEMBER fallback for non-venue POS
import { assertCheckoutAllowed, CheckoutGuardError, recordSuspectedSignal } from '../services/checkoutGuard'; // S1072 Finding #4 gap fix: POS payment-request self-dealing guard; recordSuspectedSignal: manual card entry has no verifiable buyer account either (2026-09-12)
import { snapshotForCommissionOnly, getPlatformFeeRate } from '../utils/feeCalculator'; // Purchase fee snapshot (2026-08-17); getPlatformFeeRate: split-payment commission fix (2026-08-22)
import { resolveCashCommissionRate, cashCommissionOn, accrueCashFeeBalance, applyCashDebtToAppFee, settleCashDebtCollection } from '../services/cashFeeService'; // Split-payment cash-half commission accrual (2026-08-22) -- same mechanism terminalController/reservationController use; applyCashDebtToAppFee/settleCashDebtCollection: manual card entry cash-fee-debt recoupment (2026-09-12)
import { resolvePosDiscount } from '../services/posDiscountService';
import { isPayoutFlaggedForReview } from '../services/connectAccountGuard'; // S1198 (2026-09-06): bank-fingerprint collusion hold, Organizer POS wiring
import * as stripePos from '../services/stripePosPaymentAdapter'; // Square migration Wave 1 #3 (2026-09-07): Stripe POS logic extracted verbatim, zero behavior change
import * as squarePos from '../services/squarePosPaymentAdapter'; // Square migration Wave 1 #3 (2026-09-07): phone-based Square POS adapter -- charge creation moved to accept/confirm time, see file header


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
    };
    const processor: 'SQUARE' = 'SQUARE';
    void _requestedProcessor;

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
    if (typeof totalAmountCents !== 'number' || totalAmountCents <= 0) {
      return res.status(400).json({ message: 'totalAmountCents must be > 0' });
    }

    // Validate split payment amounts if split is enabled
    let splitCashAmountCents = cashAmountCents;
    let splitCardAmountCents = cardAmountCents;

    if (isSplitPayment) {
      if (!splitCashAmountCents || !splitCardAmountCents) {
        return res.status(400).json({
          message: 'When isSplitPayment is true, both cashAmountCents and cardAmountCents are required',
        });
      }

      if (splitCashAmountCents <= 0 || splitCardAmountCents <= 0) {
        return res.status(400).json({
          message: 'Both cash and card amounts must be greater than 0',
        });
      }

      // Verify sum equals total (within 1 cent rounding tolerance)
      const sum = splitCashAmountCents + splitCardAmountCents;
      if (Math.abs(sum - totalAmountCents) > 1) {
        return res.status(400).json({
          message: `Split amounts must sum to total. Got ${splitCashAmountCents} + ${splitCardAmountCents} = ${sum}, expected ${totalAmountCents}`,
        });
      }
    } else {
      // Non-split: card amount is total
      splitCardAmountCents = totalAmountCents;
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
    const cardFeeRate = hasReferralDiscount ? 0 : getPlatformFeeRate(organizer.subscriptionTier as any);
    const platformFeeCents = Math.round(splitCardAmountCents! * cardFeeRate);
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
      if (err?.code === 'P2034') {
        // Genuine concurrent duplicate: Postgres aborted one side of the race.
        return res.status(429).json({
          message: 'A payment request was already sent to this shopper in the last 60 seconds',
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
    const { paymentIntentId, sourceId } = req.body as { paymentIntentId?: string; sourceId?: string };

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

    // Verify status is ACCEPTED
    if (posRequest.status !== 'ACCEPTED') {
      return res.status(400).json({
        message: `Payment request is no longer available (status: ${posRequest.status})`,
      });
    }

    // Square migration Wave 1 #3 (2026-09-07): body-field requirement depends on this
    // specific row's processor, not a global assumption.
    if (posRequest.processor === 'SQUARE') {
      if (!sourceId || typeof sourceId !== 'string') {
        return res.status(400).json({ message: 'sourceId is required' });
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

      // Mark POS request as PAID
      await prisma.pOSPaymentRequest.update({
        where: { id: requestId },
        data: { status: 'PAID', paidAt: new Date() },
      });
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

      // Mark POS request as PAID
      await prisma.pOSPaymentRequest.update({
        where: { id: requestId },
        data: { status: 'PAID', paidAt: new Date() },
      });
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
    if (posRequest.isSplitPayment && posRequest.cashAmountCents) {
      try {
        const cashFeeRate = await resolveCashCommissionRate({
          subscriptionTier: organizerProfile.subscriptionTier,
          referralDiscountExpiry: organizerProfile.referralDiscountExpiry,
        });
        const cashCommission = cashCommissionOn(posRequest.cashAmountCents / 100, cashFeeRate);
        await accrueCashFeeBalance({ organizerId: organizerProfile.id, commission: cashCommission });
      } catch (err: any) {
        console.error('[pos-payment] Failed to accrue cash-half commission for split payment:', err);
        try {
          Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
            tags: { area: 'pos-payment-request-confirm-split-cash-commission' },
            extra: {
              requestId,
              organizerUserId: posRequest.organizerUserId,
              cashAmountCents: posRequest.cashAmountCents,
            },
          });
        } catch {
          // Sentry may not be initialized -- silently continue
        }
      }
    }

    // Create Purchase records for each item
    const items = await prisma.item.findMany({
      where: { id: { in: posRequest.itemIds }, saleId: posRequest.saleId },
      select: { id: true, price: true },
    });

    for (const item of items) {
      try {
        await prisma.purchase.create({
          data: {
            userId: posRequest.shopperUserId,
            itemId: item.id,
            saleId: posRequest.saleId,
            amount: item.price || 0,
            platformFeeAmount: posRequest.platformFeeCents / 100,
            // FEE SNAPSHOT (2026-08-17): commission-only, and commissionRate is null by design —
            // this flow charges ONE cart-level fee and stamps the whole figure onto every row (a
            // pre-existing shape, not changed here), so there is no honest per-row rate to
            // record. Inventing one to fill the column would be a guess. Must match the
            // idempotent webhook backstop in stripeController.ts exactly.
            ...snapshotForCommissionOnly(posRequest.platformFeeCents / 100, null),
            // findasale-hacker fix (2026-08-09, Direct-charges adversarial pass), STRIPE
            // rows only: this PaymentIntent was created above via paymentIntents.create(...,
            // { stripeAccount: organizerProfile.stripeConnectId }) -- it is UNCONDITIONALLY
            // a genuine Direct charge on the organizer's own connected account (this flow
            // predates the Direct-charges migration/allowlist and was never gated by
            // shouldUseDirectCharge). Leaving chargeType at its schema default ('DESTINATION')
            // would mislabel every POS Payment Request Purchase row, which breaks
            // refundService.ts's refund-call routing (it would omit { stripeAccount },
            // calling refunds.create against a PaymentIntent that only exists on the
            // connected account -- refund fails outright). See buildProcessorPurchaseFields
            // above for the SQUARE-row shape (2026-09-07, Square migration Wave 1 #3).
            ...buildProcessorPurchaseFields(item.id),
            source: 'POS',
            status: 'PAID',
          },
        });

        // ADR-085 Track B Phase 1 Step 4: atomic, race-safe stock decrement replaces the
        // old unconditional status update. Downstream cross-channel-removal hooks only fire
        // once the item is actually fully sold out (stockSold reached stockTotal) -- they
        // previously fired unconditionally on every sale regardless of remaining stock.
        let fullySoldOut: boolean;
        let remainingStock: number;
        try {
          ({ fullySoldOut, remainingStock } = await sellItemUnits(item.id, 1));
        } catch (stockErr: any) {
          if (stockErr instanceof InsufficientStockError) {
            console.error(`[pos-payment] Oversold race on item ${item.id} despite captured payment:`, stockErr.message);
          }
          throw stockErr;
        }

        if (fullySoldOut) {
          // Fire-and-forget: end eBay listing if item was pushed there
          endEbayListingIfExists(item.id).catch(err =>
            console.error('[eBay] Failed to withdraw offer:', err)
          );
          markShopifyItemSold(item.id).catch(err =>
            console.error('[Shopify] Failed to mark item sold:', err)
          );
          notifyFacebookExportedItemSold(item.id).catch(err =>
            console.warn(`[FB Nudge] failed for item ${item.id}:`, err.message)
          );
        } else {
          // ADR-087 Phase 4: partial sale — revise eBay listing quantity if linked.
          syncMarketplaceStock(item.id, { fullySoldOut: false, remainingStock }).catch(err =>
            console.error('[eBay ReviseQty] sync failed for item', item.id, err)
          );
        }

        // Update ItemReservation if exists
        await prisma.itemReservation.updateMany({
          where: { itemId: item.id, userId: posRequest.shopperUserId },
          data: { status: 'COMPLETED' },
        });
      } catch (err: any) {
        // Sentry FINDASALE-NODEJS-7M fix (2026-09-03, S-BQ-QA-ROADMAP): a P2002 here means
        // the client retried/double-submitted this exact confirm request (same paymentIntent
        // + same item) -- the Purchase row for this item was already created successfully by
        // the FIRST attempt, and this second attempt's create() is correctly rejected by the
        // compound partial unique index on (stripePaymentIntentId, itemId) (see schema.prisma
        // comment on the Purchase model). Nothing is broken: the item is already sold, stock
        // already decremented, notifications already sent -- this branch is a benign no-op,
        // not a fulfillment failure. Downgraded to a quiet warn (no Sentry alert) so real
        // failures below aren't drowned out by expected-duplicate noise. Every OTHER error in
        // this catch (stock-decrement failure, DB blip, etc.) still gets the full P0
        // console.error + Sentry treatment from the 2026-08-08 fix this replaces in part.
        if (err?.code === 'P2002') {
          console.warn(`[pos-payment] Duplicate confirm for item ${item.id} (externalPaymentId ${externalPaymentId}) -- Purchase already exists from an earlier attempt, skipping.`);
        } else {
          // P0 fix (2026-08-08, Terminal readiness audit): this is the same failure class
          // already fixed with a Sentry alert in stripeController.ts's POS-payment-request
          // webhook fulfillment (search "P0 fix (2026-08-07)" in that file) -- by this point
          // Stripe has confirmed the PaymentIntent succeeded (verified via
          // paymentIntents.retrieve above) and posRequest.status is already PAID, so a
          // failure creating this item's Purchase row or decrementing its stock means money
          // was captured but the item was never recorded as sold. The catch here already
          // correctly avoided aborting the rest of the cart (unlike terminalController.ts's
          // sibling bug, also fixed this pass) -- but it only logged to console, so the
          // failure had zero record anywhere once server logs rotated. Sentry closes that gap.
          console.error(`[pos-payment] Failed to mark item ${item.id} as sold (payment already captured, request already PAID):`, err);
          try {
            Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
              tags: { area: 'pos-payment-request-confirm-post-payment-item-fulfillment' },
              extra: {
                requestId,
                itemId: item.id,
                organizerUserId: posRequest.organizerUserId,
                shopperUserId: posRequest.shopperUserId,
                processor: posRequest.processor,
                externalPaymentId,
              },
            });
          } catch {
            // Sentry may not be initialized -- silently continue
          }
        }
      }
    }

    // Misc-only carts: no DB item IDs — create one Purchase for the full amount
    // Mixed carts: create a misc Purchase for any remainder beyond catalog item prices
    const realItemsTotal = items.reduce((sum, item) => sum + (item.price || 0), 0);
    const miscRemainder = Math.round((posRequest.totalAmountCents / 100 - realItemsTotal) * 100) / 100;
    const shouldCreateMisc = items.length === 0 || miscRemainder > 0.01;
    if (shouldCreateMisc) {
      const miscAmount = items.length === 0 ? posRequest.totalAmountCents / 100 : miscRemainder;
      try {
        await prisma.purchase.create({
          data: {
            userId: posRequest.shopperUserId,
            itemId: null,
            saleId: posRequest.saleId,
            amount: miscAmount,
            platformFeeAmount: posRequest.platformFeeCents / 100,
            // FEE SNAPSHOT (2026-08-17): see the item loop above for why the rate is null.
            ...snapshotForCommissionOnly(posRequest.platformFeeCents / 100, null),
            // findasale-hacker fix (2026-08-09), STRIPE rows only: same genuine-Direct-charge
            // mislabeling gap as the item-Purchase loop above -- see that comment for the
            // full rationale. SQUARE rows use the raw squarePaymentId (itemId is null here,
            // so no per-item suffix/uniqueness concern applies).
            ...(posRequest.processor === 'SQUARE'
              ? { processor: 'SQUARE' as const, squarePaymentId: externalPaymentId }
              : {
                  stripePaymentIntentId: items.length === 0 ? externalPaymentId : `${externalPaymentId}_misc`,
                  chargeType: 'DIRECT' as const,
                  stripeAccountId: organizerProfile.stripeConnectId,
                }),
            source: 'POS',
            status: 'PAID',
          },
        });
      } catch (err: any) {
        console.error('[pos-payment] Failed to create misc purchase record:', err);
      }
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

    return res.json({
      success: true,
      receiptUrl: '/shopper/history?view=receipts',
    });
  } catch (err: any) {
    console.error('[pos-payment] confirmPaymentRequest error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── CNP FEE (register-entered / manually-keyed card) ────────────────────────────────────
// PLACEHOLDER, NOT INDEPENDENTLY VERIFIED (2026-09-12, Square rebuild of the dead Stripe
// manual-card-entry flow -- see pos.tsx's ENABLE_MANUAL_CARD_ENTRY history / PosManualCard.tsx).
// The old (dead, never-worked) Stripe UI showed "3.4% + $0.30" as its CNP surcharge -- that
// was STRIPE's specific manually-keyed-card rate and cannot be carried over to Square. Square's
// actual published rate for a manually-keyed / card-not-present transaction (Square calls this
// "Keyed-in" in its fee schedule) was NOT independently verified this dispatch -- no live web
// access from this tool session to confirm it against Square's own published fee-schedule page.
// Flagged explicitly in the dev handoff. Using Square's ALREADY-VERIFIED 2.9% + $0.30 rate for
// its regular Payments/Online API charge (see payoutController.ts's SQUARE_RATE/SQUARE_FIXED,
// independently verified live 2026-09-09 for that exact integration surface) as a CLEARLY
// LABELED placeholder floor here -- NOT a confirmed keyed-in number. Square's real keyed-in
// rate is commonly HIGHER than its online-API rate on other processors' published fee
// schedules, so this placeholder likely UNDERSTATES the true cost. Patrick or a live web check
// must confirm the real rate before this ships to real organizers.
//
// Surcharge design: the CNP fee is ADDED ON TOP of the sale subtotal and charged to the buyer
// -- mirrors the pre-existing (dead) Stripe manual-entry flow's own design, not a new decision
// made in this rebuild. Platform commission (appFeeCents below) is computed on the subtotal
// only, not on this surcharge -- the surcharge exists to cover this organizer's higher
// effective processing cost for a manually-keyed card, not to enlarge the platform's own cut.
const CNP_FEE_RATE_PLACEHOLDER = 0.029;
const CNP_FEE_FIXED_CENTS_PLACEHOLDER = 30;

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

    const { sourceId, saleId, items, buyerEmail, discountType, discountValue, discountReasonNote } = req.body as {
      sourceId?: string;
      saleId?: string;
      items?: Array<{ itemId?: string; amount: number; label?: string }>;
      buyerEmail?: string;
      discountType?: string;
      discountValue?: number;
      discountReasonNote?: string;
    };

    if (!sourceId || typeof sourceId !== 'string') {
      return res.status(400).json({ message: 'sourceId is required' });
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
      for (const itemId of itemIds) {
        if (!dbItems[itemId]) {
          return res.status(404).json({ message: 'Item not found in this sale' });
        }
        if (dbItems[itemId].status !== 'AVAILABLE') {
          return res.status(400).json({ message: `"${dbItems[itemId].title}" is sold or unavailable` });
        }
        if (dbItems[itemId].draftStatus !== null && dbItems[itemId].draftStatus !== 'PUBLISHED') {
          return res.status(400).json({ message: `"${dbItems[itemId].title}" is pending review and cannot be sold yet` });
        }
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

    const cnpFeeCents = Math.round(subtotalCents * CNP_FEE_RATE_PLACEHOLDER) + CNP_FEE_FIXED_CENTS_PLACEHOLDER;
    const totalChargeCents = subtotalCents + cnpFeeCents;

    const preflight = await squarePos.preflightAccountStatus({
      id: organizer.id,
      squareOnboarded: organizer.squareOnboarded,
      squareMerchantId: organizer.squareMerchantId,
      squareLocationId: organizer.squareLocationId,
    });
    if (!preflight.ok) {
      return res.status(preflight.status).json({ message: preflight.message });
    }

    // Platform commission on the sale's own subtotal (never the CNP surcharge) -- same
    // resolution createPaymentRequest above uses for the card portion of its own charges.
    const hasReferralDiscount =
      organizer.referralDiscountExpiry != null && organizer.referralDiscountExpiry > new Date();
    const cardFeeRate = hasReferralDiscount ? 0 : getPlatformFeeRate(organizer.subscriptionTier as any);
    const baseAppFeeCents = Math.round(subtotalCents * cardFeeRate);

    // Cash-fee-debt recoupment (2026-09-12 Stripe removal) -- same mechanism every other
    // Square card charge in this codebase applies, see cashFeeService.ts's file header.
    const { appFeeCents, debtAppliedCents } = await applyCashDebtToAppFee({
      organizerId: organizer.id,
      baseAppFeeCents,
      saleAmountCents: totalChargeCents,
    });

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
      sourceId,
      amountCents: totalChargeCents,
      appFeeCents,
      // No POSPaymentRequest row exists for this flow -- sourceId itself is the idempotency
      // seed. See this function's own header comment for the full reasoning.
      posRequestId: sourceId,
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

    const squarePaymentId = result.paymentId;

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
      });
    }

    const purchaseIds: string[] = [];
    let remainingDebtCentsToAllocate = debtAppliedCents;
    for (let idx = 0; idx < chargedItems.length; idx++) {
      const item = chargedItems[idx];
      const itemAmountCents = Math.round(item.amount * 100);
      const itemFeeCents = Math.round(itemAmountCents * cardFeeRate);
      const isLastItem = idx === chargedItems.length - 1;
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

      if (item.itemId) {
        try {
          const { fullySoldOut, remainingStock } = await sellItemUnits(item.itemId, 1);
          if (fullySoldOut) {
            endEbayListingIfExists(item.itemId).catch((err) => console.error('[eBay] Failed to withdraw offer:', err));
            markShopifyItemSold(item.itemId).catch((err) => console.error('[Shopify] Failed to mark item sold:', err));
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

    await settleCashDebtCollection({ organizerId: organizer.id, debtAppliedCents });

    // S1072 Finding #4 shape: no verifiable buyer account for this walk-up register sale --
    // same posture as cashPaymentController.cashPayment's own recordSuspectedSignal call.
    // Log-only, never blocks a legitimate sale.
    if (sale.organizer?.userId) {
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
    });
  } catch (err: any) {
    console.error('[pos-payment] manualCardPayment error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
