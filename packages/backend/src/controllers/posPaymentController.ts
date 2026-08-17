import { Response } from 'express';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getStripe } from '../utils/stripe';
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
import { assertCheckoutAllowed, CheckoutGuardError } from '../services/checkoutGuard'; // S1072 Finding #4 gap fix: POS payment-request self-dealing guard
import { getAccountStatus } from '../services/stripeConnectService'; // Direct-charges migration (2026-08-08): live capability preflight

const stripe = () => getStripe();

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
    } = req.body as {
      shopperUserId?: string;
      saleId?: string;
      itemIds?: string[];
      totalAmountCents?: number;
      expiresInSeconds?: number;
      isSplitPayment?: boolean;
      cashAmountCents?: number;
      cardAmountCents?: number;
    };

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

    // Platform fee: 10% of the card portion only (for split payments, cash isn't processed by Stripe)
    const platformFeeCents = Math.round(splitCardAmountCents! * 0.1);
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
              shopperUserId,
              saleId,
              itemIds: items.map((i) => i.id), // use only available items (SOLD filtered out above)
              totalAmountCents,
              platformFeeCents,
              expiresAt,
              isSplitPayment,
              cashAmountCents: isSplitPayment ? splitCashAmountCents : null,
              cardAmountCents: isSplitPayment ? splitCardAmountCents : null,
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

    // Direct-charges migration (2026-08-08): live capability preflight. resolveOrganizerOrTeamMember
    // only confirms organizer.stripeConnectId is non-null (a cached DB presence check) --
    // never that Stripe currently reports the account as charge-capable (a DB-cache vs
    // live-Stripe discrepancy was confirmed for at least one real organizer this session).
    // Never authorize a real charge against an account Stripe itself doesn't currently
    // report as charge-capable.
    try {
      const liveStatus = await getAccountStatus(organizer.stripeConnectId!);
      if (!liveStatus.chargesEnabled) {
        await prisma.pOSPaymentRequest
          .update({ where: { id: posRequest.id }, data: { status: 'CANCELLED', declineReason: 'PAYMENT_FAILED' } })
          .catch((releaseErr) => console.error('[pos-payment] Failed to release placeholder after preflight failure:', releaseErr));
        return res.status(400).json({ message: "This organizer's Stripe account cannot currently accept charges. Please check Stripe onboarding status." });
      }
    } catch (statusErr) {
      console.error('[pos-payment] getAccountStatus preflight failed:', statusErr);
      await prisma.pOSPaymentRequest
        .update({ where: { id: posRequest.id }, data: { status: 'CANCELLED', declineReason: 'PAYMENT_FAILED' } })
        .catch((releaseErr) => console.error('[pos-payment] Failed to release placeholder after preflight error:', releaseErr));
      return res.status(502).json({ message: "Could not verify the organizer's payment account status. Please try again." });
    }

    // Create Stripe Payment Intent (for card amount only) now that the placeholder row
    // exists -- idempotencyKey is keyed to the claimed row id so a retry against the SAME
    // placeholder (e.g. a lost response on our side) can't create a second PaymentIntent.
    let paymentIntent;
    try {
      paymentIntent = await stripe().paymentIntents.create(
        {
          amount: splitCardAmountCents, // Card amount only (not total if split)
          currency: 'usd',
          payment_method_types: ['card'],
          application_fee_amount: platformFeeCents, // 10% of card amount
          metadata: {
            requestId: posRequest.id,
            organizerId: organizer.id,
            organizerUserId: organizerUserId,
            shopperId: shopperUserId,
            saleId,
            source: 'pos_payment_request',
            isSplitPayment: isSplitPayment ? 'true' : 'false',
          },
        },
        {
          stripeAccount: organizer.stripeConnectId!,
          idempotencyKey: `pos-payment-request-${posRequest.id}`,
        }
      );
    } catch (err: any) {
      console.error('[pos-payment] Failed to create Stripe Payment Intent:', err);
      // Release the placeholder so it doesn't permanently block this shopper/sale pair
      // via the dedup check above.
      await prisma.pOSPaymentRequest
        .update({
          where: { id: posRequest.id },
          data: { status: 'CANCELLED', declineReason: 'PAYMENT_FAILED' },
        })
        .catch((releaseErr) => console.error('[pos-payment] Failed to release placeholder after Stripe error:', releaseErr));
      return res.status(500).json({
        message: 'Failed to create payment intent',
        error: err.message,
      });
    }

    // Backfill the PaymentIntent onto the now-created row.
    try {
      posRequest = await prisma.pOSPaymentRequest.update({
        where: { id: posRequest.id },
        data: {
          stripePaymentIntentId: paymentIntent.id,
          clientSecret: paymentIntent.client_secret!,
        },
      });
    } catch (err: any) {
      console.error('[pos-payment] Failed to backfill PaymentIntent onto POSPaymentRequest:', err);
      return res.status(500).json({ message: 'Failed to create payment request' });
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
        stripePaymentIntentSecret: paymentIntent.client_secret,
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
      stripePaymentIntentId: paymentIntent.id,
      stripePaymentIntentSecret: paymentIntent.client_secret,
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
    const organizerRecord = await prisma.organizer.findUnique({
      where: { id: request.organizerId },
      select: { stripeConnectId: true },
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
    const { paymentIntentId } = req.body as { paymentIntentId?: string };

    if (!requestId) return res.status(400).json({ message: 'requestId is required' });
    if (!paymentIntentId || typeof paymentIntentId !== 'string') {
      return res.status(400).json({ message: 'paymentIntentId is required' });
    }

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

    // Fetch Organizer profile to get stripeConnectId (stripeConnectId lives on Organizer, not User)
    const organizerProfile = await prisma.organizer.findUnique({
      where: { userId: posRequest.organizerUserId },
      select: { stripeConnectId: true },
    });
    if (!organizerProfile?.stripeConnectId) {
      return res.status(400).json({ message: 'Organizer Stripe account not configured' });
    }

    // Get Stripe instance
    let paymentIntent;
    try {
      // Retrieve PaymentIntent from Stripe (on the connected account)
      paymentIntent = await stripe().paymentIntents.retrieve(paymentIntentId, {}, {
        stripeAccount: organizerProfile.stripeConnectId,
      });
    } catch (err: any) {
      console.error('[pos-payment] Failed to retrieve PaymentIntent:', err);
      return res.status(400).json({
        message: 'Could not verify payment with Stripe',
        error: err.message,
      });
    }

    // Verify PaymentIntent succeeded
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        message: `Payment intent status is ${paymentIntent.status}, expected succeeded`,
      });
    }

    // Verify metadata matches
    if (
      paymentIntent.metadata?.source !== 'pos_payment_request' ||
      paymentIntent.metadata?.requestId !== requestId
    ) {
      return res.status(400).json({
        message: 'Payment intent does not match this payment request',
      });
    }

    // Mark POS request as PAID
    await prisma.pOSPaymentRequest.update({
      where: { id: requestId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
      },
    });

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
            // PI ID is @unique — use per-item suffix to allow multiple items per PI
            stripePaymentIntentId: `${paymentIntent.id}_${item.id}`,
            source: 'POS',
            status: 'PAID',
            // findasale-hacker fix (2026-08-09, Direct-charges adversarial pass): this
            // PaymentIntent was created above via paymentIntents.create(..., { stripeAccount:
            // organizerProfile.stripeConnectId }) -- it is UNCONDITIONALLY a genuine Direct
            // charge on the organizer's own connected account (this flow predates the
            // Direct-charges migration/allowlist and was never gated by shouldUseDirectCharge).
            // Leaving chargeType at its schema default ('DESTINATION') would mislabel every
            // POS Payment Request Purchase row, which breaks refundService.ts's refund-call
            // routing (it would omit { stripeAccount }, calling refunds.create against a
            // PaymentIntent that only exists on the connected account -- refund fails outright).
            chargeType: 'DIRECT',
            stripeAccountId: organizerProfile.stripeConnectId,
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
              stripePaymentIntentId: paymentIntent.id,
            },
          });
        } catch {
          // Sentry may not be initialized -- silently continue
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
            stripePaymentIntentId: items.length === 0 ? paymentIntent.id : `${paymentIntent.id}_misc`,
            source: 'POS',
            status: 'PAID',
            // findasale-hacker fix (2026-08-09): same genuine-Direct-charge mislabeling gap
            // as the item-Purchase loop above -- see that comment for the full rationale.
            chargeType: 'DIRECT',
            stripeAccountId: organizerProfile.stripeConnectId,
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
