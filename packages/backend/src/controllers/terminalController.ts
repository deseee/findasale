/**
 * Stripe Terminal POS Controller
 *
 * Handles in-person card payments for organizers using Stripe Terminal.
 * All endpoints require organizer JWT + a configured stripeConnectId.
 *
 * Reader: BBPOS WisePOS E / S700 (WiFi, internet discovery mode)
 * Payment flow: connection-token → payment-intent → [SDK presents to reader] → capture
 */
import { Response } from 'express';
import { getStripe } from '../utils/stripe';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const stripe = () => getStripe();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the organizer record + stripeConnectId for the authed user.
 * Returns null (and writes 4xx response) if not eligible.
 */
const resolveOrganizer = async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== 'ORGANIZER') {
    res.status(403).json({ message: 'Organizer access required' });
    return null;
  }

  const organizer = await prisma.organizer.findUnique({
    where: { userId: req.user.id },
    select: { id: true, stripeConnectId: true, referralDiscountExpiry: true },
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
 * POST /api/stripe/terminal/connection-token
 * Creates a Stripe Terminal connection token scoped to the organizer's
 * connected Stripe account. The frontend SDK uses this to discover readers.
 */
export const createConnectionToken = async (req: AuthRequest, res: Response) => {
  try {
    const organizer = await resolveOrganizer(req, res);
    if (!organizer) return;

    // Create connection token on the organizer's connected account
    const token = await stripe().terminal.connectionTokens.create(
      {},
      { stripeAccount: organizer.stripeConnectId! }
    );

    res.json({ secret: token.secret });
  } catch (error) {
    console.error('[terminal] createConnectionToken error:', error);
    res.status(500).json({ message: 'Failed to create Terminal connection token' });
  }
};

/**
 * POST /api/stripe/terminal/payment-intent
 * Body: { itemId: string, buyerEmail?: string }
 *
 * Creates a Stripe PaymentIntent for an in-person terminal payment.
 * Uses capture_method: 'manual' (Terminal requires explicit capture after card swipe).
 * Applies same 10% platform fee as online purchases.
 */
export const createTerminalPaymentIntent = async (req: AuthRequest, res: Response) => {
  try {
    const organizer = await resolveOrganizer(req, res);
    if (!organizer) return;

    const { itemId, buyerEmail } = req.body as { itemId?: string; buyerEmail?: string };

    if (!itemId) {
      return res.status(400).json({ message: 'itemId is required' });
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        title: true,
        price: true,
        status: true,
        draftStatus: true,
        listingType: true,
        sale: {
          select: {
            id: true,
            organizerId: true,
            organizer: {
              select: { id: true, stripeConnectId: true },
            },
          },
        },
      },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Ensure the item belongs to this organizer
    if (item.sale.organizer.id !== organizer.id) {
      return res.status(403).json({ message: 'Item does not belong to your sale' });
    }

    if (item.status !== 'AVAILABLE') {
      return res.status(400).json({ message: `Item is not available for purchase (status: ${item.status})` });
    }

    if (item.price == null || item.price <= 0) {
      return res.status(400).json({ message: 'Item must have a price set before processing payment' });
    }

    if (item.price < 0.5) {
      return res.status(400).json({ message: 'Item price must be at least $0.50 to process payment' });
    }

    // Fee: read from FeeStructure (same as online), apply referral discount if active
    const feeStructure = await prisma.feeStructure.findFirst({ where: { listingType: '*' } });
    const baseFeeRate = feeStructure?.feeRate ?? 0.10;
    const hasReferralDiscount =
      organizer.referralDiscountExpiry != null && organizer.referralDiscountExpiry > new Date();
    const feeRate = hasReferralDiscount ? 0 : baseFeeRate;

    const priceCents = Math.round(item.price * 100);
    const platformFeeAmount = Math.round(priceCents * feeRate);

    // Create terminal PaymentIntent on the organizer's connected account
    const paymentIntent = await stripe().paymentIntents.create(
      {
        amount: priceCents,
        currency: 'usd',
        payment_method_types: ['card_present'], // Terminal-only: physical card reader
        capture_method: 'manual',               // Terminal requires explicit capture
        application_fee_amount: platformFeeAmount,
        metadata: {
          itemId: item.id,
          saleId: item.sale.id,
          source: 'POS',
          ...(buyerEmail ? { buyerEmail } : {}),
        },
      },
      { stripeAccount: organizer.stripeConnectId! }
    );

    // Create PENDING Purchase record immediately (same pattern as online flow)
    const purchase = await prisma.purchase.create({
      data: {
        // userId intentionally null — POS walk-in buyer has no account
        itemId: item.id,
        saleId: item.sale.id,
        amount: priceCents / 100,
        platformFeeAmount: platformFeeAmount / 100,
        stripePaymentIntentId: paymentIntent.id,
        status: 'PENDING',
        source: 'POS',
        ...(buyerEmail ? { buyerEmail } : {}),
      },
    });

    res.json({
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      purchaseId: purchase.id,
      amount: priceCents / 100,
      platformFee: platformFeeAmount / 100,
      itemTitle: item.title,
    });
  } catch (error) {
    console.error('[terminal] createTerminalPaymentIntent error:', error);
    res.status(500).json({ message: 'Failed to create Terminal payment intent' });
  }
};

/**
 * POST /api/stripe/terminal/capture
 * Body: { paymentIntentId: string }
 *
 * Captures a terminal PaymentIntent after the card has been presented to the reader.
 * Marks the Purchase PAID and the Item SOLD.
 * The Stripe webhook (payment_intent.succeeded) also fires — the webhook handler
 * handles idempotency via ProcessedWebhookEvent.
 */
export const captureTerminalPaymentIntent = async (req: AuthRequest, res: Response) => {
  try {
    const organizer = await resolveOrganizer(req, res);
    if (!organizer) return;

    const { paymentIntentId } = req.body as { paymentIntentId?: string };

    if (!paymentIntentId) {
      return res.status(400).json({ message: 'paymentIntentId is required' });
    }

    const purchase = await prisma.purchase.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
      include: {
        item: {
          select: {
            id: true,
            status: true,
            title: true,
            sale: { select: { organizerId: true } },
          },
        },
      },
    });

    if (!purchase) {
      return res.status(404).json({ message: 'Purchase not found for this payment intent' });
    }

    // Verify the purchase's sale belongs to the current organizer (ownership check)
    if (!purchase.item || purchase.item.sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'You do not have permission to capture this payment' });
    }

    if (purchase.status === 'PAID') {
      // Already captured (idempotent — webhook may have already processed it)
      return res.json({ purchaseId: purchase.id, status: 'PAID', receiptSent: false });
    }

    // Re-check item status: if another transaction sold it concurrently, cancel this PI
    const currentItemStatus = await prisma.item.findUnique({
      where: { id: purchase.itemId! },
      select: { status: true },
    });

    if (currentItemStatus?.status === 'SOLD' && purchase.status !== 'PAID') {
      // Item was sold by another concurrent transaction — cancel this PI and fail the purchase
      try {
        await stripe().paymentIntents.cancel(
          paymentIntentId,
          {},
          { stripeAccount: organizer.stripeConnectId! }
        );
      } catch (e) {
        console.warn('[terminal] Failed to cancel PI during concurrent guard:', e);
      }

      await prisma.purchase.update({
        where: { id: purchase.id },
        data: { status: 'FAILED' },
      });

      return res.status(409).json({
        message: 'Item was sold by another transaction before this payment could be captured',
      });
    }

    // Capture the payment on the organizer's connected account
    await stripe().paymentIntents.capture(
      paymentIntentId,
      {},
      { stripeAccount: organizer.stripeConnectId! }
    );

    // Mark purchase PAID + item SOLD
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { status: 'PAID' },
    });

    if (purchase.itemId) {
      await prisma.item.update({
        where: { id: purchase.itemId },
        data: { status: 'SOLD' },
      });
    }

    // Send receipt to buyer if email was provided
    let receiptSent = false;
    const buyerEmail = purchase.buyerEmail;
    if (buyerEmail && process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import('resend');
        const { buildEmail } = await import('../services/emailTemplateService');
        const resend = new Resend(process.env.RESEND_API_KEY);
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'receipts@finda.sale';
        const html = buildEmail({
          preheader: `Receipt for ${purchase.item?.title ?? 'your purchase'}`,
          headline: 'Your receipt from FindA.Sale 🎉',
          body: `<p>Thank you for your purchase!</p><p>Amount paid: <strong>$${purchase.amount.toFixed(2)}</strong>${purchase.item?.title ? ` for <strong>${purchase.item.title}</strong>` : ''}.</p><p>Payment processed securely via Stripe.</p>`,
          ctaText: 'Visit FindA.Sale',
          ctaUrl: process.env.FRONTEND_URL || 'https://finda.sale',
          accentColor: '#10b981',
        });
        await resend.emails.send({
          from: fromEmail,
          to: buyerEmail,
          subject: `Receipt: ${purchase.item?.title ?? 'Your in-person purchase'}`,
          html,
        });
        receiptSent = true;
      } catch (emailErr) {
        console.warn('[terminal] Failed to send POS receipt email:', emailErr);
      }
    }

    res.json({ purchaseId: purchase.id, status: 'PAID', receiptSent });
  } catch (error) {
    console.error('[terminal] captureTerminalPaymentIntent error:', error);
    res.status(500).json({ message: 'Failed to capture Terminal payment' });
  }
};

/**
 * POST /api/stripe/terminal/cancel
 * Body: { paymentIntentId: string }
 *
 * Cancels an in-progress terminal PaymentIntent (e.g. buyer walks away).
 * Marks the Purchase FAILED and returns the Item to AVAILABLE.
 */
export const cancelTerminalPaymentIntent = async (req: AuthRequest, res: Response) => {
  try {
    const organizer = await resolveOrganizer(req, res);
    if (!organizer) return;

    const { paymentIntentId } = req.body as { paymentIntentId?: string };

    if (!paymentIntentId) {
      return res.status(400).json({ message: 'paymentIntentId is required' });
    }

    const purchase = await prisma.purchase.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
    });

    if (!purchase) {
      return res.status(404).json({ message: 'Purchase not found' });
    }

    if (purchase.status === 'PAID') {
      return res.status(400).json({ message: 'Cannot cancel a completed payment — use refund instead' });
    }

    // Cancel the PaymentIntent on the organizer's connected account
    await stripe().paymentIntents.cancel(
      paymentIntentId,
      {},
      { stripeAccount: organizer.stripeConnectId! }
    );

    // Mark purchase FAILED + restore item to AVAILABLE
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { status: 'FAILED' },
    });

    if (purchase.itemId) {
      await prisma.item.update({
        where: { id: purchase.itemId },
        data: { status: 'AVAILABLE' },
      });
    }

    res.json({ status: 'CANCELLED' });
  } catch (error) {
    console.error('[terminal] cancelTerminalPaymentIntent error:', error);
    res.status(500).json({ message: 'Failed to cancel Terminal payment' });
  }
};
