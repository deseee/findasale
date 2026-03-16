import { Response } from 'express';
import { SubscriptionTier } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { getStripe } from '../utils/stripe';
import { prisma } from '../lib/prisma';
import { syncTier } from '../lib/syncTier';

const stripe = getStripe();

/**
 * POST /api/billing/checkout
 * Create a Stripe Checkout Session for organizer subscription upgrade
 */
export const createCheckoutSession = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { priceId, billingInterval } = req.body as { priceId: string; billingInterval: 'monthly' | 'annual' };

    // Validate priceId against env vars
    const validPriceIds = [
      process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
      process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
      process.env.STRIPE_TEAMS_MONTHLY_PRICE_ID,
      process.env.STRIPE_TEAMS_ANNUAL_PRICE_ID,
    ].filter(Boolean);

    if (!priceId || !validPriceIds.includes(priceId)) {
      return res.status(400).json({ message: 'Invalid price ID' });
    }

    // Get organizer
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      include: { user: true },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    // Determine if this is a new subscriber (no prior stripeCustomerId)
    const isNewSubscriber = !organizer.stripeCustomerId;

    // Get or create Stripe customer
    let customerId = organizer.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: organizer.user.email,
        metadata: { organizerId: organizer.id },
      });
      customerId = customer.id;

      // Save customer ID to organizer
      await prisma.organizer.update({
        where: { id: organizer.id },
        data: { stripeCustomerId: customerId },
      });
    }

    // Build checkout session config
    const sessionConfig: any = {
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL || 'https://finda.sale'}/organizer/upgrade?success=true`,
      cancel_url: `${process.env.FRONTEND_URL || 'https://finda.sale'}/organizer/upgrade?canceled=true`,
    };

    // Apply trial coupon for new subscribers only
    if (isNewSubscriber && process.env.STRIPE_TRIAL_COUPON_ID) {
      sessionConfig.discounts = [{ coupon: process.env.STRIPE_TRIAL_COUPON_ID }];
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create(sessionConfig);

    if (!session.url) {
      return res.status(500).json({ message: 'Failed to create checkout session' });
    }

    res.json({ url: session.url });
  } catch (error) {
    console.error('Checkout session error:', error);
    res.status(500).json({ message: 'Failed to create checkout session' });
  }
};

/**
 * POST /api/billing/webhook
 * Handle Stripe webhook events (subscription lifecycle, payment events)
 * NO authentication — signature verified with STRIPE_WEBHOOK_SECRET
 */
export const handleStripeWebhook = async (req: AuthRequest, res: Response) => {
  try {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not set');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    // Construct and verify event
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    // Check idempotency
    const alreadyProcessed = await prisma.processedWebhookEvent.findUnique({
      where: { eventId: event.id },
    });

    if (alreadyProcessed) {
      return res.json({ received: true });
    }

    // Handle event types
    switch (event.type) {
      case 'customer.subscription.created': {
        const subscription: any = event.data.object;
        const priceId = subscription.items.data[0]?.price.id;
        const organizerId = await getOrganizerIdFromStripeCustomer(subscription.customer);
        if (organizerId) {
          await syncTier(organizerId, subscription.status, priceId);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription: any = event.data.object;
        const priceId = subscription.items.data[0]?.price.id;
        const organizerId = await getOrganizerIdFromStripeCustomer(subscription.customer);
        if (organizerId) {
          await syncTier(organizerId, subscription.status, priceId);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription: any = event.data.object;
        const organizerId = await getOrganizerIdFromStripeCustomer(subscription.customer);
        if (organizerId) {
          await syncTier(organizerId, 'canceled', null);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice: any = event.data.object;
        console.warn(`Payment failed for subscription ${invoice.subscription}`);
        // DO NOT downgrade immediately — Stripe will retry with dunning
        // Optionally send email notification (future enhancement)
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice: any = event.data.object;
        const subscription: any = await stripe.subscriptions.retrieve(invoice.subscription);
        const priceId = subscription.items.data[0]?.price.id;
        const organizerId = await getOrganizerIdFromStripeCustomer(invoice.customer);
        if (organizerId) {
          await syncTier(organizerId, 'active', priceId);
        }
        break;
      }

      default:
        // Ignore unhandled event types
        break;
    }

    // Mark as processed
    await prisma.processedWebhookEvent.create({
      data: { eventId: event.id },
    });

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

/**
 * GET /api/billing/subscription
 * Get current subscription status for authenticated organizer
 */
export const getSubscription = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    // If no subscription, return SIMPLE tier
    if (!organizer.stripeSubscriptionId) {
      return res.json({
        tier: 'SIMPLE',
        status: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        priceId: null,
        billingInterval: null,
      });
    }

    // Fetch subscription from Stripe
    try {
      const subscription: any = await stripe.subscriptions.retrieve(organizer.stripeSubscriptionId);
      const priceData = subscription.items.data[0]?.price;
      const priceId = priceData?.id;

      // Map price ID to tier
      const tier = getTierFromPriceId(priceId);

      res.json({
        tier,
        status: subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        priceId,
        billingInterval: priceData?.recurring?.interval || null,
      });
    } catch (stripeError) {
      console.error('Failed to fetch subscription from Stripe, falling back to DB:', stripeError);
      // Graceful degradation: return organizer's DB tier
      res.json({
        tier: organizer.subscriptionTier,
        status: organizer.subscriptionStatus,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: organizer.subscriptionStatus === 'scheduled_for_cancellation',
        priceId: null,
        billingInterval: null,
      });
    }
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ message: 'Failed to retrieve subscription' });
  }
};

/**
 * POST /api/billing/cancel
 * Cancel organizer's subscription (at end of current period)
 */
export const cancelSubscription = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    if (!organizer.stripeSubscriptionId) {
      return res.status(400).json({ message: 'No active subscription to cancel' });
    }

    // Update subscription in Stripe
    const subscription: any = await stripe.subscriptions.update(organizer.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // Update organizer in DB
    await prisma.organizer.update({
      where: { id: organizer.id },
      data: {
        subscriptionStatus: 'scheduled_for_cancellation',
      },
    });

    // Return updated subscription info
    const priceData = subscription.items.data[0]?.price;
    const priceId = priceData?.id;
    const tier = getTierFromPriceId(priceId);

    res.json({
      tier,
      status: subscription.status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      priceId,
      billingInterval: priceData?.recurring?.interval || null,
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ message: 'Failed to cancel subscription' });
  }
};

/**
 * Helper: Get organizer ID from Stripe customer (to handle webhook events)
 */
async function getOrganizerIdFromStripeCustomer(customerId: string): Promise<string | null> {
  const organizer = await prisma.organizer.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return organizer?.id || null;
}

/**
 * Helper: Map Stripe price ID to tier (PRO, TEAMS, or SIMPLE)
 */
function getTierFromPriceId(priceId: string | null): SubscriptionTier {
  if (!priceId) return 'SIMPLE';

  const proMonthly = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
  const proAnnual = process.env.STRIPE_PRO_ANNUAL_PRICE_ID;
  const teamsMonthly = process.env.STRIPE_TEAMS_MONTHLY_PRICE_ID;
  const teamsAnnual = process.env.STRIPE_TEAMS_ANNUAL_PRICE_ID;

  if (priceId === proMonthly || priceId === proAnnual) return 'PRO' as SubscriptionTier;
  if (priceId === teamsMonthly || priceId === teamsAnnual) return 'TEAMS' as SubscriptionTier;
  return 'SIMPLE';
}
