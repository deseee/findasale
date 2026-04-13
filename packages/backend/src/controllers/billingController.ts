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

    const validPriceIds = [
      process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
      process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
      process.env.STRIPE_TEAMS_MONTHLY_PRICE_ID,
      process.env.STRIPE_TEAMS_ANNUAL_PRICE_ID,
    ].filter(Boolean);

    if (!priceId || !validPriceIds.includes(priceId)) {
      return res.status(400).json({ message: 'Invalid price ID' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      include: { user: true },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    const isNewSubscriber = !organizer.stripeCustomerId;

    let customerId = organizer.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: organizer.user.email,
        metadata: { organizerId: organizer.id },
      });
      customerId = customer.id;

      await prisma.organizer.update({
        where: { id: organizer.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const sessionConfig: any = {
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL || 'https://finda.sale'}/organizer/upgrade?success=true`,
      cancel_url: `${process.env.FRONTEND_URL || 'https://finda.sale'}/organizer/upgrade?canceled=true`,
    };

    if (isNewSubscriber && process.env.STRIPE_TRIAL_COUPON_ID) {
      sessionConfig.discounts = [{ coupon: process.env.STRIPE_TRIAL_COUPON_ID }];
    }

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
 * Handle Stripe webhook events (subscription lifecycle)
 * Feature #75: Tier Lapse State Logic integrated here
 */
export const handleStripeWebhook = async (req: AuthRequest, res: Response) => {
  try {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not set');
      return res.status(500).json({ message: 'Webhook secret not configured' });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ message: 'Webhook signature verification failed' });
    }

    const alreadyProcessed = await prisma.processedWebhookEvent.findUnique({
      where: { eventId: event.id },
    });

    if (alreadyProcessed) {
      return res.json({ received: true });
    }

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
          // Feature #75: Downgrade to SIMPLE tier on lapse, but keep User roles intact
          // Do NOT remove ORGANIZER role — only downgrade subscription tier
          await syncTier(organizerId, 'canceled', null);

          // Record tier lapse timestamp for UserRoleSubscription
          const user = await prisma.user.findFirst({
            where: { organizer: { id: organizerId } },
            select: { id: true }
          });

          if (user) {
            await prisma.userRoleSubscription.updateMany({
              where: { userId: user.id, role: 'ORGANIZER' },
              data: {
                tierLapsedAt: new Date(),
                subscriptionTier: 'SIMPLE',
              }
            });
            console.log(`[billing] Tier lapsed for organizer ${organizerId}, downgraded to SIMPLE`);
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice: any = event.data.object;
        console.warn(`Payment failed for subscription ${invoice.subscription}`);
        // Do NOT downgrade immediately — Stripe will retry with dunning
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice: any = event.data.object;
        const subscription: any = await stripe.subscriptions.retrieve(invoice.subscription);
        const priceId = subscription.items.data[0]?.price.id;
        const organizerId = await getOrganizerIdFromStripeCustomer(invoice.customer);
        if (organizerId) {
          // Feature #75: Restore tier on payment recovery
          await syncTier(organizerId, 'active', priceId);

          // Clear tier lapse timestamp
          const user = await prisma.user.findFirst({
            where: { organizer: { id: organizerId } },
            select: { id: true }
          });

          if (user) {
            await prisma.userRoleSubscription.updateMany({
              where: { userId: user.id, role: 'ORGANIZER' },
              data: {
                tierLapsedAt: null,
                tierResumedAt: new Date(),
              }
            });
            console.log(`[billing] Tier resumed for organizer ${organizerId}`);
          }
        }
        break;
      }

      default:
        break;
    }

    await prisma.processedWebhookEvent.create({
      data: { eventId: event.id },
    });

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
};

/**
 * GET /api/billing/subscription
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

    try {
      const subscription: any = await stripe.subscriptions.retrieve(organizer.stripeSubscriptionId);
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
    } catch (stripeError) {
      console.error('Failed to fetch subscription from Stripe, falling back to DB:', stripeError);
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

    const subscription: any = await stripe.subscriptions.update(organizer.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    await prisma.organizer.update({
      where: { id: organizer.id },
      data: { subscriptionStatus: 'scheduled_for_cancellation' },
    });

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
 * POST /api/billing/portal
 * Create a Stripe Billing Portal session for organizer account management
 */
export const createBillingPortal = async (req: AuthRequest, res: Response) => {
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

    if (!organizer.stripeCustomerId) {
      return res.status(400).json({ message: 'No Stripe customer found. Please subscribe first.' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: organizer.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL || 'https://finda.sale'}/organizer/subscription`,
    });

    if (!session.url) {
      return res.status(500).json({ message: 'Failed to create billing portal session' });
    }

    res.json({ url: session.url });
  } catch (error) {
    console.error('Billing portal session error:', error);
    res.status(500).json({ message: 'Failed to create billing portal session' });
  }
};

async function getOrganizerIdFromStripeCustomer(customerId: string): Promise<string | null> {
  const organizer = await prisma.organizer.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return organizer?.id || null;
}

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
