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
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getStripe } from '../utils/stripe';

const stripe = () => getStripe();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the organizer record + stripeConnectId for the authed user.
 * (Imported pattern from terminalController.ts)
 */
const resolveOrganizer = async (req: AuthRequest, res: Response, opts: { requireStripe?: boolean } = {}) => {
  const { requireStripe = true } = opts;
  const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
  if (!req.user || !hasOrganizerRole) {
    res.status(403).json({ message: 'Organizer access required' });
    return null;
  }

  const organizer = await prisma.organizer.findUnique({
    where: { userId: req.user.id },
    select: { id: true, stripeConnectId: true },
  });

  if (!organizer) {
    res.status(404).json({ message: 'Organizer profile not found' });
    return null;
  }

  if (requireStripe && !organizer.stripeConnectId) {
    res.status(400).json({
      message: 'Stripe account not connected. Complete Stripe onboarding in Settings before using POS.',
    });
    return null;
  }

  return organizer;
};

// ─── Endpoints ────────────────────────────────────────────────────────────────

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
      select: { id: true, status: true },
    });

    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    if (sale.status !== 'PUBLISHED') {
      return res.status(400).json({ message: 'Sale is not published' });
    }

    // Create POSSession
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
    const session = await prisma.pOSSession.create({
      data: {
        organizerId: sale.id, // Will be updated by frontend — temporarily use saleId lookup
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
    const organizer = await resolveOrganizer(req, res, { requireStripe: false });
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
        shopper: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = sessions.map(s => {
      const cartItems = Array.isArray(s.cartItems) ? s.cartItems : [];
      const cartTotal = cartItems.reduce((sum, item: any) => sum + (item.price || 0), 0);
      return {
        id: s.id,
        shopperId: s.shopperId,
        shopperName: s.shopper?.name || 'Guest',
        cartItems,
        cartTotal,
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
    const organizer = await resolveOrganizer(req, res, { requireStripe: false });
    if (!organizer) return;

    const { sessionId } = req.params as { sessionId?: string };
    if (!sessionId) return res.status(400).json({ message: 'sessionId required' });

    // Fetch session + verify ownership
    const session = await prisma.pOSSession.findUnique({
      where: { id: sessionId },
      include: { sale: { select: { organizerId: true } } },
    });

    if (!session) return res.status(404).json({ message: 'Session not found' });
    if (session.sale.organizerId !== organizer.id) {
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
    const isSimulated = process.env.STRIPE_TERMINAL_SIMULATED === 'true';
    const organizer = await resolveOrganizer(req, res, { requireStripe: !isSimulated });
    if (!organizer) return;

    const { saleId, itemIds, amount } = req.body as {
      saleId?: string;
      itemIds?: string[];
      amount?: number;
    };

    if (!saleId) return res.status(400).json({ message: 'saleId is required' });
    if (!itemIds || !Array.isArray(itemIds)) {
      return res.status(400).json({ message: 'itemIds must be non-empty array' });
    }
    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ message: 'amount must be positive number (in dollars)' });
    }

    // Verify items exist and belong to organizer's sale
    const items = await prisma.item.findMany({
      where: {
        id: { in: itemIds },
        saleId,
        status: 'AVAILABLE',
      },
      select: { id: true, title: true, price: true },
    });

    if (items.length !== itemIds.length) {
      return res.status(400).json({ message: 'Some items not found, sold, or unavailable' });
    }

    // Verify sale belongs to organizer
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { organizerId: true },
    });

    if (!sale || sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Sale does not belong to your account' });
    }

    // Convert amount to cents for Stripe
    const amountCents = Math.round(amount * 100);

    // Create Stripe Payment Link
    let paymentLinkUrl = '';
    let stripePaymentLinkId = '';

    if (isSimulated) {
      // Simulated mode: mock payment link
      stripePaymentLinkId = `plink_sim_${Date.now()}`;
      paymentLinkUrl = `https://buy.stripe.com/test/sim_${Date.now()}`;
    } else {
      try {
        // Payment Links require a pre-created Price object (price_data not supported)
        const adHocPrice = await stripe().prices.create({
          currency: 'usd',
          unit_amount: amountCents,
          product_data: {
            name: `FindA.Sale — ${items.map(i => i.title).join(', ').slice(0, 200)}`,
          },
        });

        const paymentLink = await stripe().paymentLinks.create({
          line_items: [{ price: adHocPrice.id, quantity: 1 }],
          after_completion: {
            type: 'hosted_confirmation' as const,
          },
        });

        stripePaymentLinkId = paymentLink.id;
        paymentLinkUrl = paymentLink.url;
      } catch (stripeErr) {
        console.error('[pos] Stripe payment link creation failed:', stripeErr);
        return res.status(500).json({ message: 'Failed to create payment link' });
      }
    }

    // Generate QR code as base64 data URL
    let qrCodeDataUrl: string | undefined;
    try {
      const qrcode = require('qrcode');
      qrCodeDataUrl = await qrcode.toDataURL(paymentLinkUrl);
    } catch (qrErr) {
      console.warn('[pos] QR code generation failed:', qrErr);
      // Graceful degradation — don't fail if QR fails
    }

    // Create POSPaymentLink record
    const posPaymentLink = await prisma.pOSPaymentLink.create({
      data: {
        organizerId: organizer.id,
        saleId,
        stripePaymentLinkId,
        stripePaymentLinkUrl: paymentLinkUrl,
        qrCodeDataUrl,
        amount: amountCents,
        itemIds,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      },
    });

    res.json({
      linkId: posPaymentLink.id,
      paymentLinkUrl,
      qrCodeDataUrl,
      amount,
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
    const organizer = await resolveOrganizer(req, res, { requireStripe: false });
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
    const organizer = await resolveOrganizer(req, res, { requireStripe: false });
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

    // Get active holds: CONFIRMED, not expired, no invoice
    const holds = await prisma.itemReservation.findMany({
      where: {
        item: { saleId },
        status: 'CONFIRMED',
        expiresAt: { gt: new Date() },
        invoiceId: null,
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
    const organizer = await resolveOrganizer(req, res, { requireStripe: false });
    if (!organizer) return;

    const { reservationId } = req.params as { reservationId?: string };
    const { deliverVia } = req.body as { deliverVia?: string };

    if (!reservationId) return res.status(400).json({ message: 'reservationId required' });
    if (!deliverVia || deliverVia !== 'EMAIL') {
      return res.status(400).json({ message: 'deliverVia must be EMAIL (MVP)' });
    }

    // Fetch reservation
    const reservation = await prisma.itemReservation.findUnique({
      where: { id: reservationId },
      include: {
        item: { select: { id: true, title: true, price: true, sale: { select: { id: true, organizerId: true } } } },
        user: { select: { id: true, email: true, name: true } },
      },
    });

    if (!reservation) return res.status(404).json({ message: 'Reservation not found' });
    if (reservation.item.sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Reservation does not belong to your sale' });
    }

    // Check if invoice already exists
    if (reservation.invoiceId) {
      return res.status(400).json({ message: 'Invoice already exists for this reservation' });
    }

    // Create HoldInvoice record (simplified for MVP — no actual Stripe Checkout)
    const holdInvoice = await prisma.holdInvoice.create({
      data: {
        reservationId,
        shopperUserId: reservation.userId,
        organizerUserId: organizer.id,
        saleId: reservation.item.sale.id,
        itemIds: [reservation.itemId],
        totalAmount: Math.round(reservation.item.price! * 100), // in cents
        platformFeeAmount: Math.round(reservation.item.price! * 0.1 * 100), // 10% fee in cents
        status: 'PENDING',
        expiresAt: reservation.expiresAt, // inherit hold expiry
      },
    });

    // Update reservation with invoice reference
    await prisma.itemReservation.update({
      where: { id: reservationId },
      data: { invoiceId: holdInvoice.id },
    });

    // Send email (Resend integration — basic version)
    if (reservation.user.email && process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import('resend');
        const { buildEmail } = await import('../services/emailTemplateService');
        const resend = new Resend(process.env.RESEND_API_KEY);
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'invoices@finda.sale';

        const html = buildEmail({
          preheader: `Invoice for your hold`,
          headline: `Invoice: ${reservation.item.title}`,
          body: `<p>Hi ${reservation.user.name},</p><p>Your hold on <strong>${reservation.item.title}</strong> for $${reservation.item.price?.toFixed(2)} is ready. Payment link in dashboard.</p>`,
          ctaText: 'View Invoice',
          ctaUrl: `${process.env.FRONTEND_URL || 'https://finda.sale'}/my-invoices/${holdInvoice.id}`,
          accentColor: '#10b981',
        });

        await resend.emails.send({
          from: fromEmail,
          to: reservation.user.email,
          subject: `Invoice: ${reservation.item.title}`,
          html,
        });
      } catch (emailErr) {
        console.warn('[pos] Failed to send invoice email:', emailErr);
      }
    }

    res.json({ invoiceId: holdInvoice.id, status: 'SENT' });
  } catch (error) {
    console.error('[pos] sendHoldInvoice error:', error);
    res.status(500).json({ message: 'Failed to send invoice' });
  }
};
