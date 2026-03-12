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
import { randomUUID } from 'crypto';
import { getStripe } from '../utils/stripe';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const stripe = () => getStripe();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the organizer record + stripeConnectId for the authed user.
 * Returns null (and writes 4xx response) if not eligible.
 * requireStripe (default true): set false for endpoints that don't need Stripe Connect (e.g. cash).
 */
const resolveOrganizer = async (req: AuthRequest, res: Response, opts: { requireStripe?: boolean } = {}) => {
  const { requireStripe = true } = opts;
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
 * POST /api/stripe/terminal/connection-token
 * Creates a Stripe Terminal connection token scoped to the organizer's
 * connected Stripe account. The frontend SDK uses this to discover readers.
 */
export const createConnectionToken = async (req: AuthRequest, res: Response) => {
  try {
    // Simulated mode: skip stripeConnectId requirement — create token on platform account.
    // Stripe allows this for simulated readers, enabling testing without a real Connect account.
    const isSimulated = process.env.STRIPE_TERMINAL_SIMULATED === 'true';

    if (isSimulated) {
      if (!req.user || req.user.role !== 'ORGANIZER') {
        return res.status(403).json({ message: 'Organizer access required' });
      }
      const token = await stripe().terminal.connectionTokens.create({});
      return res.json({ secret: token.secret });
    }

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
 * Body: { items: [{itemId?: string, amount: number, label?: string}], buyerEmail?: string, saleId?: string }
 *
 * Creates a Stripe PaymentIntent for a multi-item terminal payment (cart).
 * Uses capture_method: 'manual' (Terminal requires explicit capture after card swipe).
 * Applies same 10% platform fee as online purchases.
 * In simulated mode: PI created on platform account (no Connect account required).
 */
export const createTerminalPaymentIntent = async (req: AuthRequest, res: Response) => {
  try {
    const isSimulated = process.env.STRIPE_TERMINAL_SIMULATED === 'true';
    const organizer = await resolveOrganizer(req, res, { requireStripe: !isSimulated });
    if (!organizer) return;

    const { items, buyerEmail, saleId: bodySaleId } = req.body as {
      items?: Array<{ itemId?: string; amount: number; label?: string }>;
      buyerEmail?: string;
      saleId?: string;  // required when cart contains only misc items (no itemId)
    };

    // Validate items array
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'items array is required and must be non-empty' });
    }

    if (!items.every(i => typeof i.amount === 'number' && i.amount > 0)) {
      return res.status(400).json({ message: 'Each item must have a positive amount' });
    }

    // Fetch and validate all items with itemId
    const itemIds = items.filter(i => i.itemId).map(i => i.itemId!);

    // Reject duplicate itemIds — each physical item can only be charged once per transaction
    if (itemIds.length !== new Set(itemIds).size) {
      return res.status(400).json({ message: 'Duplicate items in cart. Each item can only be charged once per transaction.' });
    }

    let dbItems: Record<string, any> = {};
    if (itemIds.length > 0) {
      const fetched = await prisma.item.findMany({
        where: { id: { in: itemIds } },
        select: {
          id: true,
          title: true,
          status: true,
          sale: { select: { id: true, organizerId: true } },
        },
      });
      dbItems = Object.fromEntries(fetched.map(item => [item.id, item]));

      // Verify all items exist, belong to organizer, and are AVAILABLE
      for (const itemId of itemIds) {
        if (!dbItems[itemId]) {
          return res.status(404).json({ message: `Item not found` });
        }
        const item = dbItems[itemId];
        if (item.sale.organizerId !== organizer.id) {
          return res.status(403).json({ message: `"${item.title}" does not belong to your sale` });
        }
        if (item.status !== 'AVAILABLE') {
          return res.status(400).json({ message: `"${item.title}" is sold or unavailable` });
        }
      }
    }

    // Calculate total amount in cents
    const totalAmountCents = Math.round(items.reduce((sum, i) => sum + i.amount, 0) * 100);

    // Fee: read from FeeStructure, apply referral discount if active
    const feeStructure = await prisma.feeStructure.findFirst({ where: { listingType: '*' } });
    const baseFeeRate = feeStructure?.feeRate ?? 0.10;
    const hasReferralDiscount =
      organizer.referralDiscountExpiry != null && organizer.referralDiscountExpiry > new Date();
    const feeRate = hasReferralDiscount ? 0 : baseFeeRate;
    const platformFeeAmount = Math.round(totalAmountCents * feeRate);

    // Determine sale ID: derive from first item with itemId, or fall back to bodySaleId (misc-only carts)
    let saleId = '';
    for (const item of items) {
      if (item.itemId && dbItems[item.itemId]) {
        saleId = dbItems[item.itemId].sale.id;
        break;
      }
    }
    if (!saleId) {
      // Misc-only cart — require explicit saleId in body
      if (!bodySaleId) {
        return res.status(400).json({ message: 'saleId is required when cart contains only misc items' });
      }
      // Verify the provided saleId belongs to this organizer
      const sale = await prisma.sale.findUnique({ where: { id: bodySaleId }, select: { organizerId: true } });
      if (!sale || sale.organizerId !== organizer.id) {
        return res.status(403).json({ message: 'Sale does not belong to your account' });
      }
      saleId = bodySaleId;
    }

    // Create terminal PaymentIntent — platform account in simulated mode, connected account in production
    const piParams = {
      amount: totalAmountCents,
      currency: 'usd',
      payment_method_types: ['card_present'], // Terminal-only: physical card reader
      capture_method: 'manual' as const,      // Terminal requires explicit capture
      ...(!isSimulated ? { application_fee_amount: platformFeeAmount } : {}),
      metadata: {
        items: JSON.stringify(items),
        saleId,
        source: 'POS',
        ...(buyerEmail ? { buyerEmail } : {}),
      },
    };
    const paymentIntent = isSimulated
      ? await stripe().paymentIntents.create(piParams)
      : await stripe().paymentIntents.create(piParams, { stripeAccount: organizer.stripeConnectId! });

    // Create PENDING Purchase records for each cart item
    const purchaseIds: string[] = [];
    for (const item of items) {
      const itemAmount = item.amount;
      const itemAmountCents = Math.round(itemAmount * 100);
      const itemPlatformFeeAmount = item.itemId ? Math.round(itemAmountCents * feeRate) : 0;

      const purchase = await prisma.purchase.create({
        data: {
          itemId: item.itemId ?? null,
          saleId,
          amount: itemAmount,
          platformFeeAmount: itemPlatformFeeAmount / 100,
          stripePaymentIntentId: paymentIntent.id,
          status: 'PENDING',
          source: 'POS',
          ...(buyerEmail ? { buyerEmail } : {}),
        },
      });
      purchaseIds.push(purchase.id);
    }

    res.json({
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      purchaseIds,
      totalAmount: totalAmountCents / 100,
      platformFee: platformFeeAmount / 100,
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
 * Marks all purchases for this PI as PAID and their items as SOLD.
 * The Stripe webhook (payment_intent.succeeded) also fires — the webhook handler
 * handles idempotency via ProcessedWebhookEvent.
 */
export const captureTerminalPaymentIntent = async (req: AuthRequest, res: Response) => {
  try {
    const isSimulated = process.env.STRIPE_TERMINAL_SIMULATED === 'true';
    const organizer = await resolveOrganizer(req, res, { requireStripe: !isSimulated });
    if (!organizer) return;

    const { paymentIntentId } = req.body as { paymentIntentId?: string };

    if (!paymentIntentId) {
      return res.status(400).json({ message: 'paymentIntentId is required' });
    }

    // Find all purchases for this PaymentIntent
    const purchases = await prisma.purchase.findMany({
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

    if (!purchases.length) {
      return res.status(404).json({ message: 'No purchases found for this payment intent' });
    }

    // Verify ownership — use first purchase with an item, or fall back to saleId check (misc-only carts)
    const ownerPurchase = purchases.find(p => p.item);
    if (ownerPurchase) {
      if (ownerPurchase.item!.sale.organizerId !== organizer.id) {
        return res.status(403).json({ message: 'You do not have permission to capture this payment' });
      }
    } else {
      // All misc items — verify via saleId on purchase record
      const firstSaleId = purchases[0]?.saleId;
      if (firstSaleId) {
        const sale = await prisma.sale.findUnique({ where: { id: firstSaleId }, select: { organizerId: true } });
        if (!sale || sale.organizerId !== organizer.id) {
          return res.status(403).json({ message: 'You do not have permission to capture this payment' });
        }
      }
    }

    // If all purchases are already PAID, return idempotent success
    if (purchases.every(p => p.status === 'PAID')) {
      return res.json({ purchaseIds: purchases.map(p => p.id), status: 'PAID', receiptSent: false });
    }

    // Concurrent guard: check if any item with itemId is already SOLD
    for (const p of purchases) {
      if (!p.itemId) continue;
      const current = await prisma.item.findUnique({
        where: { id: p.itemId },
        select: { status: true },
      });
      if (current?.status === 'SOLD' && p.status !== 'PAID') {
        // Item was sold by another concurrent transaction — cancel this PI and fail all purchases
        try {
          if (isSimulated) {
            await stripe().paymentIntents.cancel(paymentIntentId);
          } else {
            await stripe().paymentIntents.cancel(paymentIntentId, {}, { stripeAccount: organizer.stripeConnectId! });
          }
        } catch (e) {
          console.warn('[terminal] Failed to cancel PI during concurrent guard:', e);
        }

        await prisma.purchase.updateMany({
          where: { stripePaymentIntentId: paymentIntentId },
          data: { status: 'FAILED' },
        });

        return res.status(409).json({
          message: 'An item in the cart was sold by another transaction',
        });
      }
    }

    // Capture the payment — platform account in simulated mode, connected account in production
    if (isSimulated) {
      await stripe().paymentIntents.capture(paymentIntentId);
    } else {
      await stripe().paymentIntents.capture(paymentIntentId, {}, { stripeAccount: organizer.stripeConnectId! });
    }

    // Mark all purchases PAID
    await prisma.purchase.updateMany({
      where: { stripePaymentIntentId: paymentIntentId },
      data: { status: 'PAID' },
    });

    // Mark items SOLD
    for (const p of purchases) {
      if (p.itemId) {
        await prisma.item.update({
          where: { id: p.itemId },
          data: { status: 'SOLD' },
        });
      }
    }

    // Send receipt to buyer if email was provided
    let receiptSent = false;
    const buyerEmail = purchases[0]?.buyerEmail;
    if (buyerEmail && process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import('resend');
        const { buildEmail } = await import('../services/emailTemplateService');
        const resend = new Resend(process.env.RESEND_API_KEY);
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'receipts@finda.sale';

        // Build receipt with all items
        const itemsList = purchases
          .map(p => `<li>${p.item?.title ?? 'Misc item'}: $${p.amount.toFixed(2)}</li>`)
          .join('');
        const totalAmount = purchases.reduce((sum, p) => sum + p.amount, 0);

        const html = buildEmail({
          preheader: `Receipt for your purchase`,
          headline: 'Your receipt from FindA.Sale 🎉',
          body: `<p>Thank you for your purchase!</p><ul>${itemsList}</ul><p><strong>Total: $${totalAmount.toFixed(2)}</strong></p><p>Payment processed securely via Stripe.</p>`,
          ctaText: 'Visit FindA.Sale',
          ctaUrl: process.env.FRONTEND_URL || 'https://finda.sale',
          accentColor: '#10b981',
        });
        await resend.emails.send({
          from: fromEmail,
          to: buyerEmail,
          subject: `Receipt: Your in-person purchase`,
          html,
        });
        receiptSent = true;
      } catch (emailErr) {
        console.warn('[terminal] Failed to send POS receipt email:', emailErr);
      }
    }

    res.json({ purchaseIds: purchases.map(p => p.id), status: 'PAID', receiptSent });
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
 * Marks all purchases FAILED and returns items to AVAILABLE.
 */
export const cancelTerminalPaymentIntent = async (req: AuthRequest, res: Response) => {
  try {
    const isSimulated = process.env.STRIPE_TERMINAL_SIMULATED === 'true';
    const organizer = await resolveOrganizer(req, res, { requireStripe: !isSimulated });
    if (!organizer) return;

    const { paymentIntentId } = req.body as { paymentIntentId?: string };

    if (!paymentIntentId) {
      return res.status(400).json({ message: 'paymentIntentId is required' });
    }

    const purchases = await prisma.purchase.findMany({
      where: { stripePaymentIntentId: paymentIntentId },
    });

    if (!purchases.length) {
      return res.status(404).json({ message: 'No purchases found for this payment intent' });
    }

    if (purchases.some(p => p.status === 'PAID')) {
      return res.status(400).json({ message: 'Cannot cancel a completed payment — use refund instead' });
    }

    // Cancel the PaymentIntent — platform account in simulated mode, connected account in production
    if (isSimulated) {
      await stripe().paymentIntents.cancel(paymentIntentId);
    } else {
      await stripe().paymentIntents.cancel(paymentIntentId, {}, { stripeAccount: organizer.stripeConnectId! });
    }

    // Mark all purchases FAILED
    await prisma.purchase.updateMany({
      where: { stripePaymentIntentId: paymentIntentId },
      data: { status: 'FAILED' },
    });

    // Restore items to AVAILABLE
    for (const p of purchases) {
      if (p.itemId) {
        await prisma.item.update({
          where: { id: p.itemId },
          data: { status: 'AVAILABLE' },
        });
      }
    }

    res.json({ status: 'CANCELLED' });
  } catch (error) {
    console.error('[terminal] cancelTerminalPaymentIntent error:', error);
    res.status(500).json({ message: 'Failed to cancel Terminal payment' });
  }
};

/**
 * POST /api/stripe/terminal/cash-payment
 * Body: { items: [{itemId?: string, amount: number, label?: string}], cashReceived: number, buyerEmail?: string, saleId: string }
 *
 * Records a cash sale immediately without Stripe processing.
 * Creates Purchase records with status PAID and marks items SOLD.
 * Accumulates 10% platform fees into organizer.cashFeeBalance for later payout deduction.
 * platformFeeAmount tracks fee for accounting; collection is handled outside Stripe.
 */
export const cashPayment = async (req: AuthRequest, res: Response) => {
  try {
    // Cash never touches Stripe — no Connect account required
    const organizer = await resolveOrganizer(req, res, { requireStripe: false });
    if (!organizer) return;

    const { items, cashReceived, buyerEmail, saleId } = req.body as {
      items?: Array<{ itemId?: string; amount: number; label?: string }>;
      cashReceived?: number;
      buyerEmail?: string;
      saleId?: string;
    };

    // Validate inputs
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'items array is required and must be non-empty' });
    }

    if (!items.every(i => typeof i.amount === 'number' && i.amount > 0)) {
      return res.status(400).json({ message: 'Each item must have a positive amount' });
    }

    if (typeof cashReceived !== 'number' || cashReceived < 0) {
      return res.status(400).json({ message: 'cashReceived must be a non-negative number' });
    }

    const totalAmount = items.reduce((sum, i) => sum + i.amount, 0);
    if (cashReceived < totalAmount) {
      return res.status(400).json({ message: 'Insufficient cash received' });
    }

    if (!saleId) {
      return res.status(400).json({ message: 'saleId is required' });
    }

    // Verify sale belongs to organizer
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { organizerId: true },
    });

    if (!sale || sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Sale does not belong to your account' });
    }

    // Fetch and validate all items with itemId
    const itemIds = items.filter(i => i.itemId).map(i => i.itemId!);

    // Reject duplicate itemIds — each physical item can only be charged once per transaction
    if (itemIds.length !== new Set(itemIds).size) {
      return res.status(400).json({ message: 'Duplicate items in cart. Each item can only be charged once per transaction.' });
    }

    let dbItems: Record<string, any> = {};
    if (itemIds.length > 0) {
      const fetched = await prisma.item.findMany({
        where: { id: { in: itemIds }, saleId },
        select: { id: true, title: true, status: true },
      });
      dbItems = Object.fromEntries(fetched.map(item => [item.id, item]));

      for (const itemId of itemIds) {
        if (!dbItems[itemId]) {
          return res.status(404).json({ message: `Item not found in this sale` });
        }
        if (dbItems[itemId].status !== 'AVAILABLE') {
          return res.status(400).json({ message: `"${dbItems[itemId].title}" is sold or unavailable` });
        }
      }
    }

    // Fee: read from FeeStructure (same rate as card flow). Cash organizer collects full amount in person —
    // platformFeeAmount is tracked for accounting; billing/collection is handled outside Stripe.
    const feeStructure = await prisma.feeStructure.findFirst({ where: { listingType: '*' } });
    const feeRate = feeStructure?.feeRate ?? 0.10;

    // Create Purchase records immediately with status PAID
    const purchaseIds: string[] = [];
    for (const item of items) {
      // Use a UUID placeholder for cash sales (stripePaymentIntentId is @unique — cannot be null)
      const cashPIId = `cash_${randomUUID()}`;
      const itemPlatformFeeAmount = Math.round(item.amount * feeRate * 100) / 100;

      const purchase = await prisma.purchase.create({
        data: {
          itemId: item.itemId ?? null,
          saleId,
          amount: item.amount,
          platformFeeAmount: itemPlatformFeeAmount,
          stripePaymentIntentId: cashPIId,
          status: 'PAID',
          source: 'POS',
          ...(buyerEmail ? { buyerEmail } : {}),
        },
      });
      purchaseIds.push(purchase.id);
    }

    // Mark items SOLD
    for (const item of items) {
      if (item.itemId) {
        await prisma.item.update({
          where: { id: item.itemId },
          data: { status: 'SOLD' },
        });
      }
    }

    // Accumulate platform fee to organizer's cash fee balance
    const totalPlatformFees = items.reduce((sum, item) => {
      const itemFee = Math.round(item.amount * feeRate * 100) / 100;
      return sum + itemFee;
    }, 0);
    if (totalPlatformFees > 0) {
      await prisma.organizer.update({
        where: { id: organizer.id },
        data: {
          cashFeeBalance: { increment: totalPlatformFees },
          cashFeeBalanceUpdatedAt: new Date(),
        },
      });
    }

    // Optionally send receipt email
    let receiptSent = false;
    if (buyerEmail && process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import('resend');
        const { buildEmail } = await import('../services/emailTemplateService');
        const resend = new Resend(process.env.RESEND_API_KEY);
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'receipts@finda.sale';

        const itemsList = items
          .map(i => `<li>${i.label ?? 'Item'}: $${i.amount.toFixed(2)}</li>`)
          .join('');
        const change = (cashReceived - totalAmount).toFixed(2);

        const html = buildEmail({
          preheader: `Receipt for your purchase`,
          headline: 'Your receipt from FindA.Sale 🎉',
          body: `<p>Thank you for your purchase!</p><ul>${itemsList}</ul><p><strong>Total: $${totalAmount.toFixed(2)}</strong></p><p>Cash received: $${cashReceived.toFixed(2)}</p><p>Change: $${change}</p>`,
          ctaText: 'Visit FindA.Sale',
          ctaUrl: process.env.FRONTEND_URL || 'https://finda.sale',
          accentColor: '#10b981',
        });

        await resend.emails.send({
          from: fromEmail,
          to: buyerEmail,
          subject: `Receipt: Your in-person purchase`,
          html,
        });
        receiptSent = true;
      } catch (emailErr) {
        console.warn('[terminal] Failed to send cash sale receipt email:', emailErr);
      }
    }

    const change = cashReceived - totalAmount;

    // Fetch updated organizer balance to return in response
    const updatedOrganizer = await prisma.organizer.findUnique({
      where: { id: organizer.id },
      select: { cashFeeBalance: true, cashFeeBalanceUpdatedAt: true },
    });

    res.json({
      purchaseIds,
      totalAmount,
      platformFee: totalPlatformFees,
      cashReceived,
      change,
      receiptSent,
      cashFeeBalance: updatedOrganizer?.cashFeeBalance ?? 0,
      cashFeeBalanceUpdatedAt: updatedOrganizer?.cashFeeBalanceUpdatedAt,
    });
  } catch (error) {
    console.error('[terminal] cashPayment error:', error);
    res.status(500).json({ message: 'Failed to record cash sale' });
  }
};
