import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getStripe } from '../utils/stripe';
import { getIO } from '../lib/socket';
import { createNotification } from '../lib/notificationService';
import { awardXp, applyHuntPassMultiplier, XP_AWARDS } from '../services/xpService';

const stripe = () => getStripe();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the organizer record for the authenticated user.
 * Requires ORGANIZER role and valid Stripe Connect account.
 */
const resolveOrganizer = async (req: AuthRequest, res: Response) => {
  const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
  if (!req.user || !hasOrganizerRole) {
    res.status(403).json({ message: 'Organizer access required' });
    return null;
  }

  const organizer = await prisma.organizer.findUnique({
    where: { userId: req.user.id },
    select: { id: true, stripeConnectId: true, userId: true },
  });

  if (!organizer) {
    res.status(404).json({ message: 'Organizer profile not found' });
    return null;
  }

  if (!organizer.stripeConnectId) {
    res.status(400).json({
      message: 'Stripe account not connected. Complete Stripe onboarding in Settings before using POS.',
    });
    return null;
  }

  return organizer;
};

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

    const organizer = await resolveOrganizer(req, res);
    if (!organizer) return;

    const {
      shopperUserId,
      saleId,
      itemIds,
      totalAmountCents,
      expiresInSeconds = 900, // 15 minutes default
    } = req.body as {
      shopperUserId?: string;
      saleId?: string;
      itemIds?: string[];
      totalAmountCents?: number;
      expiresInSeconds?: number;
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

    // Verify sale exists, is PUBLISHED, and belongs to organizer
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true, status: true, organizerId: true, title: true, address: true, city: true, state: true },
    });

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

      const unavailableItems = items.filter(
        (item) => !['AVAILABLE', 'RESERVED'].includes(item.status)
      );
      if (unavailableItems.length > 0) {
        return res.status(400).json({
          message: 'One or more items are no longer available',
          unavailableItemIds: unavailableItems.map((i) => i.id),
        });
      }
    }

    // Verify shopper exists
    const shopper = await prisma.user.findUnique({
      where: { id: shopperUserId },
      select: { id: true, name: true, email: true },
    });

    if (!shopper) return res.status(404).json({ message: 'Shopper not found' });

    // 60-second duplicate block: check for recent PENDING requests to same shopper
    const recentRequest = await prisma.pOSPaymentRequest.findFirst({
      where: {
        shopperUserId,
        organizerId: organizer.id,
        saleId,
        status: 'PENDING',
        createdAt: {
          gte: new Date(Date.now() - 60 * 1000), // within last 60 seconds
        },
      },
    });

    if (recentRequest) {
      return res.status(429).json({
        message: 'A payment request was already sent to this shopper in the last 60 seconds',
      });
    }

    // Calculate platform fee (10%)
    const platformFeeCents = Math.round(totalAmountCents * 0.1);

    // Create Stripe Payment Intent
    let paymentIntent;
    try {
      paymentIntent = await stripe().paymentIntents.create(
        {
          amount: totalAmountCents,
          currency: 'usd',
          payment_method_types: ['card'],
          application_fee_amount: platformFeeCents, // 10% platform fee
          metadata: {
            requestId: '', // will be filled in after DB creation
            organizerId: organizer.id,
            organizerUserId: organizer.userId,
            shopperId: shopperUserId,
            saleId,
            source: 'pos_payment_request',
          },
        },
        {
          stripeAccount: organizer.stripeConnectId!,
        }
      );
    } catch (err: any) {
      console.error('[pos-payment] Failed to create Stripe Payment Intent:', err);
      return res.status(500).json({
        message: 'Failed to create payment intent',
        error: err.message,
      });
    }

    // Create POSPaymentRequest record
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    let posRequest;
    try {
      posRequest = await prisma.pOSPaymentRequest.create({
        data: {
          organizerId: organizer.id,
          organizerUserId: organizer.userId,
          shopperUserId,
          saleId,
          itemIds,
          totalAmountCents,
          platformFeeCents,
          expiresAt,
          stripePaymentIntentId: paymentIntent.id,
          clientSecret: paymentIntent.client_secret!,
        },
      });

      // Update PI metadata with requestId
      await stripe().paymentIntents.update(
        paymentIntent.id,
        {
          metadata: {
            requestId: posRequest.id,
            organizerId: organizer.id,
            organizerUserId: organizer.userId,
            shopperId: shopperUserId,
            saleId,
            source: 'pos_payment_request',
          },
        },
        {
          stripeAccount: organizer.stripeConnectId!,
        }
      );
    } catch (err: any) {
      console.error('[pos-payment] Failed to create POSPaymentRequest:', err);
      return res.status(500).json({ message: 'Failed to create payment request' });
    }

    // Emit socket event to shopper
    try {
      const io = getIO();
      const itemNames = items.map((item) => item.title);
      io.to(`user:${shopperUserId}`).emit('POS_PAYMENT_REQUEST', {
        type: 'POS_PAYMENT_REQUEST',
        requestId: posRequest.id,
        organizerName: `${organizer.userId}`, // Will use sale.organizer.businessName in prod
        saleName: sale.title,
        saleLocation: [sale.address, sale.city, sale.state].filter(Boolean).join(', ') || undefined,
        itemNames,
        totalAmountCents,
        displayAmount: `$${(totalAmountCents / 100).toFixed(2)}`,
        expiresAt: expiresAt.toISOString(),
        expiresIn: expiresInSeconds,
        stripePaymentIntentSecret: paymentIntent.client_secret,
        deepLink: `/shopper/pay-request/${posRequest.id}`,
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

    // Check expiration
    const isExpired = new Date() > request.expiresAt;

    return res.json({
      id: request.id,
      organizerName: request.organizer?.name || 'Unknown Organizer',
      saleName: request.sale?.title,
      saleLocation: request.sale ? [request.sale.address, request.sale.city, request.sale.state].filter(Boolean).join(', ') : undefined,
      itemIds: request.itemIds,
      totalAmountCents: request.totalAmountCents,
      displayAmount: `$${(request.totalAmountCents / 100).toFixed(2)}`,
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
    }));

    return res.json({ requests: formatted });
  } catch (err: any) {
    console.error('[pos-payment] getPendingPaymentRequests error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
