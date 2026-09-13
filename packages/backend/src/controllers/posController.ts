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
import crypto from 'crypto';
import * as Sentry from '@sentry/node';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getIO } from '../lib/socket';
import { createNotification } from '../lib/notificationService';
import { getPlatformFeeRate, SubscriptionTier } from '../utils/feeCalculator';
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
import { createSquareCheckoutLink } from '../services/squareCheckoutLinkService'; // Square changeover Wave S2 #4 (2026-09-09): POS QR payment link, Square branch


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
}): Promise<{ linkId: string; paymentLinkUrl: string; qrCodeDataUrl?: string; amount: number }> {
  const { organizerId, stripeConnectId, subscriptionTier, saleId, itemIds, amount, buyerEmail, expiresAt, squareOnboarded, squareMerchantId } = opts;

  const items = itemIds.length > 0
    ? await prisma.item.findMany({
        where: { id: { in: itemIds }, saleId },
        select: { id: true, title: true, price: true },
      })
    : [];

  const amountCents = Math.round(amount * 100);

  const feeRate = getPlatformFeeRate(subscriptionTier as SubscriptionTier);
  const platformFeeAmount = Math.round(amountCents * feeRate);

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

  const posPaymentLink = await prisma.pOSPaymentLink.create({
    data: {
      organizerId,
      saleId,
      qrCodeDataUrl,
      amount: amountCents,
      itemIds,
      status: 'ACTIVE',
      // Reclaim-gap fix (2026-08-04): use the caller-supplied hold expiresAt when present
      // (CHECKOUT_LINK settlement router) so posStrandedSaleReconcileCron.ts's expiry-based
      // reclaim branch has a real deadline to act on; ad-hoc/no-hold callers keep the flat 24h.
      expiresAt: expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      ...processorFields,
    },
  });

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
        select: { venmoHandle: true, zelleHandle: true, squareOnboarded: true, squareLocationId: true },
      }),
    ]);

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
      squareLocationId: organizerRow?.squareLocationId ?? null,
      canApplyDiscount,
      discountCap,
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
    // Always require a real Stripe connected account — never generate a fake URL.
    const organizer = await resolveOrganizerOrTeamMember(req, res, { requireStripe: true });
    if (!organizer) return;

    const { saleId, itemIds, amount, buyerEmail } = req.body as {
      saleId?: string;
      itemIds?: string[];
      amount?: number;
      buyerEmail?: string;
    };

    if (!saleId) return res.status(400).json({ message: 'saleId is required' });
    if (!itemIds || !Array.isArray(itemIds)) {
      return res.status(400).json({ message: 'itemIds must be non-empty array' });
    }
    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ message: 'amount must be positive number (in dollars)' });
    }

    // Verify sale belongs to organizer
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { organizerId: true },
    });

    if (!sale || sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Sale does not belong to your account' });
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
      });
    } catch (stripeErr) {
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
      },
    });

    if (!link) return res.status(404).json({ message: 'Payment link not found' });
    if (link.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Payment link does not belong to your account' });
    }

    res.json({
      linkId: link.id,
      status: link.status,
      amount: link.amount / 100, // Convert back to dollars
      qrCodeDataUrl: link.qrCodeDataUrl,
      completedAt: link.completedAt,
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
  try {
    // requireStripe here now really means "require SOME connected processor"
    // (posAuth.ts's resolveOrganizerOrTeamMember accepts stripeConnectId OR
    // squareOnboarded) -- kept true rather than renamed to avoid touching every
    // other call site's argument for a cosmetic rename.
    const organizer = await resolveOrganizerOrTeamMember(req, res, { requireStripe: true });
    if (!organizer) return;

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
    try {
      await commitItemSale(reservation.itemId, 'INVOICE_ISSUED', ['AVAILABLE', 'RESERVED']);
    } catch (guardError) {
      if (guardError instanceof ItemAlreadyCommittedError) {
        return res.status(409).json({ message: 'This item is no longer available to invoice -- it may have already been sold or invoiced elsewhere.' });
      }
      throw guardError;
    }

    // Calculate total: held item + misc items
    const heldItemTotal = Math.round(reservation.item.price! * 100); // in cents
    const miscTotal = miscItems ? miscItems.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) : 0;
    const grandTotal = heldItemTotal + miscTotal;
    const holdFeeRate = getPlatformFeeRate(organizer.subscriptionTier as SubscriptionTier);

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
    const finalCashAmountCents = Math.min(safeCashAmountCents, grandTotal);
    const cardAmountCents = grandTotal - finalCashAmountCents;
    const platformFeeAmount = Math.round(cardAmountCents * holdFeeRate);

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
    const mergedRealItemIds: string[] = [];
    if (miscItems && miscItems.length > 0) {
      for (const miscItem of miscItems) {
        if (miscItem.itemId) {
          mergedRealItemIds.push(miscItem.itemId);
        }
      }
    }

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
      } catch (guardError) {
        if (guardError instanceof ItemAlreadyCommittedError) {
          return res.status(409).json({ message: 'One of the additional items is no longer available to invoice -- it may have already been sold or invoiced elsewhere.' });
        }
        throw guardError;
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

      await prisma.itemReservation.update({
        where: { id: reservationId },
        data: { invoiceId: cashOnlyInvoice.id },
      });
      if (mergedRealItemIds.length > 0) {
        await prisma.itemReservation.updateMany({
          where: { itemId: { in: mergedRealItemIds } },
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
      const squareDescription = finalCashAmountCents > 0
        ? `Balance due -- remaining balance after $${(finalCashAmountCents / 100).toFixed(2)} cash collected at checkout`
        : (reservation.item.title || 'FindA.Sale payment');

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
        if (squareError instanceof SquareOnboardingIncompleteError) {
          return res.status(409).json({
            message: "This seller isn't set up to accept online payments yet. Please contact the organizer to arrange your purchase.",
            code: 'SELLER_PAYMENTS_UNAVAILABLE',
          });
        }
        console.error('[pos] sendHoldInvoice: Square payment link creation failed:', squareError);
        return res.status(400).json({ message: 'Failed to create Square payment link', error: squareError?.message });
      }

      if (!squareResult.ok) {
        return res.status(402).json({ message: squareResult.message, code: 'SQUARE_PAYMENT_LINK_FAILED' });
      }

      const squareHoldInvoice = await prisma.holdInvoice.create({
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

      await prisma.itemReservation.update({
        where: { id: reservationId },
        data: { invoiceId: squareHoldInvoice.id },
      });
      if (mergedRealItemIds.length > 0) {
        await prisma.itemReservation.updateMany({
          where: { itemId: { in: mergedRealItemIds } },
          data: { invoiceId: squareHoldInvoice.id },
        });
      }

      // Send email (mirrors the Stripe branch's own email below, pointed at the Square
      // payment link URL instead of a Stripe Checkout URL).
      let squareEmailWarning: string | null = null;
      try {
        const { buildEmail } = await import('../services/emailTemplateService');
        const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';

        let itemsList = `<strong>${reservation.item.title}</strong> - $${reservation.item.price?.toFixed(2)}`;
        if (miscItems && miscItems.length > 0) {
          const miscItemsHtml = miscItems
            .map(item => `<strong>${item.title}</strong> - $${item.amount.toFixed(2)}`)
            .join('<br/>');
          itemsList += '<br/>' + miscItemsHtml;
        }

        const html = buildEmail({
          preheader: `Invoice for your hold`,
          headline: `Invoice: ${reservation.item.title}${miscItems && miscItems.length > 0 ? ' + more' : ''}`,
          body: `<p>Hi ${reservation.user.name},</p><p>Your hold is ready for payment:</p><p>${itemsList}</p><p><strong>Total: $${(grandTotal / 100).toFixed(2)}</strong></p>`,
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

/**
 * POST /api/pos/payment-links/email
 * Send a Stripe payment link URL to a shopper's email via Resend.
 * Used when organizer generates a QR code and wants to also email the link.
 *
 * Body: { paymentLinkUrl: string, buyerEmail: string, amount: number }
 */
export const sendPaymentLinkEmail = async (req: AuthRequest, res: Response) => {
  try {
    const organizer = await resolveOrganizerOrTeamMember(req, res, { requireStripe: false });
    if (!organizer) return;

    const { paymentLinkUrl, buyerEmail, amount } = req.body as {
      paymentLinkUrl?: string;
      buyerEmail?: string;
      amount?: number;
    };

    if (!paymentLinkUrl || !buyerEmail) {
      return res.status(400).json({ message: 'paymentLinkUrl and buyerEmail required' });
    }

    const { buildEmail } = await import('../services/emailTemplateService');
    
    const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';

    const amountStr = amount ? `$${Number(amount).toFixed(2)}` : 'your items';
    const html = buildEmail({
      preheader: `Your payment link is ready`,
      headline: `Pay ${amountStr}. Tap the button below.`,
      body: `<p>The organizer has sent you a secure payment link for ${amountStr}. Tap below to pay from your phone.</p>`,
      ctaText: 'Pay Now',
      ctaUrl: paymentLinkUrl,
      accentColor: '#10b981',
    });

    await transactionalEmailService.emails.send({
      from: fromEmail,
      to: buyerEmail,
      subject: `Your checkout is ready: ${amountStr}`,
      html,
    });

    res.json({ status: 'SENT' });
  } catch (error) {
    console.error('[pos] sendPaymentLinkEmail error:', error);
    res.status(500).json({ message: 'Failed to send email' });
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

