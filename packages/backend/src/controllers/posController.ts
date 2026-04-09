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
    // Payment Links are independent of the Terminal/card-reader simulation flag.
    // Always require a real Stripe connected account — never generate a fake URL.
    const organizer = await resolveOrganizer(req, res, { requireStripe: true });
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

    try {
      // Payment Links require a pre-created Price object (price_data not supported)
      // Use platform-side pricing + destination charges (matching PaymentIntent pattern)
      const platformFeeAmount = Math.round(amountCents * 0.1); // 10% platform fee

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
        payment_intent_data: {
          application_fee_amount: platformFeeAmount,
          transfer_data: {
            destination: organizer.stripeConnectId!,
          },
        } as any,
      });

      stripePaymentLinkId = paymentLink.id;
      paymentLinkUrl = paymentLink.url;
    } catch (stripeErr) {
      console.error('[pos] Stripe payment link creation failed:', stripeErr);
      return res.status(500).json({ message: 'Failed to create payment link' });
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

    // Get active holds: PENDING or CONFIRMED, not expired, no invoice yet
    const holds = await prisma.itemReservation.findMany({
      where: {
        item: { saleId },
        status: { in: ['PENDING', 'CONFIRMED'] },
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
    const { deliverVia, expiryHours, miscItems } = req.body as {
      deliverVia?: string;
      expiryHours?: number;
      miscItems?: Array<{ id: string; title: string; amount: number }>;
    };

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

    // Calculate total: held item + misc items
    const heldItemTotal = Math.round(reservation.item.price! * 100); // in cents
    const miscTotal = miscItems ? miscItems.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) : 0;
    const grandTotal = heldItemTotal + miscTotal;
    const platformFeeAmount = Math.round(grandTotal * 0.1); // 10% fee on total

    // Create HoldInvoice record (simplified for MVP — no actual Stripe Checkout)
    const holdInvoice = await prisma.holdInvoice.create({
      data: {
        reservationId,
        shopperUserId: reservation.userId,
        organizerUserId: organizer.id,
        saleId: reservation.item.sale.id,
        itemIds: [reservation.itemId],
        totalAmount: grandTotal,
        platformFeeAmount,
        status: 'PENDING',
        expiresAt: expiryHours ? new Date(Date.now() + expiryHours * 60 * 60 * 1000) : reservation.expiresAt,
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
          body: `<p>Hi ${reservation.user.name},</p><p>Your hold is ready for payment:</p><p>${itemsList}</p><p><strong>Total: $${(grandTotal / 100).toFixed(2)}</strong></p><p>Payment link in dashboard.</p>`,
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

/**
 * DELETE /api/pos/sessions/:sessionId
 * Organizer removes a stale or unwanted open cart (organizer-only)
 *
 * Response: { success: true }
 */
export const deleteSession = async (req: AuthRequest, res: Response) => {
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
    const organizer = await resolveOrganizer(req, res, { requireStripe: false });
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
    if (session.sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Session does not belong to your sale' });
    }

    // Find holds for this shopper at this sale
    const holds = await prisma.itemReservation.findMany({
      where: {
        item: { saleId: session.saleId },
        user: { email: { contains: email, mode: 'insensitive' } },
        status: { in: ['PENDING', 'CONFIRMED'] },
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
    const organizer = await resolveOrganizer(req, res, { requireStripe: false });
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
    if (session.sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Session does not belong to your sale' });
    }

    // Fetch all reservations + verify they're valid for pulling
    const reservations = await prisma.itemReservation.findMany({
      where: { id: { in: reservationIds } },
      include: { item: { select: { saleId: true, title: true } } },
    });

    // Validate all reservations
    for (const res of reservations) {
      if (res.item.saleId !== session.saleId) {
        return res.status(403).json({ message: 'Reservation does not belong to this session sale' });
      }
      if (!['PENDING', 'CONFIRMED'].includes(res.status)) {
        return res.status(409).json({ message: `Reservation ${res.id} is not in PENDING or CONFIRMED state` });
      }
      if (res.invoiceId) {
        return res.status(409).json({ message: `Reservation ${res.id} already has an invoice` });
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
  try {
    const organizer = await resolveOrganizer(req, res, { requireStripe: true });
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
    if (session.sale.organizerId !== organizer.id) {
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
    for (const res of heldReservations) {
      if (res.item.saleId !== session.sale.id) {
        return res.status(403).json({ message: 'Hold does not belong to this session sale' });
      }
      if (res.status !== 'HOLD_IN_CART') {
        return res.status(409).json({ message: `Hold ${res.id} is not in HOLD_IN_CART state` });
      }
      if (res.invoiceId) {
        return res.status(409).json({ message: `Hold ${res.id} already has an invoice` });
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

    // Get organizer tier for platform fee calculation
    const organizerWithRole = await prisma.organizer.findUnique({
      where: { id: organizer.id },
      include: { user: { select: { roleSubscriptions: true } } },
    });

    const hasPro = organizerWithRole?.user?.roleSubscriptions?.some(
      rs => rs.subscriptionTier === 'PRO'
    ) ?? false;
    const platformFeePercent = hasPro ? 0.08 : 0.10;
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

    // Create Stripe Checkout Session if cardAmountCents > 0
    if (cardAmountCents > 0) {
      try {
        // Build line_items from held items
        const line_items = [];

        for (const res of heldReservations) {
          line_items.push({
            price_data: {
              currency: 'usd',
              product_data: {
                name: res.item.title,
                description: 'Estate sale item',
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
        const stripeSession = await stripe().checkout.sessions.create({
          payment_method_types: ['card'],
          mode: 'payment',
          customer_email: shopper.email,
          line_items,
          success_url: `${baseUrl}/items?paymentStatus=success`,
          cancel_url: `${baseUrl}/items?paymentStatus=cancelled`,
          expires_at: Math.floor(expiresAt.getTime() / 1000),
          payment_intent_data: {
            metadata: {
              itemIds: bundledItemIds.join(','),
              shopperId: shopper.id,
              organizerId: organizer.id,
              saleId: session.sale.id,
            },
            application_fee_amount: platformFeeCents,
            transfer_data: {
              destination: organizer.stripeConnectId!,
            },
          },
          metadata: {
            organizerId: organizer.id,
          },
        });

        stripeSessionId = stripeSession.id;
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
      const inv = await tx.holdInvoice.create({
        data: {
          reservationId: heldReservations.length > 0 ? heldReservations[0].id : undefined,
          shopperUserId: shopper.id,
          organizerUserId: organizer.id,
          saleId: session.sale.id,
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

    // Send invoice email (fire-and-forget)
    setImmediate(async () => {
      try {
        const resend = require('resend').Resend ? new (require('resend').Resend)(process.env.RESEND_API_KEY) : null;
        if (resend) {
          const fromEmail = process.env.RESEND_FROM_EMAIL || 'invoices@finda.sale';
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
            ${cardAmountCents > 0 ? `<p><a href="${stripeSessionId ? `${process.env.FRONTEND_URL || 'https://finda.sale'}/my-invoices/${holdInvoice.id}` : ''}">Complete Payment</a></p>` : '<p style="color: #10b981;"><strong>Full payment collected at POS.</strong></p>'}
            ${cautionCopy}
          `;

          await resend.emails.send({
            from: fromEmail,
            to: shopper.email,
            subject: `Invoice for your purchase`,
            html,
          });
        }
      } catch (emailErr) {
        console.warn('[pos] Failed to send invoice email:', emailErr);
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
    res.status(500).json({ message: 'Failed to create invoice' });
  }
};
