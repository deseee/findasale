/**
 * POS Upgrade Controller
 *
 * Handles Open Cart workflows:
 * - Shoppers share carts from their device (POSSession)
 * - Organizers pull carts into their POS terminal
 * - Organizers generate Stripe Payment Links for shopper self-checkout via QR
 * - Organizers send invoices for held items (hold-to-pay Phase 2)
 *
 * NOTE: Hold-to-Invoice endpoint check required (see Step 7 in implementation spec).
 * If markSoldAndCreateInvoice already exists in reservationController, that endpoint is used instead.
 */

import { Response } from 'express';
import type { HoldInvoice, POSPaymentLink } from '@prisma/client';
import crypto from 'crypto';
import * as Sentry from '@sentry/node';
import { resolveAndBackfillSquareLocationId } from '../services/squarePosPaymentAdapter';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { isBulkLotsEnabled } from '../services/bulkLot/bulkLotConfig'; // ADR-136 (#659): bulk lots cannot be sold through this channel
import { bulkChannelRefusal, type BulkLotDb } from '../services/bulkLot/bulkLotService';
import { applyCrewInvasionDiscount, releaseCrewInvasionRedemption, validateCrewInvasionCode, linkCrewInvasionRedemptionToInvoice } from '../services/crewInvasionRedemptionService'; // Feature #397 (2026-09-29): real redemption of the Crew Invasion code on hold invoices
import { getIO } from '../lib/socket';
import { createNotification } from '../lib/notificationService';
import { getInclusivePlatformFeeRate, calculateInclusiveCommissionCents, SubscriptionTier } from '../utils/feeCalculator'; // inclusive-fee migration (2026-09-24, Patrick ruling): both sites in this file are hosted-checkout-link charges completed by the buyer on their own device (Square Quick Pay Checkout / hold-invoice email link) -- ONLINE channel, never IN_PERSON, even though the link itself is created at the register
import { transactionalEmailService } from '../lib/transactionalEmailService';
import { commitItemSale, ItemAlreadyCommittedError } from '../services/itemSaleGuard'; // ADR-098: atomic double-sell guard
import { resolveOrganizerOrTeamMember } from '../utils/posAuth'; // S1183 Fix 1: TEAM_MEMBER fallback for non-venue POS
import { checkPermission } from '../services/workspacePermissionService'; // POS Cashier Discount Permission (2026-08-28)
import { WORKSPACE_PERMISSIONS } from '../utils/workspacePermissions'; // POS Cashier Discount Permission (2026-08-28)
// Stripe removal (2026-09-12): getStripe/Stripe/stripeCheckoutExpiry/shouldUseDirectCharge
// imports removed -- all four were orphaned leftovers from this same file's earlier
// Stripe-removal pass (this session): the ~330-line Stripe Checkout Session block in
// sendHoldInvoice that used to consume them was already deleted, but these imports (and
// the local `stripe()` wrapper below) were never cleaned up. Confirmed via grep: zero
// remaining call sites for getStripe(), the Stripe type, stripeCheckoutExpiry, or
// shouldUseDirectCharge anywhere in this file.
import { invoiceableWhere, isInvoicedOrClaimed, releaseDeadInvoiceAnchors } from '../services/holdInvoiceClaim'; // Hold-to-Pay P0 (2026-08-16): non-FK invoice claim must be visible to every hold read site; P0 (2026-08-17): dead-anchor release
import { markHoldInvoicePaid } from '../services/holdInvoicePaymentRecorder'; // ADR-114 (2026-08-31): fully-cash sendHoldInvoice path reuses the single source of truth for recording a paid invoice
import { createHoldInvoiceSquareCheckout, generateHoldInvoiceId } from '../services/holdInvoiceSquareCheckoutHelper'; // Square changeover Wave S2 #3 (2026-09-09): Hold-to-Pay invoice creation, Square branch
import { SquareOnboardingIncompleteError, buildSquareIdempotencyKey } from '../services/squarePaymentService'; // thrown by createHoldInvoiceSquareCheckout when the organizer's Square onboarding is incomplete; buildSquareIdempotencyKey added Wave S2 #4 (2026-09-09) for the POS QR payment-link Square branch below
import { createSquareCheckoutLink, deleteSquareCheckoutLink } from '../services/squareCheckoutLinkService'; // Square changeover Wave S2 #4 (2026-09-09): POS QR payment link, Square branch
import { isValidCents, cardLegProblem, wouldExceedCashFeeExposureCap, resolveCashCommissionRate, cashCommissionOn, accrueSplitCashLegOnce, MAX_POS_AMOUNT_CENTS, MIN_SPLIT_CARD_LEG_CENTS } from '../services/cashFeeService'; // Split tender on the QR payment link (2026-09-29): validation, cash-fee exposure cap, and idempotent cash-leg commission accrual
import { escapeHtml, safeHttpsUrl } from '../utils/htmlEscape'; // 2026-09-29: shopper/organizer-controlled text interpolated into the invoice email; safeHttpsUrl (2026-09-30): the stored payment link URL is re-validated before it goes into an email
import { redisIncrWithWindow } from '../middleware/rateLimitShared'; // 2026-09-30: per-organizer hourly cap on emailing payment links (same Redis fixed-window helper the guest-checkout velocity guard uses)
import { normalizeMiscLines, evaluateInvoicePricing, authorizeDiscountAndCheckFloor } from '../services/posInvoiceLinePricing'; // 2026-09-29 money review P1-6/8: integer-cent lines, discount permission + catalog floor on the hold invoice and the QR link

/** Payment-link expiry bounds for the optional expiresInSeconds on POST /api/pos/payment-links. */
const PAYMENT_LINK_MIN_EXPIRY_SECONDS = 60;
const PAYMENT_LINK_MAX_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

/** Thrown by createPaymentLinkInternal when an itemId is not an item of the given sale and organizer. */
export class PaymentLinkItemScopeError extends Error {
  constructor() {
    super('One or more items were not found in this sale');
    this.name = 'PaymentLinkItemScopeError';
  }
}

// ─── Reusable internals ─────────────────────────────────────────────────────────

/**
 * Settlement router (markSold Decision A) — reusable Stripe Payment Link + QR generator.
 *
 * Extracted from createPaymentLink so the markSold settlement router
 * (reservationController.batchUpdateHolds, CHECKOUT_LINK mode) can reuse the exact
 * same Stripe code instead of rebuilding it. createPaymentLink delegates here too.
 *
 * IMPORTANT: This NEVER flips item status to SOLD. Items flip to SOLD only via the
 * Stripe webhook (checkout.session.completed → payment_link path). Callers that need
 * an intermediate state set Item.status = 'INVOICE_ISSUED' themselves.
 *
 * @returns { linkId, paymentLinkUrl, qrCodeDataUrl, amount } or throws on Stripe failure.
 */
export async function createPaymentLinkInternal(opts: {
  organizerId: string;
  stripeConnectId: string | null;
  subscriptionTier: string | null;
  saleId: string;
  itemIds: string[];
  amount: number; // dollars
  buyerEmail?: string;
  // Reclaim-gap fix (2026-08-04): CHECKOUT_LINK settlement router (reservationController.ts
  // batchUpdateHolds) passes the underlying hold's own expiresAt here so the resulting
  // POSPaymentLink row carries a REAL expiry that posStrandedSaleReconcileCron.ts can
  // reclaim against -- mirrors LOCKED DECISION #7 (HoldInvoice/Checkout-Session path:
  // "payment window = hold timer remainder"). Callers with no underlying hold (the
  // generic POST /api/pos/payment-links ad-hoc "collect payment" endpoint, which never
  // flips Item.status) omit this and keep the flat 24h default -- there is no hold
  // timer to derive from and no INVOICE_ISSUED item for a reclaim job to act on.
  expiresAt?: Date;
  // Square changeover Wave S2 #4 (2026-09-09): organizer's Square-onboarding signal, same
  // `organizerHasSquare = squareOnboarded === true && !!squareMerchantId` gate already used
  // by bountyController.ts / reservationController.ts / this file's own sendHoldInvoice.
  // Both existing callers (createPaymentLink below, reservationController.ts's
  // batchUpdateHolds CHECKOUT_LINK branch) already have these fields on their own resolved
  // `organizer` object -- no extra query needed here.
  squareOnboarded?: boolean;
  squareMerchantId?: string | null;
  // Split tender (2026-09-29): whole cents the cashier already collected in cash at the register.
  // `amount` above stays the CARD amount actually charged through the link (so the link's app fee
  // is computed on the card leg only, per ADR-split-payment-S422); this is recorded on the
  // POSPaymentLink row so the cash-leg commission can accrue when the link is paid. Optional and
  // ignored when absent/0 -- reservationController's CHECKOUT_LINK caller never sets it.
  cashAmountCents?: number;
}): Promise<{ linkId: string; paymentLinkUrl: string; qrCodeDataUrl?: string; amount: number }> {
  const { organizerId, stripeConnectId, subscriptionTier, saleId, itemIds, amount, buyerEmail, expiresAt, squareOnboarded, squareMerchantId } = opts;

  // Money review P1-4/5 (2026-09-29): every item must belong to THIS sale AND this organizer, and
  // every requested id must resolve. This used to filter by saleId only and silently ignore ids
  // that did not match, so a link could carry another tenant's item id (which the payment
  // recorder then sold when the link was paid).
  const items = itemIds.length > 0
    ? await prisma.item.findMany({
        where: { id: { in: itemIds }, saleId, sale: { organizerId } },
        select: { id: true, title: true, price: true },
      })
    : [];
  if (itemIds.length > 0 && items.length !== new Set(itemIds).size) {
    throw new PaymentLinkItemScopeError();
  }

  const amountCents = Math.round(amount * 100);

  const feeRate = getInclusivePlatformFeeRate(subscriptionTier as SubscriptionTier, 'ONLINE');
  const platformFeeAmount = calculateInclusiveCommissionCents(amountCents, subscriptionTier as SubscriptionTier, 'ONLINE');

  const organizerHasSquare = squareOnboarded === true && !!squareMerchantId;

  let paymentLinkUrl: string;
  let processorFields: Record<string, any>;

  if (organizerHasSquare) {
    // Square changeover Wave S2 #4 (2026-09-09): Square branch. Square's Quick Pay
    // Checkout (via the Wave S1 shared squareCheckoutLinkService.ts) is a near-exact
    // structural match for this ad-hoc single-use link -- see that file's own header
    // comment and holdInvoiceSquareCheckoutHelper.ts for the sibling Hold-to-Pay usage.
    // POSPaymentLink.id is pre-generated (mirrors HoldInvoice's identical trick) so it can
    // serve as a stable idempotency-key input; unlike HoldInvoice, no paymentNote
    // correlation trick is needed here -- the POSPaymentLink row is created immediately
    // after this succeeds (not asynchronously later), so squareWebhookController.ts can
    // always find it via a direct squareOrderId match once the row exists.
    const preAssignedLinkId = crypto.randomUUID();
    const squareDescription = `FindA.Sale: ${items.map(i => i.title).join(', ').slice(0, 200) || 'Item Sale'}`;
    const squareResult = await createSquareCheckoutLink({
      organizerId,
      idempotencyKey: buildSquareIdempotencyKey(['pos-payment-link', preAssignedLinkId]),
      amountCents,
      description: squareDescription,
      appFeeCents: platformFeeAmount,
    });
    if (!squareResult.ok) {
      throw new Error(`Square payment link creation failed: ${squareResult.code} -- ${squareResult.message}`);
    }
    paymentLinkUrl = squareResult.url;
    processorFields = {
      id: preAssignedLinkId,
      processor: 'SQUARE',
      squarePaymentLinkId: squareResult.paymentLinkId,
      squareOrderId: squareResult.orderId,
      squarePaymentLinkUrl: squareResult.url,
    };
  } else {
    // Stripe removal (2026-09-12): this organizer has no Square account connected, and
    // the platform's Stripe account is permanently closed -- there is no processor left
    // to create a payment link against. Fail closed with a clean, catchable error instead
    // of attempting a Stripe call that is now guaranteed to fail. Reuses
    // SquareOnboardingIncompleteError (squarePaymentService.ts) since the meaning is
    // identical -- "this organizer cannot accept an online charge right now" -- so every
    // caller that already has a catch block for it (see posController.ts's
    // createPaymentLink, reservationController.ts's batchUpdateHolds CHECKOUT_LINK mode)
    // gets the correct SELLER_PAYMENTS_UNAVAILABLE response for free.
    throw new SquareOnboardingIncompleteError(organizerId);
  }

  let qrCodeDataUrl: string | undefined;
  try {
    const qrcode = require('qrcode');
    qrCodeDataUrl = await qrcode.toDataURL(paymentLinkUrl);
  } catch (qrErr) {
    console.warn('[pos] QR code generation failed:', qrErr);
  }

  let posPaymentLink: POSPaymentLink;
  try {
  posPaymentLink = await prisma.pOSPaymentLink.create({
    data: {
      organizerId,
      saleId,
      qrCodeDataUrl,
      amount: amountCents,
      itemIds,
      status: 'ACTIVE',
      ...(opts.cashAmountCents && opts.cashAmountCents > 0
        ? { isSplitPayment: true, cashAmountCents: opts.cashAmountCents, cardAmountCents: amountCents }
        : {}),
      // Reclaim-gap fix (2026-08-04): use the caller-supplied hold expiresAt when present
      // (CHECKOUT_LINK settlement router) so posStrandedSaleReconcileCron.ts's expiry-based
      // reclaim branch has a real deadline to act on; ad-hoc/no-hold callers keep the flat 24h.
      expiresAt: expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      ...processorFields,
    },
  });
  } catch (rowErr) {
    // The Square link above is live and payable but nothing in the database points at it. Cancel
    // it (best effort) so a shopper cannot pay a link no record will ever reconcile, then rethrow.
    const orphanLinkId = processorFields.squarePaymentLinkId as string | undefined;
    if (orphanLinkId) {
      try {
        const del = await deleteSquareCheckoutLink({ organizerId, paymentLinkId: orphanLinkId });
        if (!del.ok) throw new Error(`Square refused to cancel the orphaned link: ${del.code}`);
      } catch (delErr) {
        console.error(`[pos] ORPHANED-SQUARE-LINK ${orphanLinkId} could not be cancelled after the POSPaymentLink row failed to save:`, delErr);
        try {
          Sentry.captureException(delErr instanceof Error ? delErr : new Error(String(delErr)), {
            tags: { area: 'pos-payment-link-orphan' },
            extra: { organizerId, saleId, squarePaymentLinkId: orphanLinkId },
          });
        } catch {
          // Sentry may not be initialized
        }
      }
    }
    throw rowErr;
  }

  if (buyerEmail) {
    try {
      const { buildEmail } = await import('../services/emailTemplateService');
      const html = buildEmail({
        preheader: `Your payment link for $${amount.toFixed(2)}`,
        headline: `Your Payment Link`,
        body: `<p>Your organizer has sent you a payment link for <strong>$${amount.toFixed(2)}</strong>. Click below to pay securely.</p>`,
        ctaText: 'Pay Now',
        ctaUrl: paymentLinkUrl,
        accentColor: '#10b981',
      });
      await transactionalEmailService.emails.send({
        from: process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale',
        to: buyerEmail,
        subject: `Payment link: $${amount.toFixed(2)}`,
        html,
      });
    } catch (emailErr) {
      console.warn('[pos] Failed to send payment link email:', emailErr);
    }
  }

  return { linkId: posPaymentLink.id, paymentLinkUrl, qrCodeDataUrl, amount };
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

/**
 * GET /api/pos/context
 * S1183 Fix 1: narrow, POS-scoped, read-only replacement for POS's own use of
 * `/sales/mine` and `/organizers/me` -- both of those endpoints are wide-blast-radius
 * (used well beyond POS) and were never going to recognize a TEAM_MEMBER register
 * operator anyway. Gated ONLY by `authenticate` at the route level -- this handler
 * gates itself via resolveOrganizerOrTeamMember, so it correctly 403s an authenticated
 * user with no organizer-or-team-member access instead of relying on route middleware.
 *
 * Response: {
 *   actorKind: 'ORGANIZER' | 'TEAM_MEMBER';
 *   organizerId: string;
 *   sales: Array<{ id, title, status, startDate, endDate }>; // PUBLISHED only
 *   venmoHandle: string | null;
 *   zelleHandle: string | null;
 *   canApplyDiscount: boolean; // POS Cashier Discount Permission (2026-08-28)
 *   discountCap: { type: 'PERCENT' | 'FIXED'; value: number } | null; // null = uncapped or not applicable
 * }
 */
export const getPosContext = async (req: AuthRequest, res: Response) => {
  try {
    const actor = await resolveOrganizerOrTeamMember(req, res, { requireStripe: false });
    if (!actor) return;

    const [sales, organizerRow] = await Promise.all([
      prisma.sale.findMany({
        where: { organizerId: actor.id, status: 'PUBLISHED' },
        select: { id: true, title: true, status: true, startDate: true, endDate: true },
        orderBy: { startDate: 'desc' },
      }),
      prisma.organizer.findUnique({
        where: { id: actor.id },
        // squareOnboarded/squareLocationId (2026-09-12, manual card entry Square rebuild):
        // the organizer POS page needs its own squareLocationId client-side to initialize
        // the Square Web Payments SDK for register-entered card sales -- see
        // PosManualCard.tsx / pos.tsx's ENABLE_MANUAL_CARD_ENTRY history. Nothing before
        // this endpoint's own callers needed this field.
        select: {
          venmoHandle: true,
          zelleHandle: true,
          squareOnboarded: true,
          squareMerchantId: true,
          squareLocationId: true,
        },
      }),
    ]);

    // Self-heal (2026-09-13, "organizer not finished connecting Square" bug fix): this is
    // the FIRST touchpoint the manual-card-entry UI reads squareLocationId from (pos.tsx ->
    // PosManualCard -> SquarePaymentRequestForm) -- that UI blocks card entry entirely with
    // its own "not finished connecting Square yet" message the instant this is null,
    // WITHOUT ever calling a payment endpoint, so squarePosPaymentAdapter.ts's own
    // preflightAccountStatus self-heal (which only runs once a payment is actually
    // attempted) would never get a chance to fire for an organizer who only uses this
    // surface. Best-effort only: any failure here is swallowed and the endpoint falls back
    // to its pre-existing (possibly-null) value, exactly as before this fix -- this must
    // never break the rest of the POS context payload (sales list, discount permission,
    // etc.) that has nothing to do with Square.
    let resolvedSquareLocationId = organizerRow?.squareLocationId ?? null;
    if (organizerRow?.squareOnboarded && organizerRow.squareMerchantId && !resolvedSquareLocationId) {
      try {
        resolvedSquareLocationId = await resolveAndBackfillSquareLocationId({
          id: actor.id,
          squareMerchantId: organizerRow.squareMerchantId,
          squareOnboarded: organizerRow.squareOnboarded,
        });
      } catch (backfillErr) {
        console.error('[pos] getPosContext squareLocationId backfill failed:', backfillErr);
      }
    }

    // POS Cashier Discount Permission (2026-08-28): ORGANIZER is always allowed,
    // uncapped -- no lookup needed. TEAM_MEMBER requires the apply_pos_discount
    // WorkspacePermission; the UI should not render the discount control at all when
    // this is false (see claude_docs/ux-spotchecks/pos-cashier-discount-permission.md).
    let canApplyDiscount = actor.actorKind === 'ORGANIZER';
    let discountCap: { type: string; value: number } | null = null;
    if (actor.actorKind === 'TEAM_MEMBER' && actor.workspaceId && actor.workspaceRole) {
      canApplyDiscount = await checkPermission(actor.workspaceId, actor.workspaceRole, WORKSPACE_PERMISSIONS.APPLY_POS_DISCOUNT);
      if (canApplyDiscount) {
        const settings = await prisma.workspaceSettings.findUnique({
          where: { workspaceId: actor.workspaceId },
          select: { staffDiscountCapType: true, staffDiscountCapValue: true },
        });
        if (settings?.staffDiscountCapType && settings.staffDiscountCapValue != null) {
          discountCap = { type: settings.staffDiscountCapType, value: Number(settings.staffDiscountCapValue) };
        }
      }
    }

    return res.json({
      actorKind: actor.actorKind,
      organizerId: actor.id,
      sales: sales.map((s) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        startDate: s.startDate.toISOString(),
        endDate: s.endDate.toISOString(),
      })),
      venmoHandle: organizerRow?.venmoHandle ?? null,
      zelleHandle: organizerRow?.zelleHandle ?? null,
      squareOnboarded: organizerRow?.squareOnboarded ?? false,
      squareLocationId: resolvedSquareLocationId,
      canApplyDiscount,
      discountCap,
      // Register fee + split-tender limits (2026-09-29): served from the SAME helpers the charge
      // paths use (getInclusivePlatformFeeRate / calculateInclusiveCommissionCents), so the fee
      // text and the card-amount floor on the register can never drift from what is charged. A
      // register cash+card split is IN_PERSON on both legs. referralDiscountActive zeroes the fee.
      posFee: {
        tier: actor.subscriptionTier ?? null,
        inPersonRate:
          actor.referralDiscountExpiry != null && actor.referralDiscountExpiry > new Date()
            ? 0
            : getInclusivePlatformFeeRate(actor.subscriptionTier as SubscriptionTier, 'IN_PERSON'),
        minimumFeeCents: calculateInclusiveCommissionCents(1, actor.subscriptionTier as SubscriptionTier, 'IN_PERSON'),
        referralDiscountActive: actor.referralDiscountExpiry != null && actor.referralDiscountExpiry > new Date(),
      },
      splitTender: {
        minCardChargeCents: MIN_SPLIT_CARD_LEG_CENTS,
        maxAmountCents: MAX_POS_AMOUNT_CENTS,
      },
    });
  } catch (error) {
    console.error('[pos] getPosContext error:', error);
    return res.status(500).json({ message: 'Failed to load POS context' });
  }
};

/**
 * POST /api/pos/sessions
 * Shopper shares their cart (authenticated, any role)
 *
 * Body: { saleId: string, cartItems: Array<{id, title, price, photoUrl?}> }
 * Response: { sessionId: string }
 */
export const shareCart = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });

    const { saleId, cartItems } = req.body as {
      saleId?: string;
      cartItems?: Array<{ id: string; title: string; price: number; photoUrl?: string }>;
    };

    // Validate
    if (!saleId) return res.status(400).json({ message: 'saleId is required' });
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ message: 'cartItems must be non-empty array' });
    }
    if (cartItems.length > 50) {
      return res.status(400).json({ message: 'cartItems max 50 items' });
    }

    // Verify sale exists and is PUBLISHED
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true, status: true, organizerId: true },
    });

    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    if (sale.status !== 'PUBLISHED') {
      return res.status(400).json({ message: 'Sale is not published' });
    }

    // Create POSSession
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
    const session = await prisma.pOSSession.create({
      data: {
        organizerId: sale.organizerId,
        saleId,
        shopperId: req.user.id,
        cartItems,
        status: 'OPEN',
        expiresAt,
      },
    });

    res.json({ sessionId: session.id });
  } catch (error) {
    console.error('[pos] shareCart error:', error);
    res.status(500).json({ message: 'Failed to share cart' });
  }
};

/**
 * GET /api/pos/sessions
 * Organizer gets linked shopper carts for a sale (organizer-only)
 *
 * Query: ?saleId=xxx
 * Response: { sessions: Array<{id, shopperId, shopperName, cartItems, cartTotal, createdAt}> }
 */
export const getLinkedCarts = async (req: AuthRequest, res: Response) => {
  try {
    const organizer = await resolveOrganizerOrTeamMember(req, res, { requireStripe: false });
    if (!organizer) return;

    const { saleId } = req.query as { saleId?: string };
    if (!saleId) return res.status(400).json({ message: 'saleId query param required' });

    // Verify sale belongs to organizer
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { organizerId: true },
    });

    if (!sale || sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Sale does not belong to your account' });
    }

    // Get active OPEN sessions with shopper linked, not expired
    const sessions = await prisma.pOSSession.findMany({
      where: {
        saleId,
        status: 'OPEN',
        shopperId: { not: null },
        expiresAt: { gt: new Date() },
      },
      include: {
        shopper: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = sessions.map(s => {
      const rawItems = Array.isArray(s.cartItems) ? s.cartItems : [];
      // Prices stored in cents from shopper — convert to dollars for organizer POS display and pull
      const cartItems = rawItems.map((item: any) => ({
        ...item,
        price: parseFloat(((item.price ?? 0) / 100).toFixed(2)),
      }));
      const cartTotal = cartItems.reduce((sum, item: any) => sum + (item.price || 0), 0);
      return {
        id: s.id,
        shopperId: s.shopperId,
        shopperName: s.shopper?.name || 'Guest',
        shopperEmail: s.shopper?.email || '',
        cartItems,
        cartTotal: parseFloat(cartTotal.toFixed(2)),
        createdAt: s.createdAt,
      };
    });

    res.json({ sessions: result });
  } catch (error) {
    console.error('[pos] getLinkedCarts error:', error);
    res.status(500).json({ message: 'Failed to fetch linked carts' });
  }
};

/**
 * POST /api/pos/sessions/:sessionId/pull
 * Organizer pulls shopper cart into their POS (organizer-only)
 *
 * Response: { cartItems: POSSession.cartItems }
 */
export const pullCart = async (req: AuthRequest, res: Response) => {
  try {
    const organizer = await resolveOrganizerOrTeamMember(req, res, { requireStripe: false });
    if (!organizer) return;

    const { sessionId } = req.params as { sessionId?: string };
    if (!sessionId) return res.status(400).json({ message: 'sessionId required' });

    // Fetch session + verify ownership
    const session = await prisma.pOSSession.findUnique({
      where: { id: sessionId },
      include: { sale: { select: { organizerId: true } } },
    });

    if (!session) return res.status(404).json({ message: 'Session not found' });
    if (session.sale!.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Session does not belong to your sale' });
    }

    // Mark session as PULLED
    await prisma.pOSSession.update({
      where: { id: sessionId },
      data: { status: 'PULLED' },
    });

    res.json({ cartItems: session.cartItems });
  } catch (error) {
    console.error('[pos] pullCart error:', error);
    res.status(500).json({ message: 'Failed to pull cart' });
  }
};

/**
 * POST /api/pos/payment-links
 * Create Stripe Payment Link + generate QR (organizer-only)
 *
 * Body: { saleId: string, itemIds: string[], amount: number (in DOLLARS) }
 * Response: { linkId, paymentLinkUrl, qrCodeDataUrl, amount }
 */
export const createPaymentLink = async (req: AuthRequest, res: Response) => {
  try {
    // Payment Links are independent of the Terminal/card-reader simulation flag.
    //
    // Square-era gate (2026-09-29). This used to pass `{ requireStripe: true }`, a leftover from
    // the Stripe era. Since the Square migration posAuth.resolveOrganizerOrTeamMember reads that
    // flag as "at least one connected processor" (stripeConnectId OR squareOnboarded), so it
    // still let a Square organizer through -- but it ALSO let a legacy Stripe-only organizer
    // through (Stripe's platform account is closed), who then failed later inside
    // createPaymentLinkInternal with a 409, and it never checked squareMerchantId at all. The
    // only processor that can create a payment link now is Square, so check exactly that, here,
    // with a message the cashier can act on. requireStripe:false because the processor check
    // below replaces it (the flag would only re-admit a Stripe-only account).
    const organizer = await resolveOrganizerOrTeamMember(req, res, { requireStripe: false });
    if (!organizer) return;
    if (!organizer.squareOnboarded || !organizer.squareMerchantId) {
      return res.status(400).json({
        message: 'Payment links need a connected Square account. Finish Square setup in Settings, then try again.',
        code: 'SQUARE_NOT_CONNECTED',
      });
    }

    const { saleId, itemIds, amount, buyerEmail, cashAmountCents, discountType, discountValue, discountReasonNote, expiresInSeconds } = req.body as {
      saleId?: string;
      itemIds?: string[];
      amount?: number;
      buyerEmail?: string;
      // Discount on catalog items (2026-09-29, money review P1-6/8): same fields and same
      // permission/cap/floor as POST /api/pos/payment-requests. discountValue is percent for
      // PERCENT and DOLLARS for FIXED. Omitted = no discount, and the link must then cover the
      // catalog price of its items.
      discountType?: string;
      discountValue?: number;
      discountReasonNote?: string;
      // Optional link lifetime. 60 seconds to 7 days; omitted keeps the 24 hour default.
      expiresInSeconds?: number;
      // Split tender (2026-09-29): whole cents already collected in cash. `amount` (dollars) is
      // then the CARD remainder the link charges; omitted / 0 = an ordinary all-card link.
      cashAmountCents?: number;
    };

    if (!saleId) return res.status(400).json({ message: 'saleId is required' });
    if (!itemIds || !Array.isArray(itemIds)) {
      return res.status(400).json({ message: 'itemIds must be non-empty array' });
    }
    if (itemIds.length > 200 || itemIds.some((id) => typeof id !== 'string' || id.trim() === '') || new Set(itemIds).size !== itemIds.length) {
      return res.status(400).json({ message: 'itemIds must be a list of unique item ids (at most 200)', code: 'INVALID_ITEM_IDS' });
    }
    // Bulk lots (ADR-136, #659) are sold at the register with cash, Venmo or Zelle only. Refuse before any money moves.
    const bulkRefusal = await bulkChannelRefusal(prisma as unknown as BulkLotDb, itemIds, isBulkLotsEnabled());
    if (bulkRefusal) return res.status(bulkRefusal.status).json({ message: bulkRefusal.message, code: bulkRefusal.code });
    let linkExpiresAt: Date | undefined;
    if (expiresInSeconds !== undefined && expiresInSeconds !== null) {
      if (
        typeof expiresInSeconds !== 'number' ||
        !Number.isInteger(expiresInSeconds) ||
        expiresInSeconds < PAYMENT_LINK_MIN_EXPIRY_SECONDS ||
        expiresInSeconds > PAYMENT_LINK_MAX_EXPIRY_SECONDS
      ) {
        return res.status(400).json({
          message: `expiresInSeconds must be a whole number between ${PAYMENT_LINK_MIN_EXPIRY_SECONDS} and ${PAYMENT_LINK_MAX_EXPIRY_SECONDS} (7 days)`,
          code: 'INVALID_EXPIRY',
        });
      }
      linkExpiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    }
    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ message: 'amount must be positive number (in dollars)' });
    }
    // Whole cents with a sane bound (2026-09-29): a fractional-cent or absurd amount used to reach
    // Square and come back as a 500.
    const linkAmountCents = Math.round(amount * 100);
    if (Math.abs(amount * 100 - linkAmountCents) > 1e-6 || !isValidCents(linkAmountCents)) {
      return res.status(400).json({
        message: `amount must be a whole number of cents, at most $${(MAX_POS_AMOUNT_CENTS / 100).toFixed(2)}`,
        code: 'INVALID_AMOUNT',
      });
    }
    const hasLinkCashLeg = cashAmountCents !== undefined && cashAmountCents !== null && cashAmountCents !== 0;
    if (hasLinkCashLeg && !isValidCents(cashAmountCents)) {
      return res.status(400).json({
        message: `cashAmountCents must be a whole number of cents greater than 0 and at most ${MAX_POS_AMOUNT_CENTS}`,
        code: 'INVALID_SPLIT_AMOUNT',
      });
    }
    const linkCashCents = hasLinkCashLeg ? (cashAmountCents as number) : 0;

    // Card-leg floor: same rule and same wording as the phone and manual-card paths. The link
    // charge is ONLINE-channel (the buyer completes it on their own device), so the fee floor is
    // computed the way createPaymentLinkInternal computes it.
    const linkFeeCents = calculateInclusiveCommissionCents(
      linkAmountCents,
      organizer.subscriptionTier as SubscriptionTier,
      'ONLINE'
    );
    const linkLegProblem = cardLegProblem({
      cardCents: linkAmountCents,
      appFeeCents: linkFeeCents,
      isSplit: linkCashCents > 0,
    });
    if (linkLegProblem) {
      return res.status(400).json({ message: linkLegProblem, code: 'CARD_AMOUNT_TOO_SMALL' });
    }

    // Verify sale belongs to organizer
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { organizerId: true },
    });

    if (!sale || sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Sale does not belong to your account' });
    }

    // Money review P1-4/5 + P1-6/8 (2026-09-29): every item must be an item of THIS sale and
    // organizer (404 otherwise, so a probe learns nothing about another tenant's ids), and the
    // link may not charge less than the catalog price of its items unless the discount is
    // authorized (APPLY_POS_DISCOUNT for team members, the workspace cap) and the catalog floor
    // `catalogSubtotal - discount - 1` holds. Same rule as createPaymentRequest, via the shared
    // helper. The total compared is everything the buyer pays across tenders (card + cash).
    let linkCatalogSubtotalCents = 0;
    if (itemIds.length > 0) {
      const scopedItems = await prisma.item.findMany({
        where: { id: { in: itemIds }, saleId, sale: { organizerId: organizer.id } },
        select: { id: true, price: true },
      });
      if (scopedItems.length !== itemIds.length) {
        return res.status(404).json({ message: 'One or more items were not found in this sale', code: 'ITEM_NOT_FOUND' });
      }
      linkCatalogSubtotalCents = Math.round(scopedItems.reduce((sum, it) => sum + (it.price ?? 0), 0) * 100);
    }
    const linkFloor = await authorizeDiscountAndCheckFloor({
      actor: organizer,
      catalogSubtotalCents: linkCatalogSubtotalCents,
      totalCents: linkAmountCents + linkCashCents,
      discount: { discountType, discountValue, discountReasonNote },
    });
    if (!linkFloor.ok) {
      return res.status(linkFloor.status).json({ message: linkFloor.message, code: linkFloor.code });
    }

    // Cash-fee exposure cap (2026-09-24 ruling) now applies to a split link's cash leg too
    // (2026-09-29), counting pending split cash as well as the accrued balance. Best-effort
    // check-then-create: the link row is created after an external Square call, so it cannot sit
    // inside a serializable transaction the way createPaymentRequest's insert does.
    if (linkCashCents > 0) {
      const linkCashRate = await resolveCashCommissionRate(organizer);
      const linkCashCommission = cashCommissionOn(linkCashCents / 100, linkCashRate);
      if (await wouldExceedCashFeeExposureCap({ organizerId: organizer.id, commission: linkCashCommission })) {
        return res.status(400).json({
          message:
            'This cash amount would exceed the outstanding cash-commission limit on your account. Settle your balance with a card sale first, or contact support.',
          code: 'CASH_FEE_EXPOSURE_CAP_EXCEEDED',
        });
      }
    }

    // Delegate to the shared internal — same Stripe Payment Link + QR logic the
    // markSold settlement router (CHECKOUT_LINK mode) reuses. Never flips items to SOLD.
    let result;
    try {
      result = await createPaymentLinkInternal({
        organizerId: organizer.id,
        stripeConnectId: organizer.stripeConnectId,
        subscriptionTier: organizer.subscriptionTier,
        saleId,
        itemIds,
        amount,
        buyerEmail,
        // Square changeover Wave S2 #4 (2026-09-09): `organizer` here is a ResolvedPosActor
        // (utils/posAuth.ts) which already resolves these two fields -- no extra query needed.
        squareOnboarded: organizer.squareOnboarded,
        squareMerchantId: organizer.squareMerchantId,
        ...(linkCashCents > 0 ? { cashAmountCents: linkCashCents } : {}),
        ...(linkExpiresAt ? { expiresAt: linkExpiresAt } : {}),
      });
    } catch (stripeErr) {
      if (stripeErr instanceof PaymentLinkItemScopeError) {
        return res.status(404).json({ message: stripeErr.message, code: 'ITEM_NOT_FOUND' });
      }
      if (stripeErr instanceof SquareOnboardingIncompleteError) {
        return res.status(409).json({
          message: "This seller isn't set up to accept online payments yet. Please contact the organizer to arrange your purchase.",
          code: 'SELLER_PAYMENTS_UNAVAILABLE',
        });
      }
      console.error('[pos] Payment link creation failed:', stripeErr);
      return res.status(500).json({ message: 'Failed to create payment link' });
    }

    res.json({
      linkId: result.linkId,
      paymentLinkUrl: result.paymentLinkUrl,
      qrCodeDataUrl: result.qrCodeDataUrl,
      amount: result.amount,
      // Split tender (2026-09-29): echo what was recorded so the register can show it.
      isSplitPayment: linkCashCents > 0,
      cashAmountCents: linkCashCents > 0 ? linkCashCents : undefined,
      cardAmountCents: linkCashCents > 0 ? linkAmountCents : undefined,
    });
  } catch (error) {
    console.error('[pos] createPaymentLink error:', error);
    res.status(500).json({ message: 'Failed to create payment link' });
  }
};

/**
 * GET /api/pos/payment-links/:linkId
 * Poll payment link status (organizer-only)
 *
 * Response: { linkId, status, amount, qrCodeDataUrl, completedAt }
 */
export const getPaymentLink = async (req: AuthRequest, res: Response) => {
  try {
    const organizer = await resolveOrganizerOrTeamMember(req, res, { requireStripe: false });
    if (!organizer) return;

    const { linkId } = req.params as { linkId?: string };
    if (!linkId) return res.status(400).json({ message: 'linkId required' });

    const link = await prisma.pOSPaymentLink.findUnique({
      where: { id: linkId },
      select: {
        id: true,
        organizerId: true,
        status: true,
        amount: true,
        qrCodeDataUrl: true,
        completedAt: true,
        isSplitPayment: true,
        cashAmountCents: true,
        cardAmountCents: true,
      },
    });

    if (!link) return res.status(404).json({ message: 'Payment link not found' });
    if (link.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Payment link does not belong to your account' });
    }

    // Cash-leg commission accrual for a PAID split link (2026-09-29). The recorder that flips a
    // link to COMPLETED (services/posPaymentLinkRecorder.ts, shared by the Square webhook and the
    // stranded-sale cron) lives outside this file's ownership and does not yet call the accrual,
    // so the register's own status poll heals it: the first poll that sees COMPLETED accrues the
    // cash leg, idempotently (CashFeeAccrual is unique per link id, so every later poll -- and the
    // recorder itself once it is wired -- is a no-op). A failure never fails the poll; it is
    // alerted to Sentry and the next poll retries.
    if (link.status === 'COMPLETED' && link.isSplitPayment && link.cashAmountCents && link.cashAmountCents > 0) {
      try {
        await accrueSplitCashLegOnce({
          organizer: {
            id: organizer.id,
            subscriptionTier: organizer.subscriptionTier,
            referralDiscountExpiry: organizer.referralDiscountExpiry,
          },
          sourceType: 'POS_PAYMENT_LINK',
          sourceId: link.id,
          cashAmountCents: link.cashAmountCents,
        });
      } catch (accrualErr: any) {
        console.error(`[pos] getPaymentLink: cash-leg commission accrual failed for link ${link.id}:`, accrualErr);
        try {
          Sentry.captureException(accrualErr instanceof Error ? accrualErr : new Error(String(accrualErr)), {
            tags: { area: 'pos-payment-link-split-cash-commission' },
            level: 'error',
            extra: { linkId: link.id, organizerId: organizer.id, cashAmountCents: link.cashAmountCents },
          });
        } catch {
          // Sentry may not be initialized -- silently continue
        }
      }
    }

    res.json({
      linkId: link.id,
      status: link.status,
      amount: link.amount / 100, // Convert back to dollars
      qrCodeDataUrl: link.qrCodeDataUrl,
      completedAt: link.completedAt,
      isSplitPayment: link.isSplitPayment,
      cashAmountCents: link.cashAmountCents ?? undefined,
      cardAmountCents: link.cardAmountCents ?? undefined,
    });
  } catch (error) {
    console.error('[pos] getPaymentLink error:', error);
    res.status(500).json({ message: 'Failed to fetch payment link' });
  }
};

/**
 * GET /api/pos/holds
 * Get active holds for a sale (organizer-only, for Invoice tile)
 *
 * Query: ?saleId=xxx
 * Response: { holds: Array<{reservationId, itemId, itemTitle, itemPrice, shopperId, shopperName, shopperEmail, expiresAt}> }
 */
export const getActiveHolds = async (req: AuthRequest, res: Response) => {
  try {
    const organizer = await resolveOrganizerOrTeamMember(req, res, { requireStripe: false });
    if (!organizer) return;

    const { saleId } = req.query as { saleId?: string };
    if (!saleId) return res.status(400).json({ message: 'saleId query param required' });

    // Verify sale belongs to organizer
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { organizerId: true },
    });

    if (!sale || sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Sale does not belong to your account' });
    }

    // Get active holds: PENDING or CONFIRMED, not expired, and free to invoice.
    // invoiceableWhere() covers both `invoiceId: null` AND "no live in-flight claim"
    // (P0 fix 2026-08-16 — the claim moved out of invoiceId into the dedicated non-FK
    // invoiceClaimToken/invoiceClaimedAt columns, so a bare `invoiceId: null` here would
    // surface holds another request is mid-way through invoicing).
    const holds = await prisma.itemReservation.findMany({
      where: {
        item: { saleId },
        status: { in: ['PENDING', 'CONFIRMED'] },
        expiresAt: { gt: new Date() },
        ...invoiceableWhere(),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        item: { select: { id: true, title: true, price: true } },
      },
      orderBy: { expiresAt: 'asc' },
    });

    const result = holds.map(h => ({
      reservationId: h.id,
      itemId: h.itemId,
      itemTitle: h.item.title,
      itemPrice: h.item.price,
      shopperId: h.userId,
      shopperName: h.user.name,
      shopperEmail: h.user.email,
      expiresAt: h.expiresAt,
    }));

    res.json({ holds: result });
  } catch (error) {
    console.error('[pos] getActiveHolds error:', error);
    res.status(500).json({ message: 'Failed to fetch active holds' });
  }
};

/**
 * POST /api/pos/holds/:reservationId/invoice
 *
 * NOTE: This endpoint may already exist in reservationController.ts as markSoldAndCreateInvoice.
 * If it does, this implementation is skipped and the existing endpoint at
 * POST /api/reservations/:id/mark-sold is used instead.
 *
 * If it does NOT exist: Send invoice for a hold (organizer-only)
 * Body: { deliverVia: 'EMAIL' }
 * Response: { invoiceId: string, status: 'SENT' }
 */
export const sendHoldInvoice = async (req: AuthRequest, res: Response) => {
  // Feature #397 (2026-09-29): Crew Invasion redemption taken for THIS attempt. Function scope
  // so the failure paths (and the outer catch) can give the code back; cleared as soon as the
  // HoldInvoice row exists. The release is fenced on the exact usedAt this attempt wrote.
  let crewRedemption: { codeId: string; usedAt: Date; userId: string } | null = null;
  const releaseCrewRedemption = async () => {
    if (!crewRedemption) return;
    const taken = crewRedemption;
    crewRedemption = null;
    await releaseCrewInvasionRedemption(taken.codeId, taken.usedAt, taken.userId);
  };

  // Money review P1-7 (2026-09-29): compensation for everything this request claims BEFORE a
  // HoldInvoice row exists. commitItemSale moves each item to INVOICE_ISSUED and takes the crew
  // code; when the Square link or the invoice row then fails, nothing used to put the items back,
  // so the held item (and every merged item) sat at INVOICE_ISSUED with no invoice, blocked from
  // sale until someone noticed. rollbackClaims gives the crew code back and reverts ONLY the items
  // this request committed, each to the status it had when read, guarded on INVOICE_ISSUED so an
  // item another path has since moved on is never dragged backwards. Idempotent: the list is
  // emptied as it goes and every write is conditional, so it is safe to call from a failure path
  // and again from the outer catch. `invoiceRowCreated` flips true the moment the HoldInvoice row
  // exists: from then on the invoice (and the expiry job) owns the items and this is a no-op.
  const committedItems: Array<{ id: string; priorStatus: string }> = [];
  let invoiceRowCreated = false;
  const rollbackClaims = async () => {
    await releaseCrewRedemption();
    if (invoiceRowCreated) return;
    while (committedItems.length > 0) {
      const c = committedItems.pop()!;
      try {
        await prisma.item.updateMany({
          where: { id: c.id, status: 'INVOICE_ISSUED' },
          data: { status: c.priorStatus as any },
        });
      } catch (revertErr) {
        console.error(`[pos] sendHoldInvoice: failed to revert item ${c.id} to ${c.priorStatus} after a failed invoice:`, revertErr);
        try {
          Sentry.captureException(revertErr instanceof Error ? revertErr : new Error(String(revertErr)), {
            tags: { area: 'pos-send-hold-invoice-rollback' },
            extra: { itemId: c.id, priorStatus: c.priorStatus },
          });
        } catch {
          // Sentry may not be initialized
        }
      }
    }
  };

  try {
    // Square-era gate (2026-09-29): this used to call resolveOrganizerOrTeamMember with
    // requireStripe:true, which admits ANY connected processor (stripeConnectId OR
    // squareOnboarded) and never checked squareMerchantId. Stripe's platform account is
    // permanently closed, so a Stripe-only organizer passed the gate, had the held item
    // atomically moved to INVOICE_ISSUED by commitItemSale below, and only THEN hit the
    // SquareOnboardingIncompleteError 409 at the bottom -- stranding the item. Same gate and
    // error code createPaymentLink uses: check exactly what can create the payment link,
    // before anything is claimed. requireStripe:false because this check replaces it.
    const organizer = await resolveOrganizerOrTeamMember(req, res, { requireStripe: false });
    if (!organizer) return;
    if (!organizer.squareOnboarded || !organizer.squareMerchantId) {
      return res.status(400).json({
        message: 'Invoices need a connected Square account. Finish Square setup in Settings, then try again.',
        code: 'SQUARE_NOT_CONNECTED',
      });
    }

    const { reservationId } = req.params as { reservationId?: string };
    const { deliverVia, expiryHours, miscItems, cashAmountCents } = req.body as {
      deliverVia?: string;
      expiryHours?: number;
      miscItems?: Array<{ id: string; itemId?: string; title: string; amount: number }>;
      // ADR-114 (2026-08-31): amount of cash already collected at the register before this
      // invoice goes out for the remaining balance -- mirrors createCombinedInvoice's
      // identically-named body field. Previously silently ignored here even though
      // PosInvoiceModal has sent it all along; the full total was always charged via card.
      cashAmountCents?: number;
    };

    if (!reservationId) return res.status(400).json({ message: 'reservationId required' });
    if (!deliverVia || deliverVia !== 'EMAIL') {
      return res.status(400).json({ message: 'deliverVia must be EMAIL (MVP)' });
    }
    if (typeof cashAmountCents === 'number' && cashAmountCents < 0) {
      return res.status(400).json({ message: 'cashAmountCents cannot be negative' });
    }
    if (
      cashAmountCents !== undefined &&
      cashAmountCents !== null &&
      (typeof cashAmountCents !== 'number' || !Number.isFinite(cashAmountCents) || cashAmountCents > MAX_POS_AMOUNT_CENTS)
    ) {
      return res.status(400).json({ message: 'cashAmountCents must be a number of cents within the allowed range', code: 'INVALID_SPLIT_AMOUNT' });
    }
    // expiryHours feeds `new Date(...)`: NaN or Infinity made an Invalid Date and a negative value an
    // already-expired invoice. Bounded to one week, like the QR link.
    if (
      expiryHours !== undefined &&
      expiryHours !== null &&
      (typeof expiryHours !== 'number' || !Number.isFinite(expiryHours) || expiryHours <= 0 || expiryHours > 168)
    ) {
      return res.status(400).json({ message: 'expiryHours must be between 0 and 168', code: 'INVALID_EXPIRY' });
    }
    // Money review P1-6/8 (2026-09-29): whole-cent amounts, bounded, titled, no duplicate items.
    const miscNormalized = normalizeMiscLines(miscItems);
    if (!miscNormalized.ok) {
      return res.status(miscNormalized.status).json({ message: miscNormalized.message, code: miscNormalized.code });
    }
    const miscLines = miscNormalized.lines;

    // Fetch reservation
    const reservation = await prisma.itemReservation.findUnique({
      where: { id: reservationId },
      include: {
        item: { select: { id: true, title: true, price: true, photoUrls: true, sale: { select: { id: true, organizerId: true } } } },
        user: { select: { id: true, email: true, name: true } },
      },
    });

    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });
    if (reservation.item.sale!.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Reservation does not belong to your sale' });
    }

    // Check if a real invoice already exists, or another request holds a live claim
    // (P0 fix 2026-08-16 — see services/holdInvoiceClaim.ts).
    if (isInvoicedOrClaimed(reservation)) {
      return res.status(400).json({ message: 'Invoice already exists for this reservation' });
    }

    // Feature #397 (2026-09-29): an explicitly supplied Crew Invasion code (organizer typing the
    // shopper's code at the register) is validated BEFORE any item is claimed, so a bad code is
    // a clean 400 (invalid / wrong sale / not this shopper's crew / used / expired) rather than
    // an error after the held item has already moved to INVOICE_ISSUED. Without a code, the
    // shopper's active crew code auto-applies further below.
    const providedCrewCode: string | null =
      typeof (req.body as any)?.crewInvasionCode === 'string' && (req.body as any).crewInvasionCode.trim()
        ? (req.body as any).crewInvasionCode
        : null;
    if (providedCrewCode) {
      const codeCheck = await validateCrewInvasionCode({
        codeText: providedCrewCode,
        saleId: reservation.item.sale!.id,
        shopperUserId: reservation.userId,
      });
      if (!codeCheck.ok) {
        return res.status(codeCheck.rejection.status).json({ message: codeCheck.rejection.message, code: codeCheck.rejection.code });
      }
    }

    // ADR-098 (2026-07-29): re-verify + atomically claim the held item before invoicing it.
    // This endpoint previously never read Item.status or Purchase at all -- it relied
    // entirely on ItemReservation.status (already checked above via reservation lookup),
    // which left a gap: a hold created minutes ago on an item since sold through a
    // *different* channel (e.g. the generic single-item edit path, or a race against
    // Terminal/checkout) could still be invoiced and paid (ADR-098 Section 3 point 1).
    // A plain read-only precondition check would NOT close this race (that's exactly the
    // TOCTOU gap Option B eliminates) -- so this atomically transitions Item.status to
    // INVOICE_ISSUED, matching the same value reservationController.ts's own hold-to-pay
    // path already writes at invoice time (see markSoldAndCreateInvoice). The Stripe
    // webhook remains the sole SOLD-setter once payment is actually captured.
    // Money review P1-4/5 + P1-6/8 (2026-09-29): validate EVERYTHING the request names, and price it,
    // BEFORE any item is claimed, so a bad request is a clean 4xx with nothing to undo.
    //  - The held item and every merged item (a misc line carrying an itemId) must be an item of
    //    THIS sale and THIS organizer. commitItemSale below flips whatever id it is given, so an
    //    unscoped merged itemId used to let a cashier invoice (and then sell) another tenant's
    //    item. 404 rather than 403: a probe learns nothing about ids it does not own.
    //  - Prior item statuses are read here so a failed invoice can put each item back exactly.
    //  - Lines and discounts are priced by evaluateInvoicePricing: whole cents, no negative total,
    //    and any discount needs the discount permission, the workspace cap and the catalog floor.
    const invoiceSaleId = reservation.item.sale!.id;
    const mergedItemIdsRequested = miscLines.filter((l) => l.itemId).map((l) => l.itemId as string);
    if (mergedItemIdsRequested.includes(reservation.itemId)) {
      return res.status(400).json({ message: 'The held item cannot also be added as an extra line', code: 'INVALID_MISC_ITEMS' });
    }
    const scopedInvoiceItems = await prisma.item.findMany({
      where: { id: { in: [reservation.itemId, ...mergedItemIdsRequested] }, saleId: invoiceSaleId, sale: { organizerId: organizer.id } },
      select: { id: true, price: true, status: true },
    });
    if (scopedInvoiceItems.length !== 1 + mergedItemIdsRequested.length) {
      return res.status(404).json({ message: 'One or more items were not found in this sale', code: 'ITEM_NOT_FOUND' });
    }
    const priorStatusByItemId = new Map<string, string>(scopedInvoiceItems.map((it): [string, string] => [it.id, it.status as string]));
    const mergedListCents = new Map<string, number>(
      scopedInvoiceItems.filter((it) => it.id !== reservation.itemId).map((it): [string, number] => [it.id, Math.round((it.price ?? 0) * 100)])
    );
    const heldItemTotal = Math.round((reservation.item.price ?? 0) * 100); // in cents
    const invoicePricing = await evaluateInvoicePricing({
      actor: organizer,
      heldItemCents: heldItemTotal,
      lines: miscLines,
      mergedListCents,
    });
    if (!invoicePricing.ok) {
      return res.status(invoicePricing.status).json({ message: invoicePricing.message, code: invoicePricing.code });
    }
    const miscTotal = invoicePricing.miscTotalCents;

    // Cash-fee exposure cap (2026-09-24 ruling, money review P2 2026-09-29). The cash leg of a
    // hold invoice accrues commission to the organizer's cash-fee balance when it is recorded, but
    // this path never asked the cap whether that was allowed: an organizer at the $100 cap could
    // keep taking cash through hold invoices. The cash actually taken is bounded by the total, so
    // the check uses the same clamp as below (the crew discount can only lower it, so this is
    // conservative). Outstanding cash legs on OTHER still-pending hold invoices are added on top:
    // they will accrue when paid and cashFeeService.wouldExceedCashFeeExposureCap does not see
    // them yet (it counts split payment requests and links only).
    const requestedCashCents = Number.isFinite(cashAmountCents) ? Math.max(0, Math.round(cashAmountCents as number)) : 0;
    const cashLegForCap = Math.min(requestedCashCents, invoicePricing.grandTotalCents);
    if (cashLegForCap > 0) {
      const holdCashRate = await resolveCashCommissionRate(organizer);
      let commissionOnThisCash = cashCommissionOn(cashLegForCap / 100, holdCashRate);
      try {
        const pendingHoldCash = await prisma.holdInvoice.aggregate({
          where: { status: 'PENDING', cashAmountCents: { gt: 0 }, sale: { organizerId: organizer.id } },
          _sum: { cashAmountCents: true },
        });
        commissionOnThisCash += cashCommissionOn((pendingHoldCash._sum.cashAmountCents ?? 0) / 100, holdCashRate);
      } catch (pendingErr) {
        console.warn('[pos] sendHoldInvoice: could not total pending hold-invoice cash for the exposure cap (continuing with this invoice only):', pendingErr);
      }
      if (await wouldExceedCashFeeExposureCap({ organizerId: organizer.id, commission: commissionOnThisCash })) {
        return res.status(400).json({
          message:
            'This cash amount would exceed the outstanding cash-commission limit on your account. Settle your balance with a card sale first, or contact support.',
          code: 'CASH_FEE_EXPOSURE_CAP_EXCEEDED',
        });
      }
    }

    try {
      await commitItemSale(reservation.itemId, 'INVOICE_ISSUED', ['AVAILABLE', 'RESERVED']);
      committedItems.push({ id: reservation.itemId, priorStatus: priorStatusByItemId.get(reservation.itemId) ?? 'RESERVED' });
    } catch (guardError) {
      if (guardError instanceof ItemAlreadyCommittedError) {
        return res.status(409).json({ message: 'This item is no longer available to invoice -- it may have already been sold or invoiced elsewhere.' });
      }
      throw guardError;
    }

    // Calculate total: held item + misc items (priced and validated above)
    let grandTotal = invoicePricing.grandTotalCents;
    const holdFeeRate = getInclusivePlatformFeeRate(organizer.subscriptionTier as SubscriptionTier, 'ONLINE');

    // ADR-114 (2026-08-31): cash/card split, ported from createCombinedInvoice's
    // already-tested math (posCombinedInvoiceFee.test.ts) rather than re-derived --
    // clamp any cash collected to the grand total, the card leg covers the remainder,
    // and the platform fee is computed on the CARD portion only (no fee on cash, matching
    // createCombinedInvoice's documented intentional asymmetry -- there is no
    // Organizer.cashFeeBalance accrual for a hold-invoice cash leg).
    // Security-QA hardening (2026-08-31): coerce to a non-negative integer before use --
    // a non-integer or NaN cashAmountCents would otherwise flow into an Int? column
    // (HoldInvoice.cashAmountCents) and into Stripe's unit_amount_decimal computation below,
    // risking a 500 from Prisma/Stripe rather than a clean, predictable clamp. This cannot be
    // used to reduce the platform fee below its correct value -- Math.min still bounds it to
    // grandTotal either way, so the fee floor stays exactly proportional to the real card leg.
    const safeCashAmountCents = Number.isFinite(cashAmountCents) ? Math.max(0, Math.round(cashAmountCents as number)) : 0;
    let finalCashAmountCents = Math.min(safeCashAmountCents, grandTotal);
    let cardAmountCents = grandTotal - finalCashAmountCents;
    let platformFeeAmount = calculateInclusiveCommissionCents(cardAmountCents, organizer.subscriptionTier as SubscriptionTier, 'ONLINE');

    // P0 fix (2026-08-17): HoldInvoice.reservationId is @unique
    // (HoldInvoice_reservationId_key, confirmed live in Postgres) and, before this,
    // nothing ever nulled it -- one released or expired invoice bricked that hold
    // forever with P2002 on the next attempt, on ALL THREE creation paths including
    // this one. Terminal transitions now null the anchor; this clears any dead anchor
    // left behind before that shipped. See services/holdInvoiceClaim.ts.
    await releaseDeadInvoiceAnchors(prisma, [reservationId]);

    // Same Math.min() clamp reservationController.ts's markSoldAndCreateInvoice already
    // applies -- an organizer-supplied expiryHours must never outlive the hold's own
    // expiresAt (ADR-098 follow-up). Hoisted above the Stripe call (previously inline in
    // the HoldInvoice.create below) so the SAME value can clamp the Stripe session's
    // expires_at too.
    const expiresAt = expiryHours
      ? new Date(Math.min(Date.now() + expiryHours * 60 * 60 * 1000, reservation.expiresAt.getTime()))
      : reservation.expiresAt;

    // P0 fix (2026-08-25, Charge C investigation -- STATE.md S-PAYMENT-INVOICE-GAPS-2026-08-25):
    // this used to create a HoldInvoice with NO Stripe Checkout Session at all ("simplified
    // for MVP" -- the removed comment that used to sit here). It was fundamentally unpayable:
    // the email CTA and the in-app notification both linked to a /my-invoices/[id] page that
    // has never existed anywhere in packages/frontend/pages, the item page's "Complete
    // Payment" button silently no-opped (itemController.buildHoldFieldsForViewer only returns
    // a real invoiceCheckoutUrl when stripeSessionId is set), and the "in-app payment popup"
    // the HOLD_INVOICE socket emit below claims to open has no listener anywhere in the
    // frontend (grepped every socket.on(...) call site -- confirmed, not assumed). Wired below
    // to mirror createCombinedInvoice's Stripe Checkout Session creation: same
    // idempotency-key-per-attempt pattern, same useDirect routing, same expires_at clamp, same
    // invoiceId metadata backfill once the HoldInvoice row exists so the payment webhook
    // (stripeController.ts, keyed on paymentIntent.metadata.invoiceId) can find it.
    // Stripe removal (2026-09-12) cleanup: this file's earlier Stripe-removal pass
    // (same session) deleted the ~330-line Stripe Checkout Session + PaymentIntent
    // block that used to sit here and replaced it with the SquareOnboardingIncompleteError
    // throw further down, but left several pieces of now-orphaned computation behind that
    // only ever fed that deleted Stripe session-creation call: the expires_at clamp
    // (`checkoutExpiry`), `baseUrl`, and the `line_items` array (built here and via
    // `.push` in the merged-item loop below). All removed outright. The merged-item loop
    // itself is KEPT -- `mergedRealItemIds` is still real, still-needed input to both the
    // cash-only and Square HoldInvoice branches further down.
    //
    // P0 fix (S-PAYMENT-INVOICE-GAPS-2026-08-25): a merged real hold (handleLoadHold's
    // same-shopper-same-sale merge in pos.tsx) arrives here as a miscItem that DOES carry a
    // real itemId (pos.tsx / PosInvoiceModal.tsx CartItem both have itemId?: string) -- only
    // a genuinely ad-hoc, non-inventory charge would ever lack one. Previously this itemId was
    // silently discarded, so it never got bundled into HoldInvoice.itemIds and its payment was
    // unrecoverable after the fact. See ADR:
    // claude_docs/feature-notes/hold-invoice-merged-item-bundling-adr-2026-08-25.md
    const mergedRealItemIds: string[] = mergedItemIdsRequested;

    // ADR-113 (2026-08-28): the anchor item gets commitItemSale + a reservation.invoiceId
    // stamp (below), but until this fix a merged real item got NEITHER -- its Item.status
    // stayed RESERVED and its ItemReservation.invoiceId stayed null for the whole time this
    // invoice is outstanding, even though it IS correctly bundled into HoldInvoice.itemIds
    // (2026-08-25 fix) and gets sold/Purchase'd on payment. Real consequence: isInvoicedOrClaimed
    // / invoiceableWhere() (holdInvoiceClaim.ts) key off exactly those two fields, so nothing
    // stopped a second, independent invoice from being issued against the same merged item
    // while this one is still open -- a genuine double-invoice race, not cosmetic bookkeeping.
    // Committed here, BEFORE the Stripe Checkout Session is created below, mirroring exactly
    // why the anchor's own commitItemSale (above) runs before any Stripe call -- catch a losing
    // race before money moves, not after.
    for (const mergedItemId of mergedRealItemIds) {
      try {
        await commitItemSale(mergedItemId, 'INVOICE_ISSUED', ['AVAILABLE', 'RESERVED']);
        committedItems.push({ id: mergedItemId, priorStatus: priorStatusByItemId.get(mergedItemId) ?? 'RESERVED' });
      } catch (guardError) {
        // Undo the anchor (and any merged item already claimed): the invoice is not going out.
        await rollbackClaims();
        if (guardError instanceof ItemAlreadyCommittedError) {
          return res.status(409).json({ message: 'One of the additional items is no longer available to invoice -- it may have already been sold or invoiced elsewhere.' });
        }
        throw guardError;
      }
    }

    // Feature #397 (2026-09-29): Crew Invasion redemption -- hold-pricing code.
    // Discount base = the anchor held item plus any merged REAL held items (miscItems that carry
    // an itemId), each priced from the database and only if the row is a hold of THIS shopper at
    // THIS sale; a merged item billed below list price contributes the lower of the two. Ad hoc
    // misc lines never count. If the register already applied its own discount (a negative misc
    // line), the shopper gets the LARGER of the two, never the sum: only the excess is added.
    // Applied BEFORE the fee is recomputed, so the platform fee is charged on the discounted
    // price; the floor keeps the charge at or above CREW_INVASION_MIN_CHARGE_CENTS. The code is
    // atomically consumed here and given back by releaseCrewRedemption() if no HoldInvoice row
    // gets created below.
    let crewDiscountCents = 0;
    let crewDiscountInfo: { code: string; discountPct: number } | null = null;
    {
      let eligibleBaseCents = heldItemTotal;
      if (mergedRealItemIds.length > 0) {
        const mergedHolds = await prisma.itemReservation.findMany({
          where: {
            itemId: { in: mergedRealItemIds },
            userId: reservation.userId,
            item: { saleId: reservation.item.sale!.id },
          },
          select: { itemId: true, item: { select: { price: true } } },
        });
        const billedByItemId = new Map<string, number>();
        for (const m of miscLines) {
          if (m.itemId) billedByItemId.set(m.itemId, m.amountCents);
        }
        for (const h of mergedHolds) {
          const listCents = Math.round((h.item.price ?? 0) * 100);
          const billedCents = billedByItemId.get(h.itemId) ?? listCents;
          eligibleBaseCents += Math.max(0, Math.min(listCents, billedCents));
        }
      }
      const otherDiscountCents = miscLines.reduce((sum, m) => (m.amountCents < 0 ? sum - m.amountCents : sum), 0);
      const crewResult = await applyCrewInvasionDiscount({
        saleId: reservation.item.sale!.id,
        shopperUserId: reservation.userId,
        eligibleBaseCents,
        chargeableTotalCents: grandTotal,
        otherDiscountCents,
        providedCode: providedCrewCode,
      });
      if (crewResult.applied) {
        crewRedemption = { codeId: crewResult.codeId, usedAt: crewResult.usedAt, userId: crewResult.userId };
        crewDiscountCents = crewResult.discountCents;
        crewDiscountInfo = { code: crewResult.code, discountPct: crewResult.discountPct };
        grandTotal -= crewDiscountCents;
        finalCashAmountCents = Math.min(safeCashAmountCents, grandTotal);
        cardAmountCents = grandTotal - finalCashAmountCents;
        platformFeeAmount = calculateInclusiveCommissionCents(cardAmountCents, organizer.subscriptionTier as SubscriptionTier, 'ONLINE');
      }
    }

    // ADR-114 (2026-08-31): fully-cash invoice -- the organizer already collected the
    // whole amount in cash at the register, so there is nothing left for the shopper to
    // pay online. Skip Stripe entirely (no Checkout Session, no card charge) and record
    // the sale as PAID immediately via the same single-source-of-truth recorder the
    // Stripe webhook and invoiceExpiryJob's reconcile branch use (holdInvoicePaymentRecorder.ts) --
    // it already flips the reservation(s) to COMPLETED, marks the item(s) SOLD, creates
    // Purchase row(s) (source 'POS', no fabricated PaymentIntent id -- stripePaymentIntentId
    // is stored as null throughout, matching Purchase.stripePaymentIntentId's nullable
    // column, never a synthetic placeholder string), awards shopper XP, emits the
    // HOLD_RELEASED live-feed event, and sends the same "Payment Confirmed" emails a real
    // Stripe payment would.
    if (cardAmountCents <= 0) {
      const cashOnlyInvoice = await prisma.holdInvoice.create({
        data: {
          reservationId,
          shopperUserId: reservation.userId,
          organizerUserId: organizer.ownerUserId,
          saleId: reservation.item.sale!.id,
          itemIds: [reservation.itemId, ...mergedRealItemIds],
          totalAmount: grandTotal,
          platformFeeAmount, // 0 -- no platform fee on a cash-only leg (matches createCombinedInvoice)
          status: 'PENDING',
          expiresAt,
          stripeSessionId: null,
          stripePaymentIntentId: null,
          cashAmountCents: finalCashAmountCents > 0 ? finalCashAmountCents : null,
          cardAmountCents: null,
          // NULL/NULL -- mirrors createCombinedInvoice's own 100%-cash branch (no Stripe
          // session is ever created there either, see its "chargeType: createdChargeType"
          // comment): there is no real charge, so there is no charge shape to snapshot.
          chargeType: null,
          stripeAccountId: null,
        },
      });
      invoiceRowCreated = true; // the invoice owns the items from here (see rollbackClaims)

      // The invoice now exists and carries the discounted total: the code stays consumed.
      // Per-member redemption (2026-09-29): link it to this invoice so releaseInvoice /
      // invoiceExpiryJob can restore it if the invoice dies unpaid.
      if (crewRedemption) {
        await linkCrewInvasionRedemptionToInvoice({
          codeId: crewRedemption.codeId,
          userId: crewRedemption.userId,
          usedAt: crewRedemption.usedAt,
          holdInvoiceId: cashOnlyInvoice.id,
        });
      }
      crewRedemption = null;

      await prisma.itemReservation.update({
        where: { id: reservationId },
        data: { invoiceId: cashOnlyInvoice.id },
      });
      if (mergedRealItemIds.length > 0) {
        await prisma.itemReservation.updateMany({
          where: { itemId: { in: mergedRealItemIds }, item: { saleId: invoiceSaleId } },
          data: { invoiceId: cashOnlyInvoice.id },
        });
      }

      const paidResult = await markHoldInvoicePaid(
        cashOnlyInvoice.id,
        { processor: 'STRIPE', externalPaymentId: null }, // Square changeover Wave S1 (2026-09-09): generalized signature, zero behavior change for this cash-only Stripe-column write
        { source: 'pos-cash' }
      );
      if (paidResult.deadInvoice || (!paidResult.recorded && !paidResult.alreadyPaid)) {
        // Effectively unreachable (the invoice was just created PENDING above, nothing else
        // could have raced it), but fail loudly rather than silently claim a payment that
        // was not actually recorded.
        console.error(`[pos] sendHoldInvoice: cash-only invoice ${cashOnlyInvoice.id} failed to record as paid.`);
        return res.status(500).json({ message: 'Failed to record cash payment for this invoice.' });
      }

      return res.json({
        invoiceId: cashOnlyInvoice.id,
        status: 'PAID',
        cashAmountCents: finalCashAmountCents,
        cardAmountCents: 0,
        platformFeeAmount,
        totalAmountCents: grandTotal,
        crewInvasionDiscount: crewDiscountInfo
          ? { code: crewDiscountInfo.code, discountPct: crewDiscountInfo.discountPct, amountOffCents: crewDiscountCents }
          : null,
      });
    }

    // Square changeover Wave S2 #3 (2026-09-09): Square-connected organizer branch for the
    // card/balance-due leg. Same server-determined processor-selection signal used by
    // bountyController.ts's completeBountyPurchase / squarePaymentEligibilityService.ts's
    // own gate (squareOnboarded === true && squareMerchantId present). `organizer` here is
    // a ResolvedPosActor (utils/posAuth.ts) -- squareOnboarded/squareMerchantId are already
    // resolved on it, no extra query needed. Existing Stripe-only organizers fall through
    // to the untouched Stripe branch below -- zero behavior change for them. The fully-cash
    // branch above already returned before this point and never touches a processor at
    // all, so it is unaffected either way.
    const organizerHasSquare = organizer.squareOnboarded === true && !!organizer.squareMerchantId;

    if (organizerHasSquare) {
      // Pre-generated so the SAME id can be embedded in the Square Payment Link's
      // paymentNote (Square has no way to backfill it after creation) -- see
      // holdInvoiceSquareCheckoutHelper.ts's header comment for the full rationale.
      const holdInvoiceId = generateHoldInvoiceId();
      const squareDescription = (finalCashAmountCents > 0
        ? `Balance due -- remaining balance after $${(finalCashAmountCents / 100).toFixed(2)} cash collected at checkout`
        : (reservation.item.title || 'FindA.Sale payment'))
        + (crewDiscountInfo ? ` (Crew Invasion ${crewDiscountInfo.discountPct}% off applied)` : '');

      let squareResult;
      try {
        squareResult = await createHoldInvoiceSquareCheckout({
          organizerId: organizer.id,
          holdInvoiceId,
          amountCents: cardAmountCents,
          description: squareDescription,
          appFeeCents: platformFeeAmount,
        });
      } catch (squareError: any) {
        await rollbackClaims();
        if (squareError instanceof SquareOnboardingIncompleteError) {
          return res.status(409).json({
            message: "This seller isn't set up to accept online payments yet. Please contact the organizer to arrange your purchase.",
            code: 'SELLER_PAYMENTS_UNAVAILABLE',
          });
        }
        console.error('[pos] sendHoldInvoice: Square payment link creation failed:', squareError);
        // 2026-09-30: no raw processor text to the client (it is logged above); a stable code instead.
        return res.status(400).json({ message: 'Failed to create Square payment link', code: 'SQUARE_PAYMENT_LINK_FAILED' });
      }

      if (!squareResult.ok) {
        await rollbackClaims();
        return res.status(402).json({ message: squareResult.message, code: 'SQUARE_PAYMENT_LINK_FAILED' });
      }

      // Money review P1-7 (2026-09-29): from here the Square link is live and payable. If the
      // invoice row cannot be saved, cancel the link (a shopper must not be able to pay a link no
      // record will ever reconcile) and put the claimed items back, then let the outer catch
      // answer 500. A link that also fails to cancel is reported loudly: it needs a human.
      let squareHoldInvoice: HoldInvoice;
      try {
      squareHoldInvoice = await prisma.holdInvoice.create({
        data: {
          id: holdInvoiceId,
          reservationId,
          shopperUserId: reservation.userId,
          organizerUserId: organizer.ownerUserId,
          saleId: reservation.item.sale!.id,
          itemIds: [reservation.itemId, ...mergedRealItemIds],
          totalAmount: grandTotal,
          platformFeeAmount,
          status: 'PENDING',
          expiresAt,
          processor: 'SQUARE',
          stripeSessionId: null,
          stripePaymentIntentId: null,
          // Square changeover Wave S3 follow-up (2026-09-09): persist the identifiers
          // createHoldInvoiceSquareCheckout returned now that HoldInvoice has columns for
          // them -- lets squareWebhookController.ts's direct squareOrderId match find this
          // row without relying solely on the paymentNote-decode fallback.
          squarePaymentLinkId: squareResult.paymentLinkId,
          squareOrderId: squareResult.orderId,
          cashAmountCents: finalCashAmountCents > 0 ? finalCashAmountCents : null,
          cardAmountCents: cardAmountCents > 0 ? cardAmountCents : null,
          // Stripe-specific charge-shape snapshot fields -- left null for a Square row,
          // same posture bountyController.ts's Square Purchase rows already use.
          chargeType: null,
          stripeAccountId: null,
        },
      });
      } catch (createErr) {
        try {
          const del = await deleteSquareCheckoutLink({ organizerId: organizer.id, paymentLinkId: squareResult.paymentLinkId });
          if (!del.ok) throw new Error(`Square refused to cancel the link: ${del.code}`);
        } catch (delErr) {
          console.error(`[pos] sendHoldInvoice: ORPHANED-SQUARE-LINK ${squareResult.paymentLinkId} could not be cancelled after the invoice row failed to save:`, delErr);
          try {
            Sentry.captureException(delErr instanceof Error ? delErr : new Error(String(delErr)), {
              tags: { area: 'pos-send-hold-invoice-orphan-link' },
              extra: { holdInvoiceId, squarePaymentLinkId: squareResult.paymentLinkId, squareOrderId: squareResult.orderId },
            });
          } catch {
            // Sentry may not be initialized
          }
        }
        await rollbackClaims();
        throw createErr;
      }
      invoiceRowCreated = true; // the invoice owns the items from here (see rollbackClaims)

      // The invoice now exists and carries the discounted total: the code stays consumed.
      // Per-member redemption (2026-09-29): link it to this invoice so releaseInvoice /
      // invoiceExpiryJob can restore it if the invoice dies unpaid.
      if (crewRedemption) {
        await linkCrewInvasionRedemptionToInvoice({
          codeId: crewRedemption.codeId,
          userId: crewRedemption.userId,
          usedAt: crewRedemption.usedAt,
          holdInvoiceId: squareHoldInvoice.id,
        });
      }
      crewRedemption = null;

      await prisma.itemReservation.update({
        where: { id: reservationId },
        data: { invoiceId: squareHoldInvoice.id },
      });
      if (mergedRealItemIds.length > 0) {
        await prisma.itemReservation.updateMany({
          where: { itemId: { in: mergedRealItemIds }, item: { saleId: invoiceSaleId } },
          data: { invoiceId: squareHoldInvoice.id },
        });
      }

      // Send email (mirrors the Stripe branch's own email below, pointed at the Square
      // payment link URL instead of a Stripe Checkout URL).
      let squareEmailWarning: string | null = null;
      try {
        const { buildEmail } = await import('../services/emailTemplateService');
        const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';

        // 2026-09-29: item and line titles and the shopper name are free text (organizer- and
        // shopper-controlled) going into the HTML body, which buildEmail does NOT escape (it escapes
        // only headline/preheader). Escaped here; amounts come from validated whole-cent lines.
        let itemsList = `<strong>${escapeHtml(reservation.item.title)}</strong> - $${(heldItemTotal / 100).toFixed(2)}`;
        if (miscLines.length > 0) {
          const miscItemsHtml = miscLines
            .map(line => `<strong>${escapeHtml(line.title)}</strong> - $${(line.amountCents / 100).toFixed(2)}`)
            .join('<br/>');
          itemsList += '<br/>' + miscItemsHtml;
        }

        const html = buildEmail({
          preheader: `Invoice for your hold`,
          headline: `Invoice: ${reservation.item.title}${miscLines.length > 0 ? ' + more' : ''}`,
          body: `<p>Hi ${escapeHtml(reservation.user.name)},</p><p>Your hold is ready for payment:</p><p>${itemsList}</p>${crewDiscountInfo ? `<p>Crew Invasion discount (${crewDiscountInfo.discountPct}% off your held items): -$${(crewDiscountCents / 100).toFixed(2)}</p>` : ''}<p><strong>Total: $${(grandTotal / 100).toFixed(2)}</strong></p>`,
          ctaText: 'Complete Payment',
          ctaUrl: squareResult.url,
          accentColor: '#10b981',
        });

        const emailResult = await transactionalEmailService.emails.send({
          from: fromEmail,
          to: reservation.user.email,
          subject: `Invoice: ${reservation.item.title}`,
          html,
        });

        if (!emailResult.sent) {
          squareEmailWarning = `Invoice created, but the email could not be delivered (${emailResult.reason ?? 'unknown reason'}). Share the payment link with the shopper directly.`;
          console.warn(`[pos] sendHoldInvoice: email not sent (reason=${emailResult.reason}) to ${reservation.user.email}`);
        }
      } catch (emailErr: any) {
        squareEmailWarning = 'Invoice created, but the email failed to send. Share the payment link with the shopper directly.';
        console.warn('[pos] sendHoldInvoice: Failed to send invoice email (Square):', emailErr);
      }

      try {
        const io = getIO();
        io.to(`user:${reservation.userId}`).emit('HOLD_INVOICE', {
          type: 'HOLD_INVOICE',
          invoiceId: squareHoldInvoice.id,
          total: grandTotal / 100,
          expiresAt: squareHoldInvoice.expiresAt,
          itemTitle: reservation.item.title,
          checkoutUrl: squareResult.url,
        });
      } catch (socketErr) {
        console.warn('[pos] Failed to emit HOLD_INVOICE socket event (Square):', socketErr);
      }

      try {
        await createNotification({
          userId: reservation.userId,
          type: 'hold_invoice',
          title: 'Invoice Ready',
          body: `Your invoice for ${reservation.item.title} is ready. Total: $${(grandTotal / 100).toFixed(2)}`,
          link: squareResult.url,
        });
      } catch (notifErr) {
        console.warn('[pos] Failed to create hold invoice notification (Square):', notifErr);
      }

      return res.json({
        invoiceId: squareHoldInvoice.id,
        status: 'SENT',
        checkoutUrl: squareResult.url,
        cashAmountCents: finalCashAmountCents > 0 ? finalCashAmountCents : null,
        cardAmountCents,
        platformFeeAmount,
        totalAmountCents: grandTotal,
        // Feature #397: the discount line for the invoice (null when no crew code applied).
        crewInvasionDiscount: crewDiscountInfo
          ? { code: crewDiscountInfo.code, discountPct: crewDiscountInfo.discountPct, amountOffCents: crewDiscountCents }
          : null,
        ...(squareEmailWarning ? { emailWarning: squareEmailWarning } : {}),
      });
    }

    // Stripe removal (2026-09-12): this organizer has no Square account connected, and
    // the platform's Stripe account is permanently closed -- there is no processor left
    // to send a hold invoice through. The ~330-line Stripe Checkout Session + PaymentIntent
    // hold-invoice path that used to live here is guaranteed to fail against a dead account,
    // so it is removed rather than left to hard-fail unpredictably. Fail closed with the
    // same SquareOnboardingIncompleteError/SELLER_PAYMENTS_UNAVAILABLE shape every other
    // Square-gated endpoint in this codebase already uses.
    throw new SquareOnboardingIncompleteError(organizer.id);
  } catch (error) {
    // Feature #397: no HoldInvoice row was committed on this path (crewRedemption is cleared
    // the moment one is), so give the crew's one-use code back. Money review P1-7 (2026-09-29):
    // and put back every item this request claimed (a no-op once the invoice row exists).
    await rollbackClaims();
    if (error instanceof SquareOnboardingIncompleteError) {
      return res.status(409).json({
        message: "This seller isn't set up to accept online payments yet. Please contact the organizer to arrange your purchase.",
        code: 'SELLER_PAYMENTS_UNAVAILABLE',
      });
    }
    console.error('[pos] sendHoldInvoice error:', error);
    res.status(500).json({ message: 'Failed to send invoice' });
  }
};

/** Max payment-link emails one organizer can send per hour (2026-09-30, phishing-relay hardening). */
export const PAYMENT_LINK_EMAIL_MAX_PER_HOUR = 20;
const PAYMENT_LINK_EMAIL_WINDOW_SECONDS = 60 * 60;
// In-memory fallback window used only when Redis is unavailable (Redis is the shared, multi-instance source
// of truth). Per process, so it is a weaker cap than Redis, but it still bounds a single instance.
const paymentLinkEmailLocalWindows = new Map<string, { count: number; resetAt: number }>();

/** Test hook: clears the in-memory fallback counters. */
export const __resetPaymentLinkEmailLimiterForTests = (): void => paymentLinkEmailLocalWindows.clear();

/**
 * True when this organizer already used up its hourly allowance of payment-link emails. Counts the attempt
 * being checked. Redis fixed window first; per-process memory when Redis is not connected.
 */
async function paymentLinkEmailRateLimited(organizerId: string): Promise<boolean> {
  const redisCount = await redisIncrWithWindow(`rl:pos-link-email:${organizerId}`, PAYMENT_LINK_EMAIL_WINDOW_SECONDS);
  if (redisCount !== null) return redisCount > PAYMENT_LINK_EMAIL_MAX_PER_HOUR;
  const now = Date.now();
  const entry = paymentLinkEmailLocalWindows.get(organizerId);
  if (!entry || entry.resetAt <= now) {
    paymentLinkEmailLocalWindows.set(organizerId, { count: 1, resetAt: now + PAYMENT_LINK_EMAIL_WINDOW_SECONDS * 1000 });
    return false;
  }
  entry.count += 1;
  return entry.count > PAYMENT_LINK_EMAIL_MAX_PER_HOUR;
}

/** A plain single mailbox: no whitespace, control characters, angle brackets, quotes, or list separators. */
export function isPlainEmailAddress(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v || v.length > 254) return false;
  return /^[^\s@<>",;:()\[\]\\]{1,64}@[^\s@<>",;:()\[\]\\]+\.[^\s@<>",;:()\[\]\\]{2,}$/.test(v);
}

/**
 * POST /api/pos/payment-links/email
 * Email a shopper the organizer's OWN active payment link (Square hosted checkout) via the platform sender.
 * Used when the organizer generates a QR code and wants to also email the link.
 *
 * Body: { linkId: string, buyerEmail: string }
 *
 * SECURITY (2026-09-30, payment review finding 1): this used to email ANY address a caller-supplied
 * paymentLinkUrl and amount from the platform sender, i.e. an open phishing relay signed by our domain.
 * The server now looks the link up itself: it must be an ACTIVE, unexpired POSPaymentLink owned by the
 * requesting organizer (and on that organizer's own sale). The URL and the amount in the email are the
 * STORED ones; nothing the caller sends for either is trusted. Legacy callers that still send
 * { paymentLinkUrl, buyerEmail, amount } without a linkId are accepted only when paymentLinkUrl is EXACTLY
 * the stored URL of one of this organizer's active links; otherwise the request is refused. The recipient is
 * validated as a single plain address, sends are capped per organizer per hour (Redis window), and every
 * value that reaches the HTML is escaped. Errors are generic with a stable `code`; detail is logged only.
 */
export const sendPaymentLinkEmail = async (req: AuthRequest, res: Response) => {
  try {
    const organizer = await resolveOrganizerOrTeamMember(req, res, { requireStripe: false });
    if (!organizer) return;

    const { linkId, paymentLinkUrl, buyerEmail } = (req.body ?? {}) as {
      linkId?: unknown;
      paymentLinkUrl?: unknown;
      buyerEmail?: unknown;
      amount?: unknown; // legacy field: accepted by the API shape but NEVER used, the stored amount is
    };

    if (!isPlainEmailAddress(buyerEmail)) {
      return res.status(400).json({ message: 'Enter a valid email address', code: 'INVALID_EMAIL' });
    }
    const recipient = buyerEmail.trim();

    const hasLinkId = typeof linkId === 'string' && linkId.length > 0 && linkId.length <= 64;
    const hasLegacyUrl = typeof paymentLinkUrl === 'string' && paymentLinkUrl.length > 0 && paymentLinkUrl.length <= 2048;
    if (!hasLinkId && !hasLegacyUrl) {
      return res.status(400).json({ message: 'A payment link is required', code: 'PAYMENT_LINK_REQUIRED' });
    }

    if (await paymentLinkEmailRateLimited(organizer.id)) {
      return res.status(429).json({ message: 'You have emailed the maximum number of payment links for now. Please try again in an hour.', code: 'RATE_LIMITED' });
    }

    // Scoped to the requesting organizer AND that organizer's own sale. A link id (or URL) that belongs to
    // anyone else is indistinguishable from one that does not exist.
    const ownerScope = { organizerId: organizer.id, sale: { organizerId: organizer.id } };
    const link = hasLinkId
      ? await prisma.pOSPaymentLink.findFirst({
          where: { id: linkId as string, ...ownerScope },
          include: { sale: { select: { title: true } } },
        })
      : await prisma.pOSPaymentLink.findFirst({
          where: {
            ...ownerScope,
            status: 'ACTIVE',
            OR: [{ squarePaymentLinkUrl: paymentLinkUrl as string }, { stripePaymentLinkUrl: paymentLinkUrl as string }],
          },
          include: { sale: { select: { title: true } } },
        });
    if (!link) {
      return res.status(404).json({ message: 'Payment link not found', code: 'PAYMENT_LINK_NOT_FOUND' });
    }
    if (link.status !== 'ACTIVE') {
      return res.status(409).json({ message: 'This payment link is no longer active', code: 'PAYMENT_LINK_NOT_ACTIVE' });
    }
    if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
      return res.status(409).json({ message: 'This payment link has expired', code: 'PAYMENT_LINK_EXPIRED' });
    }

    const storedUrl = link.processor === 'SQUARE' ? link.squarePaymentLinkUrl : link.stripePaymentLinkUrl;
    const checkoutUrl = safeHttpsUrl(storedUrl);
    if (!checkoutUrl) {
      console.error(`[pos] sendPaymentLinkEmail: link ${link.id} has no usable stored https URL`);
      return res.status(409).json({ message: 'This payment link cannot be emailed', code: 'PAYMENT_LINK_URL_UNAVAILABLE' });
    }

    const { buildEmail } = await import('../services/emailTemplateService');

    const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';

    // Stored amount, integer cents. buildEmail treats headline as HTML and ctaUrl is escaped by the template;
    // body is HTML, so every dynamic piece is escaped here.
    const amountStr = link.amount > 0 ? `$${(link.amount / 100).toFixed(2)}` : 'your items';
    const saleTitle = link.sale?.title ? String(link.sale.title) : '';
    const html = buildEmail({
      preheader: `Your payment link is ready`,
      headline: escapeHtml(`Pay ${amountStr}. Tap the button below.`),
      body: `<p>The organizer${saleTitle ? ` of ${escapeHtml(saleTitle)}` : ''} has sent you a secure payment link for ${escapeHtml(amountStr)}. Tap below to pay from your phone.</p>`,
      ctaText: 'Pay Now',
      ctaUrl: checkoutUrl,
      accentColor: '#10b981',
    });

    await transactionalEmailService.emails.send({
      from: fromEmail,
      to: recipient,
      subject: `Your checkout is ready: ${amountStr}`,
      html,
    });

    res.json({ status: 'SENT' });
  } catch (error) {
    console.error('[pos] sendPaymentLinkEmail error:', error);
    res.status(500).json({ message: 'Failed to send email', code: 'EMAIL_SEND_FAILED' });
  }
};

/**
 * POST /api/pos/holds/:reservationId/request-cart
 * Organizer asks the shopper to share their cart.
 * Emits CART_SHARE_REQUEST via socket to the shopper's device.
 * Shopper's Layout listener auto-shares and opens the cart drawer.
 */
export const requestCartShare = async (req: AuthRequest, res: Response) => {
  try {
    const organizer = await resolveOrganizerOrTeamMember(req, res, { requireStripe: false });
    if (!organizer) return;

    const { reservationId } = req.params as { reservationId?: string };
    if (!reservationId) return res.status(400).json({ message: 'reservationId required' });

    const reservation = await prisma.itemReservation.findUnique({
      where: { id: reservationId },
      include: {
        item: { select: { sale: { select: { id: true, organizerId: true, title: true } } } },
        user: { select: { id: true, name: true } },
      },
    });

    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });
    if (reservation.item.sale!.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Reservation does not belong to your sale' });
    }

    const shopperId = reservation.userId;

    // Emit socket event — shopper's Layout listener picks this up
    try {
      const io = getIO();
      io.to(`user:${shopperId}`).emit('CART_SHARE_REQUEST', {
        saleId: reservation.item.sale!.id,
        saleName: reservation.item.sale!.title,
      });
    } catch (socketErr) {
      console.warn('[pos] CART_SHARE_REQUEST socket emit failed:', socketErr);
    }

    // In-app notification as fallback if shopper isn't connected
    try {
      await createNotification({
        userId: shopperId,
        type: 'cart_share_request',
        title: 'Cashier is ready for you',
        body: `Open the app and tap "Share cart with cashier" to check out.`,
        link: `/sales/${reservation.item.sale!.id}`,
      });
    } catch (notifErr) {
      console.warn('[pos] CART_SHARE_REQUEST notification failed:', notifErr);
    }

    res.json({ status: 'SENT', shopperName: reservation.user.name });
  } catch (error) {
    console.error('[pos] requestCartShare error:', error);
    res.status(500).json({ message: 'Failed to send cart request' });
  }
};

/**
 * DELETE /api/pos/sessions/:sessionId
 * Organizer removes a stale or unwanted open cart (organizer-only)
 *
 * Response: { success: true }
 */
export const deleteSession = async (req: AuthRequest, res: Response) => {
  try {
    const organizer = await resolveOrganizerOrTeamMember(req, res, { requireStripe: false });
    if (!organizer) return;

    const { sessionId } = req.params as { sessionId?: string };
    if (!sessionId) return res.status(400).json({ message: 'sessionId required' });

    // Fetch session + verify ownership
    const session = await prisma.pOSSession.findUnique({
      where: { id: sessionId },
      include: { sale: { select: { organizerId: true } } },
    });

    if (!session) return res.status(404).json({ message: 'Session not found' });
    if (session.sale!.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Session does not belong to your sale' });
    }

    // Delete the session
    await prisma.pOSSession.delete({
      where: { id: sessionId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[pos] deleteSession error:', error);
    res.status(500).json({ message: 'Failed to delete session' });
  }
};

/**
 * GET /api/pos/sessions/:sessionId/shopper-holds
 * Search for active holds by shopper email (organizer-only)
 * Query: ?email=xxx (required, case-insensitive)
 * Response: { holds: Array<{reservationId, itemId, itemTitle, itemPrice, shopperName, shopperEmail, shopperId, expiresAt, status}> }
 */
export const searchShopperHolds = async (req: AuthRequest, res: Response) => {
  try {
    const organizer = await resolveOrganizerOrTeamMember(req, res, { requireStripe: false });
    if (!organizer) return;

    const { sessionId } = req.params as { sessionId?: string };
    const { email } = req.query as { email?: string };

    if (!sessionId) return res.status(400).json({ message: 'sessionId required' });
    if (!email) return res.status(400).json({ message: 'email query param required' });

    // Fetch session + verify ownership
    const session = await prisma.pOSSession.findUnique({
      where: { id: sessionId },
      include: { sale: { select: { organizerId: true } } },
    });

    if (!session) return res.status(404).json({ message: 'Session not found' });
    if (session.sale!.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Session does not belong to your sale' });
    }

    // Find holds for this shopper at this sale
    const holds = await prisma.itemReservation.findMany({
      where: {
        item: { saleId: session.saleId },
        user: { email: { contains: email, mode: 'insensitive' } },
        status: { in: ['PENDING', 'CONFIRMED'] },
        expiresAt: { gt: new Date() },
        // See the getActiveHolds note above — must also exclude live in-flight claims.
        ...invoiceableWhere(),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        item: { select: { id: true, title: true, price: true } },
      },
      orderBy: { expiresAt: 'asc' },
    });

    const result = holds.map(h => ({
      reservationId: h.id,
      itemId: h.itemId,
      itemTitle: h.item.title,
      itemPrice: h.item.price,
      shopperName: h.user.name,
      shopperEmail: h.user.email,
      shopperId: h.userId,
      expiresAt: h.expiresAt,
      status: h.status,
    }));

    res.json({ holds: result });
  } catch (error) {
    console.error('[pos] searchShopperHolds error:', error);
    res.status(500).json({ message: 'Failed to search shopper holds' });
  }
};

