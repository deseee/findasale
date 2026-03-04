import { Request, Response } from 'express';
import { getStripe } from '../utils/stripe';
import { AuthRequest } from '../middleware/auth';
import { Resend } from 'resend';
import { handlePurchaseBadge } from './userController';
import { prisma } from '../lib/prisma';
const stripe = getStripe();

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
    await resend.emails.send({
      from: fromEmail,
      to: purchase.user.email,
      subject: `Receipt: ${purchase.item?.title ?? 'Your purchase'}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <h2>Payment Confirmed</h2>
          <p>Hi ${purchase.user.name},</p>
          <p>Your payment of <strong>$${purchase.amount.toFixed(2)}</strong> for <strong>${purchase.item?.title ?? 'an item'}</strong> from <em>${purchase.sale?.title ?? 'a sale'}</em> has been confirmed.</p>
          <p>Thank you for your purchase!</p>
          <a href="${historyUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:16px">
            View Purchase History
          </a>
        </div>
      `,
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
        const loginLink = await stripe.accounts.createLoginLink(organizer.stripeConnectId);
        return res.json({ url: loginLink.url });
      } catch (loginError: any) {
        // If login link fails because onboarding is incomplete, create a new account link
        if (loginError.message?.includes('not completed onboarding')) {
          const accountLink = await stripe.accountLinks.create({
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
    const account = await stripe.accounts.create({
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
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.FRONTEND_URL}/organizer/dashboard`,
      return_url: `${process.env.FRONTEND_URL}/organizer/dashboard`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url });
  } catch (error: unknown) {
    // Safely extract error information
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

    const { itemId, affiliateLinkId } = req.body;

    if (!itemId) {
      return res.status(400).json({ message: 'Item ID is required' });
    }

    // Fetch the item and its sale/organizer details
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

    // Ensure we have a valid price value and convert to number
    // For auction items, use currentBid (the winning bid amount); fall back to auctionStartPrice if no bids yet
    let price: number;
    if (item.sale.isAuctionSale) {
      if (item.currentBid !== null && item.currentBid !== undefined) {
        price = typeof item.currentBid === 'number' ? item.currentBid : parseFloat(item.currentBid.toString());
      } else if (item.auctionStartPrice !== null && item.auctionStartPrice !== undefined) {
        price = typeof item.auctionStartPrice === 'number' ? item.auctionStartPrice : parseFloat(item.auctionStartPrice.toString());
      } else {
        price = 0;
      }
    } else if (item.price !== null && item.price !== undefined) {
      price = typeof item.price === 'number' ? item.price : parseFloat(item.price.toString());
    } else {
      price = 0;
    }

    // Validate price is a valid number
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ message: 'Invalid price value' });
    }

    // Platform fee: 7% for auction items, 5% for regular sales
    // ST4: Convert to cents first, then multiply — avoids floating-point rounding errors
    const feePercent = item.sale.isAuctionSale ? 0.07 : 0.05;
    const priceCents = Math.round(price * 100);
    const platformFeeAmount = Math.round(priceCents * feePercent); // in cents

    // Idempotency key prevents duplicate charges on network retry (one attempt per user per item)
    const idempotencyKey = `pi-${itemId}-${req.user.id}`;

    // Create a PaymentIntent with automatic confirmation
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: priceCents, // Always derived from DB price — never from request body
        currency: 'usd',
        metadata: {
          itemId: item.id,
          saleId: item.sale.id,
          userId: req.user.id,
          ...(affiliateLinkId ? { affiliateLinkId } : {})
        },
        application_fee_amount: platformFeeAmount,
        on_behalf_of: item.sale.organizer.stripeConnectId,
        transfer_data: {
          destination: item.sale.organizer.stripeConnectId,
        },
      },
      { idempotencyKey }
    );

    // Create a pending purchase record (optionally linked to affiliate attribution)
    const purchase = await prisma.purchase.create({
      data: {
        userId: req.user.id,
        itemId: item.id,
        saleId: item.sale.id,
        amount: price,
        platformFeeAmount: platformFeeAmount / 100, // store in dollars, not cents
        stripePaymentIntentId: paymentIntent.id,
        status: 'PENDING',
        ...(affiliateLinkId ? { affiliateLinkId } : {})
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      purchaseId: purchase.id,
      platformFee: platformFeeAmount / 100,
      totalAmount: price
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

  // H9: Guard missing STRIPE_WEBHOOK_SECRET — fail fast with clear error
  if (!endpointSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured — webhook verification cannot proceed');
    return res.status(500).send('Webhook Error: STRIPE_WEBHOOK_SECRET not configured');
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
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
              organizer: { select: { stripeConnectId: true } },
            },
          },
        },
      });

      if (purchase) {
        // ST3: Verify the payment was destined for the correct organizer's Stripe account.
        // Prevents a spoofed or replayed webhook from marking an unrelated item as SOLD.
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
          break; // Skip processing — do not mark purchase as PAID
        }

        await prisma.purchase.update({
          where: { stripePaymentIntentId: paymentIntent.id },
          data: { status: 'PAID' },
        });

        if (paymentIntent.metadata?.itemId) {
          await prisma.item.update({
            where: { id: paymentIntent.metadata.itemId },
            data: { status: 'SOLD' },
          });
        }

        // Attribute affiliate conversion if purchase was referred
        if (purchase.affiliateLinkId) {
          await prisma.affiliateLink.update({
            where: { id: purchase.affiliateLinkId },
            data: { conversions: { increment: 1 } }
          }).catch(err => console.warn('Failed to increment affiliate conversion:', err));
        }

        // Award purchase badge
        await handlePurchaseBadge(purchase.userId);

        // Send receipt email
        if (purchase.user) {
          await sendReceiptEmail({
            id: purchase.id,
            amount: typeof purchase.amount === 'number' ? purchase.amount : parseFloat(purchase.amount.toString()),
            user: { email: purchase.user.email, name: purchase.user.name },
            item: purchase.item,
            sale: purchase.sale,
          });
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
      console.log(`Unhandled event type ${event.type}`);
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

    const paymentIntent = await stripe.paymentIntents.retrieve(purchase.stripePaymentIntentId);

    const amount = typeof purchase.amount === 'number' ? purchase.amount : parseFloat(purchase.amount.toString());
    const platformFee = typeof purchase.platformFeeAmount === 'number'
      ? purchase.platformFeeAmount
      : parseFloat((purchase.platformFeeAmount ?? 0).toString());

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

    await stripe.refunds.create({ payment_intent: purchase.stripePaymentIntentId });

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
