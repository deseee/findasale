import { Request, Response } from 'express';
import { getStripe } from '../utils/stripe';
import { AuthRequest } from '../middleware/auth';
import { Resend } from 'resend';
import { handlePurchaseBadge } from './userController';
import { awardPoints } from '../services/pointsService';
import { createNotification } from '../services/notificationService';
import { prisma } from '../lib/prisma';
import { fireWebhooks } from '../services/webhookService'; // X1
import { buildEmail } from '../services/emailTemplateService';
import { issueLoyaltyCoupon, markCouponUsed } from './couponController';
// Lazy — avoids crash when module loads before dotenv runs
const stripe = () => getStripe();

let _resend: any = null;
const getResendClient = () => {
  if (!_resend && process.env.RESEND_API_KEY) {
    try { _resend = new Resend(process.env.RESEND_API_KEY); } catch { _resend = null; }
  }
  return _resend;
};

const sendReceiptEmail = async (purchase: {
  id: string;
  amount: number;
  user: { email: string; name: string };
  item: { title: string } | null;
  sale: { title: string } | null;
}) => {
  const resend = getResendClient();
  if (!resend) return;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'receipts@finda.sale';
  const historyUrl = `${process.env.FRONTEND_URL || 'https://finda.sale'}/shopper/purchases`;
  try {
    const html = buildEmail({
      preheader: `Receipt for ${purchase.item?.title ?? 'your purchase'}`,
      headline: 'Your purchase is confirmed! 🎉',
      body: `<p>Hi ${purchase.user.name},</p><p>Your payment of <strong>$${purchase.amount.toFixed(2)}</strong> for <strong>${purchase.item?.title ?? 'an item'}</strong> from <em>${purchase.sale?.title ?? 'a sale'}</em> has been confirmed.</p><p>Thank you for your purchase! The organizer will be in touch about pickup.</p>`,
      ctaText: 'View Purchase History',
      ctaUrl: historyUrl,
      accentColor: '#10b981',
    });

    await resend.emails.send({
      from: fromEmail,
      to: purchase.user.email,
      subject: `Receipt: ${purchase.item?.title ?? 'Your purchase'}`,
      html,
    });
  } catch (err) {
    console.error('Failed to send receipt email:', err);
  }
};

// Create a Stripe Connect account for an organizer
export const createConnectAccount = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    // Check if organizer already has a Stripe account
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id }
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    // If organizer already has a Stripe Connect ID
    if (organizer.stripeConnectId) {
      try {
        // First, try to create a login link (works only if account is fully onboarded)
        const loginLink = await stripe().accounts.createLoginLink(organizer.stripeConnectId);
        return res.json({ url: loginLink.url });
      } catch (loginError: any) {
        // If login link fails because onboarding is incomplete, create a new account link
        if (loginError.message?.includes('not completed onboarding')) {
          const accountLink = await stripe().accountLinks.create({
            account: organizer.stripeConnectId,
            refresh_url: `${process.env.FRONTEND_URL}/organizer/dashboard`,
            return_url: `${process.env.FRONTEND_URL}/organizer/dashboard`,
            type: 'account_onboarding',
          });
          return res.json({ url: accountLink.url });
        }
        // Re-throw other errors
        throw loginError;
      }
    }

    // No existing Stripe account: create a new one
    const account = await stripe().accounts.create({
      type: 'express',
      email: req.user.email,
      business_type: 'individual',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    // Save the account ID to the organizer profile
    await prisma.organizer.update({
      where: { userId: req.user.id },
      data: { stripeConnectId: account.id }
    });

    // Create an account link for onboarding
    const accountLink = await stripe().accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.FRONTEND_URL}/organizer/dashboard`,
      return_url: `${process.env.FRONTEND_URL}/organizer/dashboard`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url });
  } catch (error: unknown) {
    let message = 'Unknown error';
    let type = undefined;
    let stack = undefined;

    if (error instanceof Error) {
      message = error.message;
      stack = error.stack;
      type = (error as any).type;
    } else if (typeof error === 'string') {
      message = error;
    } else if (error && typeof error === 'object') {
      message = String(error);
      type = (error as any).type;
      stack = (error as any).stack;
    }

    console.error('Stripe Connect account creation error details:', {
      message,
      type,
      stack,
      env: {
        hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
        nodeEnv: process.env.NODE_ENV,
      }
    });
    res.status(500).json({ message: 'Failed to create Stripe Connect account' });
  }
};

// Create a payment intent for purchasing an item
export const createPaymentIntent = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { itemId, affiliateLinkId, shippingRequested, couponCode } = req.body;

    if (!itemId) {
      return res.status(400).json({ message: 'Item ID is required' });
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        sale: {
          select: {
            id: true,
            isAuctionSale: true,
            organizer: {
              select: { stripeConnectId: true }
            }
          }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    if (!item.sale.organizer.stripeConnectId) {
      return res.status(400).json({ message: 'Organizer has not set up payment processing' });
    }

    const isAuctionItem = !!item.auctionStartPrice;
    let price: number;
    if (isAuctionItem) {
      if (item.currentBid != null) {
        price = item.currentBid;
      } else if (item.auctionStartPrice != null) {
        price = item.auctionStartPrice;
      } else {
        price = 0;
      }
    } else if (item.price != null) {
      price = item.price;
    } else {
      price = 0;
    }

    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ message: 'Invalid price value' });
    }

    // CA3: Stripe minimum charge is $0.50 — reject below that to avoid Stripe error
    if (price < 0.5) {
      return res.status(400).json({ message: 'Item price must be at least $0.50 to process payment' });
    }

    // W1: Add shipping cost if buyer opted in and item ships
    let shippingCost = 0;
    if (shippingRequested && !isAuctionItem && item.shippingAvailable && item.shippingPrice != null) {
      shippingCost = item.shippingPrice;
    }

    // QA: payment flow — B1: Fee now read from FeeStructure table at transaction time
    const feeStructure = await prisma.feeStructure.findFirst({ where: { listingType: '*' } });
    const feePercent = feeStructure?.feeRate ?? 0.10; // Default to 10% if no FeeStructure row found
    const priceCents = Math.round((price + shippingCost) * 100);
    const platformFeeAmount = Math.round(priceCents * feePercent);

    // Sprint 3: Coupon redemption — validate and apply discount before creating PI
    let couponId: string | undefined;
    let discountAmount = 0;
    if (couponCode) {
      const coupon = await prisma.coupon.findUnique({ where: { code: (couponCode as string).trim().toUpperCase() } });
      if (!coupon || coupon.userId !== req.user.id || coupon.status !== 'ACTIVE' || coupon.expiresAt < new Date()) {
        return res.status(400).json({ message: 'Invalid or expired coupon code' });
      }
      if (coupon.discountType === 'FIXED') {
        discountAmount = Math.min(Math.round(coupon.discountValue * 100), priceCents - 50);
      } else {
        const pct = Math.round(priceCents * (coupon.discountValue / 100));
        const raw = coupon.maxDiscountAmount
          ? Math.min(pct, Math.round(coupon.maxDiscountAmount * 100))
          : pct;
        discountAmount = Math.min(raw, priceCents - 50);
      }
      couponId = coupon.id;
    }
    const finalPriceCents = priceCents - discountAmount;

    // Include coupon context in idempotency key — different coupon = different PI
    const couponSuffix = couponId ? `-c${couponId.slice(-6)}` : '';
    const idempotencyKey = `pi-${itemId}-${req.user.id}${couponSuffix}`;

    const paymentIntent = await stripe().paymentIntents.create(
      {
        amount: finalPriceCents,
        currency: 'usd',
        metadata: {
          itemId: item.id,
          saleId: item.sale.id,
          userId: req.user.id,
          ...(affiliateLinkId ? { affiliateLinkId } : {}),
          ...(shippingCost > 0 ? { shippingCost: String(shippingCost) } : {}),
          ...(couponId ? { couponId } : {}),
        },
        application_fee_amount: platformFeeAmount,
        on_behalf_of: item.sale.organizer.stripeConnectId,
        transfer_data: {
          destination: item.sale.organizer.stripeConnectId,
        },
      },
      { idempotencyKey }
    );

    const purchase = await prisma.purchase.create({
      data: {
        userId: req.user.id,
        itemId: item.id,
        saleId: item.sale.id,
        amount: finalPriceCents / 100, // actual charged amount (post-discount)
        platformFeeAmount: platformFeeAmount / 100,
        stripePaymentIntentId: paymentIntent.id,
        status: 'PENDING',
        ...(affiliateLinkId ? { affiliateLinkId } : {})
      }
    });

    // Feature: Abandoned Checkout Recovery — track this payment intent for recovery emails
    await prisma.checkoutAttempt.upsert({
      where: { paymentIntent: paymentIntent.id },
      create: {
        userId: req.user.id,
        itemId: item.id,
        paymentIntent: paymentIntent.id,
      },
      update: {},
    }).catch(err => console.warn('[checkout-recovery] Failed to track checkout attempt:', err));

    res.json({
      clientSecret: paymentIntent.client_secret,
      purchaseId: purchase.id,
      platformFee: platformFeeAmount / 100,
      totalAmount: finalPriceCents / 100, // post-discount price (what Stripe charges)
      originalAmount: price,              // pre-discount item price (for display reference)
      discountApplied: discountAmount / 100,
      ...(couponCode ? { couponCode } : {}),
    });
  } catch (error: unknown) {
    console.error('Payment Intent creation error:', error);
    res.status(500).json({ message: 'Failed to create payment intent' });
  }
};

// Webhook handler for Stripe events
export const webhookHandler = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!endpointSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured — webhook verification cannot proceed');
    return res.status(500).send('Webhook Error: STRIPE_WEBHOOK_SECRET not configured');
  }

  let event;

  try {
    event = stripe().webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object;
      const purchase = await prisma.purchase.findUnique({
        where: { stripePaymentIntentId: paymentIntent.id },
        include: {
          user: { select: { email: true, name: true } },
          item: { select: { title: true } },
          sale: {
            select: {
              title: true,
              organizer: { select: { stripeConnectId: true, userId: true } },
            },
          },
        },
      });

      if (purchase) {
        const expectedConnectId = purchase.sale?.organizer?.stripeConnectId;
        if (
          expectedConnectId &&
          paymentIntent.on_behalf_of &&
          expectedConnectId !== paymentIntent.on_behalf_of
        ) {
          console.error(
            `ST3 webhook mismatch for PI ${paymentIntent.id}: ` +
            `expected connectId=${expectedConnectId}, got=${paymentIntent.on_behalf_of}`
          );
          break;
        }

        await prisma.purchase.update({
          where: { stripePaymentIntentId: paymentIntent.id },
          data: { status: 'PAID' },
        });

        // Feature: Abandoned Checkout Recovery — mark this checkout as completed
        await prisma.checkoutAttempt.updateMany({
          where: { paymentIntent: paymentIntent.id },
          data: { completedAt: new Date() },
        }).catch(err => console.warn('[checkout-recovery] Failed to mark checkout as completed:', err));

        if (paymentIntent.metadata?.itemId) {
          // CA3: Concurrent purchase guard — check item status before marking SOLD
          // If another buyer's PI already marked it SOLD, refund this one automatically
          const item = await prisma.item.findUnique({
            where: { id: paymentIntent.metadata.itemId },
            select: { status: true },
          });

          if (item && item.status === 'SOLD' && purchase.status !== 'PAID') {
            // Second buyer won the race — refund silently and stop
            console.warn(
              `CA3 concurrent purchase: item ${paymentIntent.metadata.itemId} already SOLD, ` +
              `refunding PI ${paymentIntent.id}`
            );
            await stripe().refunds.create({ payment_intent: paymentIntent.id });
            await prisma.purchase.update({
              where: { stripePaymentIntentId: paymentIntent.id },
              data: { status: 'REFUNDED' },
            });
            break;
          }

          await prisma.item.update({
            where: { id: paymentIntent.metadata.itemId },
            data: { status: 'SOLD' },
          });
        }

        if (purchase.affiliateLinkId) {
          await prisma.affiliateLink.update({
            where: { id: purchase.affiliateLinkId },
            data: { conversions: { increment: 1 } }
          }).catch(err => console.warn('Failed to increment affiliate conversion:', err));
        }

        // Award purchase badge
        await handlePurchaseBadge(purchase.userId);

        // Phase 19: Award 10 points for purchase
        awardPoints(
          purchase.userId,
          'PURCHASE',
          10,
          purchase.saleId ?? undefined,
          paymentIntent.metadata?.itemId,
          'Purchased an item',
        ).catch(err => console.warn('[points] Failed to award purchase points:', err));

        // Send receipt email
        if (purchase.user) {
          await sendReceiptEmail({
            id: purchase.id,
            amount: purchase.amount,
            user: { email: purchase.user.email, name: purchase.user.name },
            item: purchase.item,
            sale: purchase.sale,
          });
        }

        // Sprint 3: Issue loyalty coupon (fire-and-forget)
        issueLoyaltyCoupon(purchase.userId, purchase.id)
          .catch(err => console.warn('[coupon] Failed to issue loyalty coupon:', err));

        // Sprint 3: Mark applied coupon as used if one was redeemed
        if (paymentIntent.metadata?.couponId) {
          markCouponUsed(paymentIntent.metadata.couponId, purchase.id)
            .catch(err => console.warn('[coupon] Failed to mark coupon used:', err));
        }

        // Create in-app notification for purchase confirmation (fire-and-forget)
        createNotification(
          purchase.userId,
          'purchase',
          'Purchase confirmed',
          `Your purchase of "${purchase.item?.title || 'item'}" is confirmed!`,
          '/shopper/purchases'
        ).catch(err => console.error('[notification] Failed to create purchase notification:', err));

        // X1: Fire webhooks (non-blocking)
        const orgUserId = (purchase.sale as any)?.organizer?.userId;
        if (orgUserId) {
          setImmediate(() =>
            fireWebhooks(orgUserId, 'purchase.completed', {
              purchaseId: purchase.id,
              itemId: paymentIntent.metadata?.itemId,
              itemTitle: purchase.item?.title,
              amount: purchase.amount,
              buyerEmail: purchase.user?.email,
            })
          );
        }
      }
      break;
    }
    case 'payment_intent.payment_failed': {
      const paymentFailedIntent = event.data.object;
      await prisma.purchase.updateMany({
        where: { stripePaymentIntentId: paymentFailedIntent.id },
        data: { status: 'FAILED' },
      });
      break;
    }
    default:
      console.warn(`[stripe] Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
};

// Return the clientSecret for an existing PENDING purchase (used by auction winners)
export const getPendingPayment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { purchaseId } = req.params;

    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        item: { select: { title: true } },
      },
    });

    if (!purchase) {
      return res.status(404).json({ message: 'Purchase not found' });
    }

    if (purchase.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (purchase.status !== 'PENDING') {
      return res.status(400).json({ message: 'Purchase is not pending payment' });
    }

    if (!purchase.stripePaymentIntentId) {
      return res.status(400).json({ message: 'No payment intent for this purchase' });
    }

    const paymentIntent = await stripe().paymentIntents.retrieve(purchase.stripePaymentIntentId);

    const amount = purchase.amount;
    const platformFee = purchase.platformFeeAmount ?? 0;

    res.json({
      clientSecret: paymentIntent.client_secret,
      totalAmount: amount,
      platformFee,
      itemTitle: purchase.item?.title ?? 'Item',
    });
  } catch (error) {
    console.error('getPendingPayment error:', error);
    res.status(500).json({ message: 'Failed to retrieve payment details' });
  }
};

// Issue a refund (organizer or admin only)
export const createRefund = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || (req.user.role !== 'ORGANIZER' && req.user.role !== 'ADMIN')) {
      return res.status(403).json({ message: 'Organizer or admin access required' });
    }

    const { purchaseId } = req.params;

    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        sale: { include: { organizer: { select: { userId: true } } } },
      },
    });

    if (!purchase) {
      return res.status(404).json({ message: 'Purchase not found' });
    }

    if (req.user.role === 'ORGANIZER' && purchase.sale?.organizer?.userId !== req.user.id) {
      return res.status(403).json({ message: 'You can only refund purchases from your own sales' });
    }

    if (purchase.status !== 'PAID') {
      return res.status(400).json({ message: 'Only paid purchases can be refunded' });
    }

    if (!purchase.stripePaymentIntentId) {
      return res.status(400).json({ message: 'No payment intent found for this purchase' });
    }

    await stripe().refunds.create({ payment_intent: purchase.stripePaymentIntentId });

    await prisma.purchase.update({ where: { id: purchaseId }, data: { status: 'REFUNDED' } });

    if (purchase.itemId) {
      await prisma.item.update({ where: { id: purchase.itemId }, data: { status: 'AVAILABLE' } });
    }

    res.json({ message: 'Refund issued successfully' });
  } catch (error) {
    console.error('createRefund error:', error);
    res.status(500).json({ message: 'Failed to issue refund' });
  }
};
