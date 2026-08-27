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
import { getStripe } from '../utils/stripe';
import Stripe from 'stripe';
import { getIO } from '../lib/socket';
import { createNotification } from '../lib/notificationService';
import { getPlatformFeeRate, SubscriptionTier } from '../utils/feeCalculator';
import { transactionalEmailService } from '../lib/transactionalEmailService';
import { commitItemSale, ItemAlreadyCommittedError } from '../services/itemSaleGuard'; // ADR-098: atomic double-sell guard
import { resolveOrganizerOrTeamMember } from '../utils/posAuth'; // S1183 Fix 1: TEAM_MEMBER fallback for non-venue POS
import { stripeCheckoutExpiry } from '../utils/stripeCheckoutExpiry'; // Hold-to-Pay P0 (2026-08-16): Stripe expires_at floor/ceiling clamp
import { shouldUseDirectCharge } from '../services/stripeConnectService'; // Direct-charges migration (2026-08-08): staged-rollout routing decision
import { invoiceableWhere, isInvoicedOrClaimed, releaseDeadInvoiceAnchors } from '../services/holdInvoiceClaim'; // Hold-to-Pay P0 (2026-08-16): non-FK invoice claim must be visible to every hold read site; P0 (2026-08-17): dead-anchor release
import { expireCheckoutSessionSafely } from '../utils/expireCheckoutSession'; // P1 (2026-08-17): a Checkout Session orphaned by a failed HoldInvoice transaction stays OPEN and payable

const stripe = () => getStripe();

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
}): Promise<{ linkId: string; paymentLinkUrl: string; qrCodeDataUrl?: string; amount: number }> {
  const { organizerId, stripeConnectId, subscriptionTier, saleId, itemIds, amount, buyerEmail, expiresAt } = opts;

  const items = itemIds.length > 0
    ? await prisma.item.findMany({
        where: { id: { in: itemIds }, saleId },
        select: { id: true, title: true, price: true },
      })
    : [];

  const amountCents = Math.round(amount * 100);

  const feeRate = getPlatformFeeRate(subscriptionTier as SubscriptionTier);
  const platformFeeAmount = Math.round(amountCents * feeRate);

  // Direct-charges migration (2026-08-08): staged-rollout routing decision.
  // MOVED ABOVE price creation (bug fix, 2026-08-20, S-QR-DIRECT-CHARGE-PRICE-MISMATCH):
  // a Stripe Price object lives in whichever account context it was created in, and
  // paymentLinks.create() below is invoked in THAT same context via the
  // { stripeAccount } request option. The price used to always be created on the
  // PLATFORM account (no request option) while the Payment Link for Direct-charge
  // organizers was then created on the CONNECTED account -- a cross-account reference
  // Stripe rejects outright. Confirmed via Railway deploy logs: two live
  // "StripeInvalidRequestError: No such price: 'price_...'" failures for organizer
  // cmnxueoas0005tfv8brnc0kky (artifactmi@gmail.com) at 2026-08-20T17:30:55Z and
  // 17:31:23Z, both surfaced to the organizer as the generic POS toast
  // "Failed to generate QR code". Fix: compute useDirect first, create the Price with
  // the same { stripeAccount } request option the Payment Link uses, and never
  // reference the platform-side STRIPE_GENERIC_ITEM_PRODUCT_ID for a Direct-charge
  // organizer (that product also only exists on the platform account) -- always fall
  // back to inline product_data in that case, same as when no genericProductId is
  // configured at all.
  const validConnectId = !!(stripeConnectId && stripeConnectId.length >= 21);
  const useDirect = validConnectId
    ? await shouldUseDirectCharge(organizerId, stripeConnectId!)
    : false;
  const stripeRequestOptions = useDirect ? { stripeAccount: stripeConnectId! } : undefined;

  const genericProductId = process.env.STRIPE_GENERIC_ITEM_PRODUCT_ID;
  const adHocPrice = await stripe().prices.create(
    {
      currency: 'usd',
      unit_amount: amountCents,
      ...(genericProductId && !useDirect
        ? { product: genericProductId }
        : {
            product_data: {
              name: `FindA.Sale: ${items.map(i => i.title).join(', ').slice(0, 200) || 'Item Sale'}`,
            },
          }),
    },
    stripeRequestOptions
  );

  // 2026-08-26 fix (Patrick): a real live $0.50 POS payment link left the shopper
  // stranded on Stripe's own generic "Payment successful" hosted page instead of
  // returning to finda.sale. Switched to a redirect -- targeting the PUBLIC sale
  // page (/sales/{saleId}), NOT /shopper/checkout-success, because that page hard-
  // requires an authenticated session (redirects to /login if !user -- confirmed by
  // reading packages/frontend/pages/shopper/checkout-success.tsx) and this is
  // explicitly a "shopper self-checkout via QR" flow (see file header) with no
  // guarantee the payer is logged into FindA.Sale at all. /sales/[id].tsx is public.
  const baseUrl = process.env.FRONTEND_URL || 'https://finda.sale';
  const paymentLink = await stripe().paymentLinks.create(
    {
      line_items: [{ price: adHocPrice.id, quantity: 1 }],
      after_completion: {
        type: 'redirect',
        redirect: { url: `${baseUrl}/sales/${saleId}?paymentStatus=success` },
      },
      // Direct-charges migration (2026-08-08): a Direct charge lives on the connected
      // account itself -- drop transfer_data (there is no platform-side Transfer) and keep
      // application_fee_amount; the { stripeAccount } request option below routes the
      // create call to the connected account. Destination-charge shape (else branch) is
      // UNCHANGED.
      ...(useDirect
        ? ({ application_fee_amount: platformFeeAmount } as any)
        : validConnectId
          ? ({ application_fee_amount: platformFeeAmount, transfer_data: { destination: stripeConnectId } } as any)
          : {}),
    },
    stripeRequestOptions
  );

  const paymentLinkUrl = paymentLink.url;
  const stripePaymentLinkId = paymentLink.id;

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
      stripePaymentLinkId,
      stripePaymentLinkUrl: paymentLinkUrl,
      qrCodeDataUrl,
      amount: amountCents,
      itemIds,
      status: 'ACTIVE',
      // Reclaim-gap fix (2026-08-04): use the caller-supplied hold expiresAt when present
      // (CHECKOUT_LINK settlement router) so posStrandedSaleReconcileCron.ts's expiry-based
      // reclaim branch has a real deadline to act on; ad-hoc/no-hold callers keep the flat 24h.
      expiresAt: expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      // Stripe account snapshot (2026-08-20 migration): pin the routing decision actually
      // used above so posStrandedSaleReconcileCron.ts / posPaymentLinkRecorder.ts never have
      // to recompute it live -- see schema.prisma's POSPaymentLink comment for why that
      // recompute was a real bug.
      chargeType: useDirect ? 'DIRECT' : 'DESTINATION',
      ...(useDirect ? { stripeAccountId: stripeConnectId! } : {}),
    },
  });

  if (buyerEmail) {
    try {
      const { buildEmail } = await import('../services/emailTemplateService');
      const html = buildEmail({
        preheader: `Your payment link for $${amount.toFixed(2)}`,
        headline: `Your Payment Link`,
        body: `<p>Your organizer has sent you a payment link for <strong>$${amount.toFixed(2)}</strong>. Click below to pay securely via Stripe.</p>`,
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
        select: { venmoHandle: true, zelleHandle: true },
      }),
    ]);

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
      });
    } catch (stripeErr) {
      console.error('[pos] Stripe payment link creation failed:', stripeErr);
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
  // Orphaned-payable-session guard (mirrors createCombinedInvoice / markSoldAndCreateInvoice):
  // the Stripe Checkout Session below is created BEFORE the HoldInvoice row exists. If
  // anything after that throws before the HoldInvoice is committed, a Session would be left
  // open and payable against nothing. Declared at function scope so the outer catch can see
  // it. (No revert is attempted here beyond this note -- see the Blocked/Flagged item in this
  // dispatch's handoff: this exact gap already exists unaddressed in createCombinedInvoice
  // today, so this mirrors established behavior rather than inventing new scope.)
  let createdStripeSessionId: string | null = null;
  let createdStripeSessionAccount: string | null = null;

  try {
    // P0 fix (2026-08-25, Charge C investigation): this endpoint now creates a real Stripe
    // Checkout Session (see below), so it can no longer opt out of the Stripe-connected
    // requirement the way it did when it was Stripe-free.
    const organizer = await resolveOrganizerOrTeamMember(req, res, { requireStripe: true });
    if (!organizer) return;

    const { reservationId } = req.params as { reservationId?: string };
    const { deliverVia, expiryHours, miscItems } = req.body as {
      deliverVia?: string;
      expiryHours?: number;
      miscItems?: Array<{ id: string; itemId?: string; title: string; amount: number }>;
    };

    if (!reservationId) return res.status(400).json({ message: 'reservationId required' });
    if (!deliverVia || deliverVia !== 'EMAIL') {
      return res.status(400).json({ message: 'deliverVia must be EMAIL (MVP)' });
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
    const platformFeeAmount = Math.round(grandTotal * holdFeeRate);

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
    const baseUrl = process.env.FRONTEND_URL || 'https://finda.sale';
    const checkoutExpiry = stripeCheckoutExpiry(expiresAt);
    if (checkoutExpiry.clampedTo) {
      console.warn(
        `[pos] sendHoldInvoice: Stripe expires_at clamped to ${checkoutExpiry.clampedTo} for reservation ${reservationId}: ` +
        `invoice deadline ${expiresAt.toISOString()} -> Stripe session expiry ${checkoutExpiry.effectiveExpiresAt.toISOString()}. ` +
        `The Checkout Session and HoldInvoice.expiresAt intentionally disagree; invoiceExpiryJob still governs the real deadline.`
      );
    }

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: reservation.item.title,
            description: reservation.item.title || 'Secondhand item',
            images: reservation.item.photoUrls && reservation.item.photoUrls.length > 0 ? [reservation.item.photoUrls[0]] : [],
          },
          unit_amount_decimal: String(heldItemTotal),
        },
        quantity: 1,
      },
    ];
    // P0 fix (S-PAYMENT-INVOICE-GAPS-2026-08-25): a merged real hold (handleLoadHold's
    // same-shopper-same-sale merge in pos.tsx) arrives here as a miscItem that DOES carry a
    // real itemId (pos.tsx / PosInvoiceModal.tsx CartItem both have itemId?: string) -- only
    // a genuinely ad-hoc, non-inventory charge would ever lack one. Previously this itemId was
    // silently discarded: the Stripe charge was correct (line item added below either way) but
    // the item was never bundled into HoldInvoice.itemIds, so it never got a Purchase row, was
    // never marked SOLD, and its payment was unrecoverable after the fact -- confirmed live via
    // a real $1.25 charge whose second item's $0.75 share had no Purchase row. See ADR:
    // claude_docs/feature-notes/hold-invoice-merged-item-bundling-adr-2026-08-25.md
    const mergedRealItemIds: string[] = [];
    if (miscItems && miscItems.length > 0) {
      for (const miscItem of miscItems) {
        if (miscItem.itemId) {
          mergedRealItemIds.push(miscItem.itemId);
        }
        line_items.push({
          price_data: {
            currency: 'usd',
            product_data: { name: miscItem.title, description: 'Additional item' },
            unit_amount_decimal: String(Math.round(miscItem.amount * 100)),
          },
          quantity: 1,
        });
      }
    }

    // Direct-charges migration (2026-08-08): staged-rollout routing decision, same pattern
    // as every other invoice-creation path in this file.
    const useDirect = organizer.stripeConnectId
      ? await shouldUseDirectCharge(organizer.id, organizer.stripeConnectId)
      : false;
    // Fresh per-attempt key, not pinned to reservationId alone -- avoids the exact 24h-poisoned-
    // key trap reservationController.markSoldAndCreateInvoice's own comment documents (a stable
    // key tied only to the reservation would freeze every retry for a day after one failure).
    const idempotencyKey = `send-hold-invoice-${reservationId}-${crypto.randomUUID()}`;

    let stripeSession: Stripe.Checkout.Session;
    try {
      stripeSession = await stripe().checkout.sessions.create(
        {
          payment_method_types: ['card'],
          mode: 'payment',
          // P0 fix (2026-08-26): explicit expand so payment_intent reliably comes back
          // as a full object (with .id) on this synchronous response -- confirmed live
          // this session that without it, stripeSession.payment_intent came back falsy
          // for a real DIRECT-charge invoice (HoldInvoice cmta1rnh1001uq3rt1z5cocs8),
          // which skipped BOTH the stripePaymentIntentId DB write below AND the
          // metadata-backfill call further down (same variable, same `if` guard) --
          // so paymentIntent.metadata.invoiceId was never set on the real PaymentIntent,
          // and the charge.succeeded webhook silently no-op'd on a real captured charge.
          // Money was fine (Stripe had it); our DB just never learned about it until the
          // slow invoiceExpiryJob STRANDED-PAID backstop caught it ~1hr later.
          expand: ['payment_intent'],
          customer_email: reservation.user.email,
          line_items,
          success_url: `${baseUrl}/shopper/checkout-success?paymentStatus=success`,
          cancel_url: `${baseUrl}/shopper/holds?paymentStatus=cancelled`,
          expires_at: checkoutExpiry.expiresAtUnix,
          payment_intent_data: {
            metadata: {
              invoiceId: null, // backfilled below once the HoldInvoice row exists
              // P0 fix (S-PAYMENT-INVOICE-GAPS-2026-08-25): joined string including any merged
              // real items, mirroring createCombinedInvoice's working itemIds.join(',') pattern
              // elsewhere in this file -- was bare reservation.itemId (anchor only) before.
              itemIds: [reservation.itemId, ...mergedRealItemIds].join(','),
              shopperId: reservation.userId,
              organizerId: organizer.id,
              saleId: reservation.item.sale!.id,
            },
            application_fee_amount: platformFeeAmount,
            ...(useDirect ? {} : { transfer_data: { destination: organizer.stripeConnectId! } }),
          },
          metadata: { organizerId: organizer.id },
        },
        { idempotencyKey, ...(useDirect ? { stripeAccount: organizer.stripeConnectId! } : {}) }
      );
      createdStripeSessionId = stripeSession.id;
      createdStripeSessionAccount = useDirect ? organizer.stripeConnectId ?? null : null;
    } catch (stripeError: any) {
      console.error('[pos] sendHoldInvoice: Stripe session creation failed:', stripeError);
      return res.status(400).json({ message: 'Failed to create Stripe checkout session', error: stripeError.message });
    }

    // P0 fix (2026-08-27, S-HOLD-INVOICE-PI-BACKFILL-GAP): `expand: ['payment_intent']` above
    // was itself a P0 fix for this exact class of bug (see comment above) but confirmed live
    // this session to NOT be sufficient on its own -- a real 2-item bundled invoice
    // (HoldInvoice cmtbgy90q0211p46d8yq5lfuv) still came back with a falsy payment_intent on
    // the synchronous create() response despite the expand param, silently skipping BOTH the
    // stripePaymentIntentId DB write below AND the metadata-backfill call further down (same
    // `if (stripePaymentIntentId)` guard) -- exactly the same downstream failure the prior fix
    // was meant to close. A real $1.98 charge was captured by Stripe with zero Purchase row,
    // zero stock decrement, zero notification, caught only ~40 min later by
    // invoiceExpiryJob's STRANDED-PAID reconcile backstop. Root cause of the falsy expand is
    // not definitively attributable to a documented Stripe API behavior (session creation
    // succeeded cleanly, no error was thrown, only one session was ever created for this
    // reservation -- ruled out idempotency-key replay). Given that, this closes the gap
    // defensively regardless of cause: if the synchronous response still lacks a populated
    // payment_intent, explicitly retrieve the session again (same account context) up to 2
    // extra times with a short delay before giving up -- rather than silently writing null.
    let stripePaymentIntentId = typeof stripeSession.payment_intent === 'string'
      ? stripeSession.payment_intent
      : (stripeSession.payment_intent as any)?.id ?? null;

    if (!stripePaymentIntentId) {
      const retrieveOptions = useDirect ? { stripeAccount: organizer.stripeConnectId! } : undefined;
      for (let attempt = 1; attempt <= 2 && !stripePaymentIntentId; attempt++) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
          const refetched = await stripe().checkout.sessions.retrieve(
            stripeSession.id,
            { expand: ['payment_intent'] },
            retrieveOptions
          );
          stripePaymentIntentId = typeof refetched.payment_intent === 'string'
            ? refetched.payment_intent
            : (refetched.payment_intent as any)?.id ?? null;
          if (stripePaymentIntentId) {
            console.warn(`[pos] sendHoldInvoice: payment_intent was falsy on the initial create() response for session ${stripeSession.id} -- recovered via retry #${attempt} (${stripePaymentIntentId}).`);
          }
        } catch (retryErr: any) {
          console.error(`[pos] sendHoldInvoice: retry #${attempt} to fetch payment_intent for session ${stripeSession.id} failed:`, retryErr?.message ?? retryErr);
        }
      }
      if (!stripePaymentIntentId) {
        // Loud and specific -- this must be visible immediately, not only surface ~30-40 min
        // later via invoiceExpiryJob's STRANDED-PAID reconcile. The invoice still gets created
        // below (a shopper must not be blocked from paying), but the metadata backfill will be
        // skipped and this HoldInvoice will depend entirely on the reconcile backstop.
        const piGapMsg = `[pos] sendHoldInvoice: payment_intent STILL unavailable for session ${stripeSession.id} after create() + 2 retries -- proceeding with stripePaymentIntentId=null. This invoice's metadata backfill will be SKIPPED and it will depend on invoiceExpiryJob's STRANDED-PAID reconcile to ever record a payment (up to ~40 min after the invoice's own expiresAt). reservationId=${reservationId}`;
        console.error(piGapMsg);
        try {
          Sentry.captureMessage(piGapMsg, 'error');
        } catch {
          // Sentry may not be initialized -- silently continue
        }
      }
    }

    // Create HoldInvoice record
    const holdInvoice = await prisma.holdInvoice.create({
      data: {
        reservationId,
        shopperUserId: reservation.userId,
        // P0-A fix (2026-08-16): this wrote `organizer.id` -- an Organizer.id -- into a
        // column FK'd to User(id) (HoldInvoice_organizerUserId_fkey). Postgres rejected
        // every insert with P2003; the HoldInvoice table was empty platform-wide across ALL
        // THREE creation paths for this same reason. `organizer` here is posAuth's
        // ResolvedPosActor, whose `.id` is the Organizer.id -- `.ownerUserId` is the User.id
        // that owns it (and is NOT `.actingUserId`, who under the TEAM_MEMBER branch is a
        // different person standing at the register).
        organizerUserId: organizer.ownerUserId,
        saleId: reservation.item.sale!.id,
        itemIds: [reservation.itemId, ...mergedRealItemIds],
        totalAmount: grandTotal,
        platformFeeAmount,
        status: 'PENDING',
        expiresAt,
        stripeSessionId: stripeSession.id,
        stripePaymentIntentId,
        // Stripe account + charge-shape snapshot -- same fields createCombinedInvoice /
        // markSoldAndCreateInvoice already populate for this exact reason (invoiceExpiryJob,
        // holdInvoicePaymentRecorder.ts, and stripeController.ts's webhook all read these
        // instead of re-deriving the account from the organizer's CURRENT stripeConnectId,
        // which can drift after re-onboarding).
        chargeType: useDirect ? 'DIRECT' : 'DESTINATION',
        stripeAccountId: createdStripeSessionAccount,
      },
    });

    // The Session now belongs to a real, live HoldInvoice.
    createdStripeSessionId = null;
    createdStripeSessionAccount = null;

    // Update reservation with invoice reference
    await prisma.itemReservation.update({
      where: { id: reservationId },
      data: { invoiceId: holdInvoice.id },
    });

    // Backfill invoiceId onto the PaymentIntent's metadata now that the HoldInvoice row (and
    // its id) exists -- mirrors createCombinedInvoice / markSoldAndCreateInvoice. Non-fatal:
    // invoiceExpiryJob's STRANDED-PAID reconcile branch is the backstop if this fails.
    if (stripePaymentIntentId) {
      try {
        await stripe().paymentIntents.update(
          stripePaymentIntentId,
          {
            metadata: {
              // P0 fix (S-PAYMENT-INVOICE-GAPS-2026-08-25): joined string including any merged
              // real items -- was bare reservation.itemId (anchor only) before.
              itemIds: [reservation.itemId, ...mergedRealItemIds].join(','),
              shopperId: reservation.userId,
              organizerId: organizer.id,
              saleId: reservation.item.sale!.id,
              invoiceId: holdInvoice.id,
            },
          },
          // P0 fix (S-PAYMENT-INVOICE-GAPS-2026-08-25): this was missing the stripeAccount
          // option the session-creation call above already has. For a DIRECT-charge invoice
          // the PaymentIntent lives on the connected account -- without this option the update
          // silently 404s ("No such payment_intent") against the platform account and is
          // swallowed by the catch below, so invoiceId metadata never actually backfills.
          // Confirmed live: re-querying the PaymentIntent hours after creation still showed
          // metadata.invoiceId === '' before this fix.
          useDirect ? { stripeAccount: organizer.stripeConnectId! } : {}
        );
      } catch (metaErr: any) {
        const metaErrMsg = `[pos] sendHoldInvoice: Non-fatal: failed to backfill invoiceId metadata onto PaymentIntent ${stripePaymentIntentId} for invoice ${holdInvoice.id}: ${metaErr?.message ?? metaErr}`;
        console.error(metaErrMsg);
        try {
          Sentry.captureException(metaErr instanceof Error ? metaErr : new Error(metaErrMsg), {
            tags: { area: 'hold-invoice-metadata-backfill' },
            extra: { invoiceId: holdInvoice.id, stripePaymentIntentId },
          });
        } catch {
          // Sentry may not be initialized -- silently continue
        }
      }
    }

    // Send email (Resend integration — basic version)
    let emailWarning: string | null = null;
    if (true) {
      try {
        const { buildEmail } = await import('../services/emailTemplateService');
        
        const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';

        // Build item list for email
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
          // P0 fix (2026-08-25): was a dead /my-invoices/[id] link -- that page has never
          // existed anywhere in packages/frontend/pages. This is now the real, live Stripe
          // Checkout URL, same pattern as markSoldAndCreateInvoice's "Review and Pay" email
          // (the one invoice path that already worked end-to-end -- confirmed live-paid,
          // Charge A, 2026-08-25).
          ctaText: 'Complete Payment',
          ctaUrl: stripeSession.url ?? `${baseUrl}/shopper/holds`,
          accentColor: '#10b981',
        });

        const emailResult = await transactionalEmailService.emails.send({
          from: fromEmail,
          to: reservation.user.email,
          subject: `Invoice: ${reservation.item.title}`,
          html,
        });

        // P1 fix (2026-08-25, Charge C investigation): this used to be a bare console.warn
        // on a THROWN error only -- invisible to the organizer either way, and a silent
        // suppression-block skip (transactionalEmailService.emails.send returning normally
        // without sending) never even reached this catch at all. That silent-skip is exactly
        // how Charge C's stale EmailSuppression row on deseee@yahoo.com went unnoticed: the
        // endpoint returned "SENT" and the POS UI showed "Invoice Sent" while nothing was
        // actually delivered. transactionalEmailService.emails.send now reports
        // { sent, reason } instead of a bare Promise<void> (see lib/transactionalEmailService.ts)
        // specifically so this can be surfaced in the response instead of only logged.
        if (!emailResult.sent) {
          emailWarning = `Invoice created, but the email could not be delivered (${emailResult.reason ?? 'unknown reason'}). Share the payment link with the shopper directly.`;
          console.warn(`[pos] sendHoldInvoice: email not sent (reason=${emailResult.reason}) to ${reservation.user.email}`);
        }
      } catch (emailErr: any) {
        emailWarning = 'Invoice created, but the email failed to send. Share the payment link with the shopper directly.';
        console.warn('[pos] sendHoldInvoice: Failed to send invoice email:', emailErr);
      }
    }

    // Emit socket event to shopper so in-app payment popup appears
    try {
      const io = getIO();
      io.to(`user:${reservation.userId}`).emit('HOLD_INVOICE', {
        type: 'HOLD_INVOICE',
        invoiceId: holdInvoice.id,
        total: grandTotal / 100,
        expiresAt: holdInvoice.expiresAt,
        itemTitle: reservation.item.title,
        checkoutUrl: stripeSession.url,
      });
    } catch (socketErr) {
      console.warn('[pos] Failed to emit HOLD_INVOICE socket event:', socketErr);
    }

    // Create in-app notification for shopper
    try {
      await createNotification({
        userId: reservation.userId,
        type: 'hold_invoice',
        title: 'Invoice Ready',
        body: `Your invoice for ${reservation.item.title} is ready. Total: $${(grandTotal / 100).toFixed(2)}`,
        // P0 fix (2026-08-25): was the same dead /my-invoices/[id] link as the email CTA
        // above. NotificationBell.tsx / pages/notifications.tsx both already handle an
        // external https:// link correctly (open in new tab / window.location.href), so the
        // real Stripe URL works here without any frontend change.
        link: stripeSession.url ?? `${baseUrl}/shopper/holds`,
      });
    } catch (notifErr) {
      console.warn('[pos] Failed to create hold invoice notification:', notifErr);
    }

    res.json({
      invoiceId: holdInvoice.id,
      status: 'SENT',
      stripeSessionId: stripeSession.id,
      checkoutUrl: stripeSession.url,
      ...(emailWarning ? { emailWarning } : {}),
    });
  } catch (error) {
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

/**
 * POST /api/pos/sessions/:sessionId/pull-holds
 * Transition selected holds to HOLD_IN_CART status (organizer-only)
 * Body: { reservationIds: string[] }
 * Response: { pulled: number, reservations: Array<{reservationId, itemTitle, status}> }
 */
export const pullHoldsToCart = async (req: AuthRequest, res: Response) => {
  try {
    const organizer = await resolveOrganizerOrTeamMember(req, res, { requireStripe: false });
    if (!organizer) return;

    const { sessionId } = req.params as { sessionId?: string };
    const { reservationIds } = req.body as { reservationIds?: string[] };

    if (!sessionId) return res.status(400).json({ message: 'sessionId required' });
    if (!reservationIds || !Array.isArray(reservationIds) || reservationIds.length === 0) {
      return res.status(400).json({ message: 'reservationIds must be non-empty array' });
    }

    // Fetch session + verify ownership
    const session = await prisma.pOSSession.findUnique({
      where: { id: sessionId },
      include: { sale: { select: { organizerId: true } } },
    });

    if (!session) return res.status(404).json({ message: 'Session not found' });
    if (session.sale!.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Session does not belong to your sale' });
    }

    // Fetch all reservations + verify they're valid for pulling
    const reservations = await prisma.itemReservation.findMany({
      where: { id: { in: reservationIds } },
      include: { item: { select: { saleId: true, title: true } } },
    });

    // Validate all reservations
    for (const hold of reservations) {
      if ((hold.item.saleId ?? '') !== session.saleId) {
        return res.status(403).json({ message: 'Reservation does not belong to this session sale' });
      }
      if (!['PENDING', 'CONFIRMED'].includes(hold.status)) {
        return res.status(409).json({ message: `Reservation ${hold.id} is not in PENDING or CONFIRMED state` });
      }
      // Live in-flight claims count too (P0 fix 2026-08-16 — the claim no longer lives
      // in invoiceId, so a bare `hold.invoiceId` check here would be blind to it).
      if (isInvoicedOrClaimed(hold)) {
        return res.status(409).json({ message: `Reservation ${hold.id} already has an invoice` });
      }
    }

    // Update all reservations to HOLD_IN_CART
    const updated = await prisma.itemReservation.updateMany({
      where: { id: { in: reservationIds } },
      data: { status: 'HOLD_IN_CART' },
    });

    // Fetch updated records for response
    const updatedReservations = await prisma.itemReservation.findMany({
      where: { id: { in: reservationIds } },
      include: { item: { select: { title: true } } },
    });

    const result = updatedReservations.map(r => ({
      reservationId: r.id,
      itemTitle: r.item.title,
      status: r.status,
    }));

    res.json({ pulled: updated.count, reservations: result });
  } catch (error) {
    console.error('[pos] pullHoldsToCart error:', error);
    res.status(500).json({ message: 'Failed to pull holds into cart' });
  }
};

/**
 * POST /api/pos/sessions/:sessionId/create-invoice
 * Create combined invoice from held items + misc items with optional cash split (organizer-only)
 * Body: { shopperId, invoiceMode, expiresAt?, cashAmountCents?, miscItems?, holdIds? }
 * Response: { invoiceId, stripeSessionId, invoiceMode, totalAmountCents, cashAmountCents, cardAmountCents, platformFeeAmount, status, expiresAt, createdAt }
 */
export const createCombinedInvoice = async (req: AuthRequest, res: Response) => {
  // Orphaned-payable-session guard (P1, 2026-08-17). The Stripe Checkout Session is
  // created BEFORE the HoldInvoice transaction below. If that transaction throws -- P2002
  // on the @unique stripeSessionId or reservationId anchor, a releaseDeadInvoiceAnchors
  // failure, any DB blip -- the old code fell straight through to the outer catch and
  // returned a 500 while the Session stayed OPEN and PAYABLE: a live payment link for an
  // invoice that does not exist, against items the cart just let go of. Declared at
  // FUNCTION scope, not inside the try (which is its own block scope), so the outer catch
  // can actually see them. The account is tracked alongside the id because a Direct-charge
  // Session lives on the connected account and cannot be expired with a platform-scoped
  // call. Identical pattern to reservationController.markSoldAndCreateInvoice.
  let createdStripeSessionId: string | null = null;
  let createdStripeSessionAccount: string | null = null;
  // Stripe account + charge-shape snapshot (2026-08-18 migration): mirrors
  // createdStripeSessionAccount's function-scope pattern above so the value survives from
  // the Session-create call (inside the `if (cardAmountCents > 0)` block below) to the
  // tx.holdInvoice.create() call further down.
  let createdChargeType: string | null = null;

  try {
    const organizer = await resolveOrganizerOrTeamMember(req, res, { requireStripe: true });
    if (!organizer) return;

    const { sessionId } = req.params as { sessionId?: string };
    const {
      shopperId,
      invoiceMode,
      expiresAt: providedExpiresAt,
      cashAmountCents,
      miscItems,
      holdIds,
    } = req.body as {
      shopperId?: string;
      invoiceMode?: string;
      expiresAt?: string;
      cashAmountCents?: number;
      miscItems?: Array<{ title: string; amount: number }>;
      holdIds?: string[];
    };

    if (!sessionId) return res.status(400).json({ message: 'sessionId required' });
    if (!shopperId) return res.status(400).json({ message: 'shopperId required' });
    if (!invoiceMode || !['QUICK', 'TRUST'].includes(invoiceMode)) {
      return res.status(400).json({ message: 'invoiceMode must be QUICK or TRUST' });
    }
    if (holdIds && (!Array.isArray(holdIds) || holdIds.length === 0)) {
      return res.status(400).json({ message: 'holdIds must be non-empty array' });
    }
    if (typeof cashAmountCents === 'number' && cashAmountCents < 0) {
      return res.status(400).json({ message: 'cashAmountCents cannot be negative' });
    }

    // Fetch session + verify ownership
    const session = await prisma.pOSSession.findUnique({
      where: { id: sessionId },
      include: { sale: { select: { organizerId: true, id: true } } },
    });

    if (!session) return res.status(404).json({ message: 'Session not found' });
    if (session.sale!.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Session does not belong to your sale' });
    }

    // Fetch shopper
    const shopper = await prisma.user.findUnique({
      where: { id: shopperId },
      select: { id: true, email: true, name: true },
    });

    if (!shopper) return res.status(404).json({ message: 'Shopper not found' });

    // Fetch held items
    const heldReservations = holdIds && holdIds.length > 0
      ? await prisma.itemReservation.findMany({
          where: { id: { in: holdIds } },
          include: { item: { select: { id: true, saleId: true, title: true, price: true, photoUrls: true } } },
        })
      : [];

    // Validate held items
    for (const heldItem of heldReservations) {
      if ((heldItem.item.saleId ?? '') !== session.sale!.id) {
        return res.status(403).json({ message: 'Hold does not belong to this session sale' });
      }
      if (heldItem.status !== 'HOLD_IN_CART') {
        return res.status(409).json({ message: `Hold ${heldItem.id} is not in HOLD_IN_CART state` });
      }
      // Live in-flight claims count too (P0 fix 2026-08-16 — see holdInvoiceClaim.ts).
      if (isInvoicedOrClaimed(heldItem)) {
        return res.status(409).json({ message: `Hold ${heldItem.id} already has an invoice` });
      }
    }

    // P2 idempotency fix (fix-and-reverify batch, same bug class as ADR-098 above): this
    // endpoint had no dedup check against an already-open invoice for this exact cart. The
    // ADR-098 atomic item-claim below only protects the held-item path (heldReservations.length
    // > 0) -- a miscItems-only cart (holdIds omitted) has no Item row to atomically claim, so a
    // double-click or client retry of "Create Invoice" there could create two HoldInvoices (and
    // two Stripe Checkout Sessions) for the same POS cart. Guard: if a PENDING, non-expired
    // HoldInvoice already exists for this cartSessionId+shopper with the exact same set of held
    // item IDs, return it instead of creating a duplicate. (This is a read-then-act check, not a
    // full DB-level atomic claim -- the miscItems-only case has no item resource to claim
    // against; combined with the idempotencyKey on the Stripe call below and the fact this is a
    // lower-risk P2 already partially covered by the ADR-098 item claim for the common
    // held-items case, this closes the gap without a schema change.)
    const requestedItemIdsSorted = heldReservations.map((r) => r.item.id).sort();
    const existingSessionInvoice = await prisma.holdInvoice.findFirst({
      where: {
        cartSessionId: sessionId,
        shopperUserId: shopperId,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existingSessionInvoice) {
      const existingItemIdsSorted = [...existingSessionInvoice.itemIds].sort();
      const sameItems =
        existingItemIdsSorted.length === requestedItemIdsSorted.length &&
        existingItemIdsSorted.every((id, i) => id === requestedItemIdsSorted[i]);
      if (sameItems) {
        return res.json({
          invoiceId: existingSessionInvoice.id,
          stripeSessionId: existingSessionInvoice.stripeSessionId,
          invoiceMode: existingSessionInvoice.invoiceMode,
          totalAmountCents: existingSessionInvoice.totalAmount,
          cashAmountCents: existingSessionInvoice.cashAmountCents,
          cardAmountCents: existingSessionInvoice.cardAmountCents,
          platformFeeAmount: existingSessionInvoice.platformFeeAmount,
          status: existingSessionInvoice.status,
          expiresAt: existingSessionInvoice.expiresAt,
          createdAt: existingSessionInvoice.createdAt,
        });
      }
    }

    // ADR-098 (2026-07-29): re-verify + atomically claim every held item before invoicing
    // the cart. Same gap as sendHoldInvoice (ADR-098 Section 3 point 1) — this endpoint
    // previously never read Item.status or Purchase, relying solely on
    // ItemReservation.status (HOLD_IN_CART, checked above), so an item sold through a
    // different channel since it was pulled into this cart could still be invoiced. All
    // items in the cart are committed inside ONE transaction so that if any single item
    // loses the race, the whole cart's invoice creation is blocked together rather than
    // silently invoicing a partial cart.
    if (heldReservations.length > 0) {
      try {
        await prisma.$transaction(async (tx) => {
          for (const heldItem of heldReservations) {
            await commitItemSale(heldItem.item.id, 'INVOICE_ISSUED', ['AVAILABLE', 'RESERVED'], tx);
          }
        });
      } catch (guardError) {
        if (guardError instanceof ItemAlreadyCommittedError) {
          return res.status(409).json({ message: 'One or more items in this cart are no longer available to invoice -- they may have already been sold or invoiced elsewhere.' });
        }
        throw guardError;
      }
    }

    // Calculate totals
    let holdTotalCents = 0;
    const bundledItemIds: string[] = [];
    for (const res of heldReservations) {
      holdTotalCents += Math.round((res.item.price || 0) * 100);
      bundledItemIds.push(res.item.id);
    }

    let miscTotalCents = 0;
    if (miscItems && Array.isArray(miscItems)) {
      for (const item of miscItems) {
        miscTotalCents += Math.round(item.amount * 100);
      }
    }

    const grandTotalCents = holdTotalCents + miscTotalCents;
    const finalCashAmountCents = Math.min(cashAmountCents ?? 0, grandTotalCents);
    const cardAmountCents = grandTotalCents - finalCashAmountCents;

    // Get organizer tier for platform fee calculation.
    // BUG FIX (2026-08-24, found via a systematic sweep for the same pattern after
    // reservationController.ts's identical bug was found+fixed off a real ArtifactMI TEAMS
    // overcharge): this used to query `roleSubscriptions` for `'PRO'` only, silently excluding
    // TEAMS (same bug class already fixed in posPaymentController.ts/terminalController.ts, and
    // just now in reservationController.ts's ONLINE Hold-to-Pay path -- this is the 4th real
    // instance of the same copy-pasted check). `organizer` here (from
    // `resolveOrganizerOrTeamMember` above) already carries `subscriptionTier` directly for BOTH
    // the ORGANIZER and TEAM_MEMBER-acting-for-owner branches (posAuth.ts), so the extra
    // `roleSubscriptions` query is now removed entirely rather than just re-pointed --
    // `organizer.subscriptionTier` is the authoritative field the Organizer row itself carries.
    const platformFeePercent = getPlatformFeeRate(organizer.subscriptionTier as SubscriptionTier);
    const platformFeeCents = Math.round(cardAmountCents * platformFeePercent);

    // Determine expiresAt
    let expiresAt: Date;
    if (invoiceMode === 'QUICK') {
      expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    } else {
      // TRUST mode
      if (providedExpiresAt) {
        expiresAt = new Date(providedExpiresAt);
      } else {
        expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours default
      }
    }

    let stripeSessionId: string | null = null;
    // P0 fix (2026-08-25, Charge C investigation): the email CTA below used to hardcode a
    // /my-invoices/[id] link that has never existed anywhere in packages/frontend/pages --
    // dead for every recipient even on this path, which DOES create a real Stripe session.
    // Captured alongside stripeSessionId so the email closure (a setImmediate callback
    // further down) can use the real, live, payable Checkout Session URL directly instead --
    // same pattern reservationController.markSoldAndCreateInvoice's email already uses.
    let stripeCheckoutUrl: string | null = null;
    // Payments fix (2026-08-03): captured here (broad scope) so it survives past the
    // try block below -- needed for the post-transaction metadata backfill call.
    let stripePaymentIntentId: string | null = null;

    // Create Stripe Checkout Session if cardAmountCents > 0
    if (cardAmountCents > 0) {
      try {
        // Build line_items from held items
        const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

        for (const res of heldReservations) {
          line_items.push({
            price_data: {
              currency: 'usd',
              product_data: {
                name: res.item.title,
                description: res.item.title || 'Secondhand item',
                images: res.item.photoUrls && res.item.photoUrls.length > 0 ? [res.item.photoUrls[0]] : [],
              },
              unit_amount_decimal: String(Math.round((res.item.price || 0) * 100)),
            },
            quantity: 1,
          });
        }

        // Add misc items
        if (miscItems && Array.isArray(miscItems)) {
          for (const miscItem of miscItems) {
            line_items.push({
              price_data: {
                currency: 'usd',
                product_data: {
                  name: miscItem.title,
                  description: 'Additional item',
                },
                unit_amount_decimal: String(Math.round(miscItem.amount * 100)),
              },
              quantity: 1,
            });
          }
        }

        const baseUrl = process.env.FRONTEND_URL || 'https://finda.sale';

        // P0-B fix (2026-08-16): Stripe rejects a Checkout Session whose expires_at is under
        // 30 minutes (or over 24 hours) from Session creation. QUICK mode is a flat 15-minute
        // window -- permanently under the floor, a guaranteed 400 -- and TRUST mode takes an
        // organizer-supplied expiresAt that can just as easily exceed the ceiling. Clamp ONLY
        // the value handed to Stripe; HoldInvoice.expiresAt below keeps the real business
        // deadline (invoiceExpiryJob still governs it). See utils/stripeCheckoutExpiry.ts.
        const checkoutExpiry = stripeCheckoutExpiry(expiresAt);
        if (checkoutExpiry.clampedTo) {
          console.warn(
            `[pos] Stripe expires_at clamped to ${checkoutExpiry.clampedTo} for session ${sessionId} (${invoiceMode}): ` +
            `invoice deadline ${expiresAt.toISOString()} -> Stripe session expiry ${checkoutExpiry.effectiveExpiresAt.toISOString()}. ` +
            `The Checkout Session and HoldInvoice.expiresAt intentionally disagree.`
          );
        }

        // P2 idempotency fix: stable key derived from the cart/session + the exact set of
        // held items + misc items + cash split -- NOT from expiresAt (which is
        // time-derived and would defeat the key on every retry). A retry of the identical
        // "Create Invoice" click reuses the same key so Stripe returns the original
        // session instead of creating a second one.
        const idempotencyKeyPayload = {
          shopperId,
          invoiceMode,
          holdIds: (holdIds ?? []).slice().sort(),
          miscItems: miscItems ?? [],
          cashAmountCents: finalCashAmountCents,
        };
        const idempotencyKey = `pos-invoice-${sessionId}-${crypto
          .createHash('sha256')
          .update(JSON.stringify(idempotencyKeyPayload))
          .digest('hex')
          .slice(0, 40)}`;
        // Direct-charges migration (2026-08-08): staged-rollout routing decision.
        const useDirect = organizer.stripeConnectId
          ? await shouldUseDirectCharge(organizer.id, organizer.stripeConnectId)
          : false;

        const stripeSession = await stripe().checkout.sessions.create(
          {
            payment_method_types: ['card'],
            mode: 'payment',
            // P0 fix (2026-08-26): see identical note on sendHoldInvoice above --
            // same silent metadata-backfill-skip risk, same fix.
            expand: ['payment_intent'],
            customer_email: shopper.email,
            line_items,
            success_url: `${baseUrl}/shopper/checkout-success?paymentStatus=success`,
            cancel_url: `${baseUrl}/shopper/holds?paymentStatus=cancelled`,
            expires_at: checkoutExpiry.expiresAtUnix, // clamped into Stripe's 30min..24h window (P0-B)
            payment_intent_data: {
              metadata: {
                itemIds: bundledItemIds.join(','),
                shopperId: shopper.id,
                organizerId: organizer.id,
                saleId: session.sale!.id,
              },
              application_fee_amount: platformFeeCents,
              // Direct-charges migration (2026-08-08): a Direct charge lives on the
              // connected account itself -- no platform-side Transfer exists, so
              // transfer_data is dropped on that path (the { stripeAccount } request
              // option below routes the Session create call itself to the connected
              // account).
              ...(useDirect ? {} : { transfer_data: { destination: organizer.stripeConnectId! } }),
            },
            metadata: {
              organizerId: organizer.id,
            },
          },
          { idempotencyKey, ...(useDirect ? { stripeAccount: organizer.stripeConnectId! } : {}) }
        );

        stripeSessionId = stripeSession.id;
        stripeCheckoutUrl = stripeSession.url;
        // Record what we just created so the outer catch can close it if the HoldInvoice
        // transaction below never commits (see the orphan guard at the top of this
        // function). `useDirect` is the same routing decision used for the create call.
        createdStripeSessionId = stripeSession.id;
        createdStripeSessionAccount = useDirect ? organizer.stripeConnectId ?? null : null;
        createdChargeType = useDirect ? 'DIRECT' : 'DESTINATION';
        stripePaymentIntentId = typeof stripeSession.payment_intent === 'string'
          ? stripeSession.payment_intent
          : (stripeSession.payment_intent as any)?.id ?? null;

        // P0 fix (2026-08-27, HoldInvoice cmtbgy90q0211p46d8yq5lfuv): `expand: ['payment_intent']`
        // above (the 2026-08-26 fix) does not reliably guarantee the synchronous
        // sessions.create response has payment_intent populated -- confirmed live on a
        // real 2-item bundled invoice, same failure class as sendHoldInvoice's identical
        // gap (see the matching comment there). If it's still falsy here, do a short
        // retry loop against sessions.retrieve (same account-scoping) before giving up --
        // silently writing null lets the metadata backfill below get skipped entirely,
        // which orphans the real webhook-side PaymentIntent from this HoldInvoice.
        if (!stripePaymentIntentId) {
          const retrieveOptions = useDirect ? { stripeAccount: organizer.stripeConnectId! } : undefined;
          for (let attempt = 1; attempt <= 2 && !stripePaymentIntentId; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
            try {
              const retrieved = await stripe().checkout.sessions.retrieve(
                stripeSession.id,
                { expand: ['payment_intent'] },
                retrieveOptions
              );
              stripePaymentIntentId = typeof retrieved.payment_intent === 'string'
                ? retrieved.payment_intent
                : (retrieved.payment_intent as any)?.id ?? null;
            } catch (retrieveErr: any) {
              console.error(
                `[pos] createCombinedInvoice: PaymentIntent retry retrieve (attempt ${attempt}) failed for session ${stripeSession.id}:`,
                retrieveErr?.message ?? retrieveErr
              );
            }
          }
          if (!stripePaymentIntentId) {
            const piGapMsg = `[pos] createCombinedInvoice: stripePaymentIntentId still unavailable after retries for session ${stripeSession.id} -- metadata backfill will be skipped, this invoice depends entirely on invoiceExpiryJob's STRANDED-PAID reconcile backstop.`;
            console.error(piGapMsg);
            try {
              Sentry.captureMessage(piGapMsg, 'error');
            } catch {
              // Sentry may not be initialized -- silently continue
            }
          }
        }
      } catch (stripeError: any) {
        console.error('[pos] Stripe session creation failed:', stripeError);
        return res.status(500).json({
          message: 'Failed to create Stripe checkout session',
          error: stripeError.message,
        });
      }
    }

    // Create HoldInvoice in transaction
    const holdInvoice = await prisma.$transaction(async (tx) => {
      // P0 fix (2026-08-17): clear any dead (CANCELLED/EXPIRED) HoldInvoice still
      // anchored to these reservations before inserting -- HoldInvoice.reservationId is
      // @unique and the anchor was never released. Scoped to the reservations this
      // invoice will cover. See services/holdInvoiceClaim.ts.
      await releaseDeadInvoiceAnchors(tx, heldReservations.map(r => r.id));

      const inv = await tx.holdInvoice.create({
        data: {
          ...(heldReservations.length > 0 ? { reservationId: heldReservations[0].id } : {}),
          shopperUserId: shopper.id,
          // P0-A fix (2026-08-16) -- see the identical note on sendHoldInvoice above.
          // HoldInvoice.organizerUserId FKs to User(id), not Organizer(id).
          organizerUserId: organizer.ownerUserId,
          saleId: session.sale!.id,
          stripeSessionId,
          totalAmount: grandTotalCents,
          platformFeeAmount: platformFeeCents,
          itemIds: bundledItemIds,
          status: 'PENDING',
          expiresAt,
          invoiceMode,
          cashAmountCents: finalCashAmountCents > 0 ? finalCashAmountCents : null,
          cardAmountCents: cardAmountCents > 0 ? cardAmountCents : null,
          cartSessionId: sessionId,
          // Stripe account + charge-shape snapshot (2026-08-18 migration). NULL/NULL on the
          // 100%-cash path (cardAmountCents === 0), which never creates a Stripe session --
          // createdStripeSessionAccount / createdChargeType are still null at their
          // declaration in that case. Closes the same documented gap as
          // markSoldAndCreateInvoice (reservationController.ts).
          chargeType: createdChargeType,
          stripeAccountId: createdStripeSessionAccount,
        },
      });

      // Update all held reservations with invoiceId
      if (heldReservations.length > 0) {
        await tx.itemReservation.updateMany({
          where: { id: { in: holdIds! } },
          data: { invoiceId: inv.id },
        });
      }

      return inv;
    });

    // The Session now belongs to a real, live HoldInvoice -- it must NOT be closed by the
    // orphan guard in the outer catch if anything downstream (metadata backfill, email,
    // response serialization) throws. Clearing the handles is what makes that guard safe to
    // leave unconditional. Mirrors markSoldAndCreateInvoice.
    createdStripeSessionId = null;
    createdStripeSessionAccount = null;

    // Payments fix (2026-08-03): backfill invoiceId onto the PaymentIntent's metadata
    // now that the HoldInvoice row (and its ID) exists -- it didn't exist yet when the
    // Checkout Session was created above. The charge.succeeded webhook keys off
    // paymentIntent.metadata.invoiceId, so without this backfill a payment on this
    // invoice would never be recorded by the webhook (see holdInvoicePaymentRecorder.ts
    // header comment; invoiceExpiryJob's STRANDED-PAID reconcile branch is the backstop
    // for any invoice this still misses). Stripe's metadata.update REPLACES the whole
    // map, so every existing key must be re-sent, not just the new one. Non-fatal --
    // never blocks invoice creation, matches the checkout.session.completed handler's
    // existing non-fatal PaymentIntent-retrieve pattern in stripeController.ts.
    if (stripePaymentIntentId) {
      try {
        await stripe().paymentIntents.update(stripePaymentIntentId, {
          metadata: {
            itemIds: bundledItemIds.join(','),
            shopperId: shopper.id,
            organizerId: organizer.id,
            saleId: session.sale!.id,
            invoiceId: holdInvoice.id,
          },
        });
      } catch (metaErr: any) {
        const metaErrMsg = `[pos] Non-fatal: failed to backfill invoiceId metadata onto PaymentIntent ${stripePaymentIntentId} for invoice ${holdInvoice.id}: ${metaErr?.message ?? metaErr}`;
        console.error(metaErrMsg);
        // Visible alerting, not just a log line: this invoice now depends entirely on
        // invoiceExpiryJob's STRANDED-PAID reconcile backstop (which only fires after
        // the invoice's own expiresAt passes) with zero interim visibility otherwise.
        try {
          Sentry.captureException(metaErr instanceof Error ? metaErr : new Error(metaErrMsg), {
            tags: { area: 'hold-invoice-metadata-backfill' },
            extra: { invoiceId: holdInvoice.id, stripePaymentIntentId },
          });
        } catch {
          // Sentry may not be initialized -- silently continue
        }
      }
    }

    // Send invoice email (fire-and-forget)
    setImmediate(async () => {
      try {
        if (true) {
          const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
          const expiryTime = new Date(expiresAt).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'America/Chicago',
          });

          // Build item list HTML
          let itemsHtml = '';
          for (const res of heldReservations) {
            itemsHtml += `<li><strong>${res.item.title}</strong> - $${((res.item.price || 0) / 100).toFixed(2)}</li>`;
          }
          if (miscItems && Array.isArray(miscItems)) {
            for (const miscItem of miscItems) {
              itemsHtml += `<li><strong>${miscItem.title}</strong> - $${(miscItem.amount / 100).toFixed(2)}</li>`;
            }
          }

          let cautionCopy = '';
          if (invoiceMode === 'TRUST') {
            cautionCopy =
              '<p style="color: #dc2626; font-weight: bold; margin-top: 16px;">By sending this invoice, you\'re allowing the shopper to leave with the item before payment is collected. You may not receive payment.</p>';
          }

          const html = `
            <h2>Invoice for Purchase</h2>
            <p>Hi ${shopper.name},</p>
            <p>Your invoice is ready for payment:</p>
            <ul>${itemsHtml}</ul>
            <hr style="margin: 16px 0;">
            <p><strong>Total Amount:</strong> $${(grandTotalCents / 100).toFixed(2)}</p>
            ${finalCashAmountCents > 0 ? `<p><strong>Cash Collected:</strong> $${(finalCashAmountCents / 100).toFixed(2)}</p>` : ''}
            ${cardAmountCents > 0 ? `<p><strong>Remaining to Charge:</strong> $${(cardAmountCents / 100).toFixed(2)}</p>` : ''}
            <p><strong>Expires at:</strong> ${expiryTime}</p>
            ${cardAmountCents > 0 ? `<p><a href="${stripeCheckoutUrl ?? ''}">Complete Payment</a></p>` : '<p style="color: #10b981;"><strong>Full payment collected at POS.</strong></p>'}
            ${cautionCopy}
          `;

          const emailResult = await transactionalEmailService.emails.send({
            from: fromEmail,
            to: shopper.email,
            subject: `Invoice for your purchase`,
            html,
          });

          // P1 fix (2026-08-25, Charge C investigation): this response already went out via
          // res.json() above (this whole block is a fire-and-forget setImmediate) -- there is
          // no HTTP response left to attach a failure to, unlike sendHoldInvoice's email
          // block below (which runs before its res.json()). Sentry is the correct, honest
          // surface for a fire-and-forget failure; a bare console.warn (the old behavior) is
          // invisible in production the same way the stale EmailSuppression block on
          // deseee@yahoo.com went unnoticed during Charge C.
          if (!emailResult.sent) {
            const warnMsg = `[pos] createCombinedInvoice: invoice email not sent (reason=${emailResult.reason}) to ${shopper.email}`;
            console.warn(warnMsg);
            try {
              Sentry.captureMessage(warnMsg, 'warning');
            } catch {
              // Sentry may not be initialized -- silently continue
            }
          }
        }
      } catch (emailErr) {
        const errMsg = `[pos] createCombinedInvoice: Failed to send invoice email: ${emailErr instanceof Error ? emailErr.message : emailErr}`;
        console.warn(errMsg);
        try {
          Sentry.captureException(emailErr instanceof Error ? emailErr : new Error(errMsg), {
            tags: { area: 'pos-invoice-email' },
          });
        } catch {
          // Sentry may not be initialized -- silently continue
        }
      }
    });

    res.json({
      invoiceId: holdInvoice.id,
      stripeSessionId,
      invoiceMode,
      totalAmountCents: grandTotalCents,
      cashAmountCents: finalCashAmountCents > 0 ? finalCashAmountCents : null,
      cardAmountCents: cardAmountCents > 0 ? cardAmountCents : null,
      platformFeeAmount: platformFeeCents,
      status: 'PENDING',
      expiresAt,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('[pos] createCombinedInvoice error:', error);

    // P1 fix (2026-08-17): close an orphaned Checkout Session. A handle still set here
    // means the HoldInvoice transaction never committed, so NO invoice exists for that
    // session -- and unlike a hold invoice there is no expiry job that will ever find it
    // (invoiceExpiryJob scans HoldInvoice rows, and there is no row). Leaving it OPEN lets
    // the shopper pay a live link for a cart nobody is tracking a payment for. The helper
    // never throws and is awaited before the response so the closure attempt actually
    // happens; the .catch guarantees it can never mask the original error.
    if (createdStripeSessionId) {
      await expireCheckoutSessionSafely(createdStripeSessionId, {
        stripeAccount: createdStripeSessionAccount,
        context: `createCombinedInvoice orphan session=${req.params?.sessionId}`,
      }).catch((e: unknown) => console.error('[pos] Failed to close orphaned checkout session:', e));
    }

    res.status(500).json({ message: 'Failed to create invoice' });
  }
};
