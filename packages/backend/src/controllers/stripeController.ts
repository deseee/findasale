import { Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '../index';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {});

// H9: Webhook secret validation
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

export const handleStripeWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const sig = req.headers['stripe-signature'] as string;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      res.status(400).send('Webhook signature verification failed');
      return;
    }

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      // Handle successful payment
      console.log('Payment succeeded:', paymentIntent.id);
    } else if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      // Handle failed payment
      console.log('Payment failed:', paymentIntent.id);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

export const setupConnectAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const { organizerId } = req.body;

    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
    });

    await prisma.organizer.update({
      where: { id: organizerId },
      data: { stripeConnectId: account.id },
    });

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      type: 'account_onboarding',
      refresh_url: `${process.env.FRONTEND_URL}/organizer/stripe-refresh`,
      return_url: `${process.env.FRONTEND_URL}/organizer/stripe-return`,
    });

    res.json({ url: accountLink.url });
  } catch (error) {
    console.error('Connect setup error:', error);
    res.status(500).json({ error: 'Failed to setup Connect account' });
  }
};

// H9: Platform fee calculation (5% regular / 7% auction)
export const createPaymentIntent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { itemId, amount, isAuction } = req.body;

    // Determine fee percentage
    const feePercentage = isAuction ? 7 : 5;
    const platformFee = Math.round(amount * (feePercentage / 100));

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      application_fee_amount: platformFee,
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('Payment intent error:', error);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
};
