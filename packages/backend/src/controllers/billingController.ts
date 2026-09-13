import { Response } from 'express';
import { SubscriptionTier } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { getStripe } from '../utils/stripe';
import { prisma } from '../lib/prisma';
import { syncTier } from '../lib/syncTier';
import {
  calculateDowngradeDelta,
  triggerGracePeriod,
  clearGracePeriod
} from '../services/tierGraceService';
import {
  ORGANIZER_TRIAL_DAYS,
  BILLING_INTERVAL_DAYS,
  createPlatformBillingCard,
  type BillableOrganizerTier,
} from '../services/squareBillingService';

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
  // Hoisted to function scope so the terminal-state catch at the bottom can mark this
  // event FAILED (mirrors stripeController.ts, where `event` is likewise in scope for
  // the handler catch). Empty key = we threw before the event was even parsed.
  let event: any;
  let billingIdempotencyKey = '';
  try {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_BILLING_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('STRIPE_BILLING_WEBHOOK_SECRET not set');
      return res.status(500).json({ message: 'Webhook secret not configured' });
    }

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ message: 'Webhook signature verification failed' });
    }

    // ADR pos-webhook-idempotency-reconciliation (2026-07-23, S1151): namespace the
    // idempotency key per endpoint so the billing webhook cannot claim (and lock out) a
    // shared event.id that the POS recorder on /api/stripe/webhook also needs to process.
    billingIdempotencyKey = `billing:${event.id}`;

    // S1176: two-phase status (PENDING -> COMPLETED | FAILED), ported verbatim in shape
    // from the proven POS implementation in stripeController.ts:763-802 / :2686-2698 so
    // there is ONE idempotency idiom in this codebase. This handler previously wrote
    // status:'COMPLETED' BEFORE running the switch below; if the switch then threw, the
    // catch returned 500, Stripe retried, the retry hit the P2002 path, saw a COMPLETED
    // row and returned 200 -- silently dropping the billing event forever (tier never
    // synced, Hunt Pass never activated, grace period never cleared).
    // INSERT-FIRST still preserves the P0 concurrent-duplicate race guard (first inserter wins).
    try {
      await prisma.processedWebhookEvent.create({
        data: { eventId: billingIdempotencyKey, status: 'PENDING' },
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        // Row already exists -- inspect its status to decide what to do.
        const existing = await prisma.processedWebhookEvent
          .findUnique({ where: { eventId: billingIdempotencyKey } })
          .catch(() => null);
        if (existing?.status === 'COMPLETED') {
          console.warn(`[billing-webhook] Duplicate event ${event.id} (type: ${event.type}) already COMPLETED -- skipping.`);
          return res.json({ received: true, duplicate: true });
        }
        if (existing?.status === 'FAILED') {
          // A prior attempt threw. Reset to PENDING and reprocess (fail-open retry).
          console.warn(`[billing-webhook] Event ${event.id} (type: ${event.type}) previously FAILED -- reprocessing.`);
          await prisma.processedWebhookEvent
            .update({ where: { eventId: billingIdempotencyKey }, data: { status: 'PENDING' } })
            .catch(() => {});
          // fall through to reprocess below
        } else {
          // PENDING (or unreadable) -- another delivery is in flight; do not reprocess
          // concurrently. Stripe's later retry will find COMPLETED or FAILED.
          console.warn(`[billing-webhook] Event ${event.id} (type: ${event.type}) in-flight (PENDING) -- skipping concurrent reprocess.`);
          return res.json({ received: true, duplicate: true });
        }
      } else {
        // Other errors (e.g. P2011 — known ProcessedWebhookEvent schema/DB drift, see
        // STATE.md Blocked Queue): log and continue rather than crashing the whole webhook.
        // A broken idempotency check should never take down real event processing.
        console.warn(`[billing-webhook] Failed to check idempotency for event ${event.id}:`, e);
      }
    }

    switch (event.type) {
      case 'customer.subscription.created': {
        const subscription: any = event.data.object;
        // Hunt Pass: shopper subscription — route by metadata before organizer path
        if (subscription.metadata?.type === 'hunt_pass') {
          const userId = subscription.metadata?.userId;
          if (userId) {
            const expiry = new Date(subscription.current_period_end * 1000);
            await prisma.user.update({
              where: { id: userId },
              data: {
                huntPassActive: true,
                huntPassExpiry: expiry,
                huntPassStripeSubscriptionId: subscription.id,
                huntPassCancelledAt: null,
              },
            });
            console.log(`[billing] Hunt Pass activated for user ${userId}, expires ${expiry.toISOString()}`);
          }
          break;
        }
        // Organizer subscription path
        const priceId = subscription.items.data[0]?.price.id;
        const organizerId = await getOrganizerIdFromStripeCustomer(subscription.customer);
        if (organizerId) {
          await syncTier(organizerId, subscription.status, priceId, subscription.id);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription: any = event.data.object;
        // Hunt Pass: refresh expiry on renewal or update
        if (subscription.metadata?.type === 'hunt_pass') {
          const userId = subscription.metadata?.userId;
          if (userId && subscription.status === 'active') {
            const expiry = new Date(subscription.current_period_end * 1000);
            await prisma.user.update({
              where: { id: userId },
              data: {
                huntPassActive: true,
                huntPassExpiry: expiry,
              },
            });
            console.log(`[billing] Hunt Pass renewed for user ${userId}, expires ${expiry.toISOString()}`);
          }
          break;
        }
        // Organizer subscription path
        const priceId = subscription.items.data[0]?.price.id;
        const organizerId = await getOrganizerIdFromStripeCustomer(subscription.customer);
        if (organizerId) {
          await syncTier(organizerId, subscription.status, priceId, subscription.id);

          // Grace Period: If organizer re-upgrades during grace, restore all items
          const organizer = await prisma.organizer.findUnique({
            where: { id: organizerId }
          });
          if (
            organizer?.graceEndAt &&
            new Date() <= organizer.graceEndAt &&
            subscription.status === 'active'
          ) {
            await clearGracePeriod(organizerId);
            console.log(`[billing] Grace period cleared for organizer ${organizerId} after tier restoration`);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription: any = event.data.object;
        // Hunt Pass: deactivate when subscription ends
        if (subscription.metadata?.type === 'hunt_pass') {
          const userId = subscription.metadata?.userId;
          if (userId) {
            await prisma.user.update({
              where: { id: userId },
              data: {
                huntPassActive: false,
                huntPassStripeSubscriptionId: null,
                huntPassCancelledAt: new Date(),
              },
            });
            console.log(`[billing] Hunt Pass deactivated for user ${userId}`);
          }
          break;
        }
        // Organizer subscription path
        const organizerId = await getOrganizerIdFromStripeCustomer(subscription.customer);
        if (organizerId) {
          // Feature #75: Downgrade to SIMPLE tier on lapse, but keep User roles intact
          // Do NOT remove ORGANIZER role — only downgrade subscription tier
          await syncTier(organizerId, 'canceled', null, null); // null clears stripeSubscriptionId

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
          await syncTier(organizerId, 'active', priceId, subscription.id);

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

          // Grace Period: Clear grace if organizer re-upgrades during grace period
          const organizer = await prisma.organizer.findUnique({
            where: { id: organizerId }
          });
          if (organizer?.graceEndAt && new Date() <= organizer.graceEndAt) {
            await clearGracePeriod(organizerId);
            console.log(`[billing] Grace period cleared for organizer ${organizerId} after re-upgrade`);
          }
        }
        break;
      }

      case 'checkout.session.completed': {
        // Security: Card Fingerprint Deduplication (P1)
        const session: any = event.data.object;
        const customerId = session.customer;

        if (customerId) {
          try {
            // Get customer metadata to find user ID
            const customer = await stripe.customers.retrieve(customerId);
            if (customer.deleted) break;
            const userId = (customer.metadata?.userId) as string | undefined;

            if (userId && session.payment_method) {
              // Retrieve payment method to get card fingerprint
              const paymentMethod = await stripe.paymentMethods.retrieve(session.payment_method);
              const fingerprint = paymentMethod.card?.fingerprint;

              if (fingerprint) {
                // Check if 5+ other users have the same fingerprint
                const otherUsersWithSameFingerprint = await prisma.user.count({
                  where: {
                    stripeCardFingerprint: fingerprint,
                    id: { not: userId },
                  },
                });

                if (otherUsersWithSameFingerprint >= 5) {
                  // Flag user as fraud suspect
                  await prisma.user.update({
                    where: { id: userId },
                    data: { fraudSuspect: true },
                  });

                  console.warn(
                    `[FRAUD_DETECTION] User ${userId} flagged. Card fingerprint ${fingerprint} shared by ${otherUsersWithSameFingerprint} other accounts.`
                  );
                }

                // Store fingerprint for future checks
                await prisma.user.update({
                  where: { id: userId },
                  data: { stripeCardFingerprint: fingerprint },
                });
              }
            }
          } catch (err: any) {
            console.error('[checkout] Failed to check card fingerprint:', err.message);
            // Non-blocking — don't fail the webhook
          }
        }
        break;
      }

      default:
        break;
    }

    // Terminal state written only AFTER the switch completed successfully
    // (mirrors stripeController.ts:2686-2689).
    await prisma.processedWebhookEvent.update({
      where: { eventId: billingIdempotencyKey },
      data: { status: 'COMPLETED' },
    }).catch((e) => console.warn(`[billing-webhook] Failed to mark event ${event.id} COMPLETED:`, e));
    res.json({ received: true });
  } catch (handlerErr: any) {
    // Mark FAILED so Stripe's retry is allowed to REPROCESS (fail-open) instead of
    // being short-circuited by a COMPLETED row that was never actually earned
    // (mirrors stripeController.ts:2691-2698). Guarded because a throw before the
    // signature was verified leaves no row to update.
    if (billingIdempotencyKey) {
      await prisma.processedWebhookEvent.update({
        where: { eventId: billingIdempotencyKey },
        data: { status: 'FAILED' },
      }).catch((e) => console.warn(`[billing-webhook] Failed to mark event ${event?.id} FAILED:`, e));
    }
    console.error(`[billing-webhook] handler threw for event ${event?.id} type=${event?.type}`, handlerErr);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Webhook processing failed' });
    }
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

    // Square Plan B (2026-09-13): this organizer's subscription lifecycle is governed by
    // squareBillingChargeJob.ts's own scheduler-owned columns, not a live Stripe subscription
    // object -- never call Stripe for these, DB is the sole source of truth (there is no
    // processor-pushed webhook to be stale against, unlike the Stripe branch below).
    if (organizer.billingProcessor === 'square') {
      return res.json({
        tier: organizer.subscriptionTier,
        status: organizer.subscriptionStatus,
        currentPeriodEnd: organizer.billingCurrentPeriodEnd,
        cancelAtPeriodEnd: organizer.subscriptionStatus === 'scheduled_for_cancellation',
        priceId: null,
        billingInterval: organizer.billingInterval,
        billingProcessor: 'square',
        hasSquareCardOnFile: !!organizer.squareCardId,
        billingLastFailureReason: organizer.billingLastFailureReason,
      });
    }

    if (!organizer.stripeSubscriptionId) {
      return res.json({
        tier: organizer.subscriptionTier,
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
 * POST /api/billing/square/subscribe
 * Body: { tier: 'PRO' | 'TEAMS', sourceId: string }
 *
 * Square Plan B (2026-09-13, see squareBillingService.ts header + claude_docs/feature-notes/
 * square-changeover-remaining-work-scoping-2026-09-09.md Section 2): tokenizes a card
 * (Square Web Payments SDK sourceId, produced client-side) into a Card-on-file in
 * FindA.Sale's platform Square account, then either starts a free trial (this organizer's
 * first-ever Square subscription -- no immediate charge, first charge deferred to
 * billingCurrentPeriodEnd) or activates immediately (already had billingProcessor='square'
 * before -- e.g. re-subscribing after a voluntary cancel or a dunning downgrade; no second
 * free trial). Covers BOTH a brand-new PRO/TEAMS sign-up and the migration path for an
 * organizer currently frozen on a dead Stripe subscription (calling this simply switches
 * them onto Square going forward -- their old stripeSubscriptionId is left untouched/inert).
 *
 * AUTHZ/OWNERSHIP: organizer is resolved ONLY from req.user.id -- no organizerId is ever
 * accepted from the request body, so there is no IDOR path to attach a card to someone
 * else's organizer record. NO MASS ASSIGNMENT: tier is restricted to the fixed 'PRO'|'TEAMS'
 * enum and the charge amount is ALWAYS looked up server-side from SQUARE_TIER_PRICE_CENTS --
 * the client can select which tier to buy, never what it costs.
 */
export const createSquareBillingSubscription = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { tier, sourceId } = req.body as { tier?: unknown; sourceId?: unknown };
    if (tier !== 'PRO' && tier !== 'TEAMS') {
      return res.status(400).json({ message: "tier must be 'PRO' or 'TEAMS'" });
    }
    if (typeof sourceId !== 'string' || !sourceId) {
      return res.status(400).json({ message: 'sourceId (Square card token) is required' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      select: { id: true, businessName: true, billingProcessor: true },
    });
    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    const validatedTier = tier as BillableOrganizerTier;

    let squareCustomerId: string;
    let squareCardId: string;
    try {
      const card = await createPlatformBillingCard({
        referenceId: organizer.id,
        sourceId,
        note: `FindA.Sale ${validatedTier} subscription billing -- organizer ${organizer.id}`,
      });
      squareCustomerId = card.customerId;
      squareCardId = card.cardId;
    } catch (err) {
      console.error('[Billing] createSquareBillingSubscription card tokenize error:', err);
      return res.status(400).json({ message: 'Could not save that card. Please check the details and try again.' });
    }

    const isFirstEverSquareSubscription = !organizer.billingProcessor;
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const trialEndsAt = isFirstEverSquareSubscription
      ? new Date(now.getTime() + ORGANIZER_TRIAL_DAYS * msPerDay)
      : null;
    const billingCurrentPeriodEnd = trialEndsAt ?? new Date(now.getTime() + BILLING_INTERVAL_DAYS * msPerDay);

    const updated = await prisma.organizer.update({
      where: { id: organizer.id },
      data: {
        subscriptionTier: validatedTier,
        subscriptionStatus: trialEndsAt ? 'trialing' : 'active',
        billingProcessor: 'square',
        billingInterval: 'monthly',
        squareCustomerId,
        squareCardId,
        billingCurrentPeriodEnd,
        trialEndsAt,
        billingDunningFailCount: 0,
        billingNextRetryAt: null,
        billingGraceEndsAt: null,
        billingLastFailureReason: null,
        billingMigrationNoticeSentAt: null,
        tokenVersion: { increment: 1 }, // real tier change -- invalidate any stale tier claim in a live JWT
      },
      select: { subscriptionTier: true, subscriptionStatus: true, billingCurrentPeriodEnd: true, billingInterval: true },
    });

    await prisma.userRoleSubscription.upsert({
      where: { userId_role: { userId: req.user.id, role: 'ORGANIZER' } },
      create: {
        userId: req.user.id,
        role: 'ORGANIZER',
        subscriptionTier: validatedTier,
        subscriptionStatus: updated.subscriptionStatus,
        trialEndsAt,
        tierLapsedAt: null,
        tierResumedAt: new Date(),
      },
      update: {
        subscriptionTier: validatedTier,
        subscriptionStatus: updated.subscriptionStatus,
        trialEndsAt,
        tierLapsedAt: null,
        tierResumedAt: new Date(),
      },
    });

    res.json({
      tier: updated.subscriptionTier,
      status: updated.subscriptionStatus,
      currentPeriodEnd: updated.billingCurrentPeriodEnd,
      cancelAtPeriodEnd: false,
      priceId: null,
      billingInterval: updated.billingInterval,
      billingProcessor: 'square',
      trialEndsAt,
    });
  } catch (error) {
    console.error('[Billing] createSquareBillingSubscription error:', error);
    res.status(500).json({ message: 'Failed to set up Square billing' });
  }
};

/**
 * POST /api/billing/square/cancel
 * Square Plan B equivalent of cancelSubscription -- sets 'scheduled_for_cancellation' (the
 * SAME status string the Stripe path already uses) so squareBillingChargeJob.ts skips the
 * next charge and downgrades to SIMPLE once the already-paid-for period ends, rather than
 * cutting access off immediately. AUTHZ/OWNERSHIP: organizer resolved only from req.user.id.
 */
export const cancelSquareBillingSubscription = async (req: AuthRequest, res: Response) => {
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
    if (organizer.billingProcessor !== 'square' || !organizer.billingCurrentPeriodEnd) {
      return res.status(400).json({ message: 'No active Square subscription to cancel' });
    }

    await prisma.organizer.update({
      where: { id: organizer.id },
      data: { subscriptionStatus: 'scheduled_for_cancellation' },
    });

    res.json({
      tier: organizer.subscriptionTier,
      status: 'scheduled_for_cancellation',
      currentPeriodEnd: organizer.billingCurrentPeriodEnd,
      cancelAtPeriodEnd: true,
      priceId: null,
      billingInterval: organizer.billingInterval,
      billingProcessor: 'square',
    });
  } catch (error) {
    console.error('[Billing] cancelSquareBillingSubscription error:', error);
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

/**
 * GET /api/billing/downgrade-preview
 * Preview what changes when downgrading to SIMPLE
 */
export const getDowngradePreview = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id }
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    const delta = await calculateDowngradeDelta(organizer.id, 'SIMPLE');
    const graceEndDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    return res.json({
      currentTier: organizer.subscriptionTier,
      downgradingTo: 'SIMPLE',
      ...delta,
      graceStartDate: new Date().toISOString(),
      graceEndDate: graceEndDate.toISOString(),
      canRestoreWithin30Days: true,
      upgradeUrl: '/organizer/upgrade'
    });
  } catch (err) {
    console.error('Downgrade preview error:', err);
    return res.status(500).json({ message: 'Failed to calculate downgrade preview' });
  }
};

/**
 * POST /api/billing/downgrade-confirm
 * Confirm downgrade to SIMPLE — triggers grace period
 */
export const confirmDowngrade = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id }
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    if (!organizer.stripeSubscriptionId) {
      return res.status(400).json({ message: 'No active subscription to downgrade' });
    }

    // Trigger grace period
    const graceEndAt = await triggerGracePeriod(
      organizer.id,
      organizer.subscriptionTier || 'PRO'
    );

    // Cancel subscription at period end (not immediately)
    await stripe.subscriptions.update(organizer.stripeSubscriptionId, {
      cancel_at_period_end: true
    });

    return res.json({
      success: true,
      message: 'Downgrade scheduled. Your 7-day grace period has started.',
      graceEndAt: graceEndAt.toISOString()
    });
  } catch (err) {
    console.error('Confirm downgrade error:', err);
    return res.status(500).json({ message: 'Failed to schedule downgrade' });
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

// ---------------------------------------------------------------------------
// Bring-Your-Own-Rails (BYOR, 2026-09-06) -- opt-in/consent + usage-visibility endpoints.
// Deliberately ZERO Stripe calls in this section: no `stripe.*` reference, no invoiceItems,
// no touching organizer.stripeCustomerId for a charge. Scope note (2026-09-06 dispatch): only
// steps 1-4 of the architect's build order are built here (schema, mark-sold endpoint,
// opt-in/consent, read endpoints). byorFeeCalculator.ts / byorInvoicingCron.ts / the real
// invoice-webhook extension (step 5, which DOES need Stripe) are a separate, later dispatch
// pending Patrick's fee-amount decision -- see claude_docs/feature-notes/
// bring-your-own-rails-architecture-and-scoping-2026-09-06.md. No PlatformInvoice row is ever
// created by this file yet.
// ---------------------------------------------------------------------------

/**
 * POST /api/billing/off-platform-sales/opt-in
 * Body: { enabled: boolean }
 *
 * Toggles Organizer.offPlatformSalesEnabled. Turning it ON requires and stamps consent
 * (RoleConsent.offPlatformSalesConsentedAt) -- turning it OFF just pauses the feature and never
 * clears that historical consent timestamp (matches how every other *AcceptedAt field on
 * RoleConsent behaves elsewhere in this codebase: an acceptance timestamp is a historical fact,
 * never nulled out again).
 *
 * Builds the ORGANIZER UserRoleSubscription -> RoleConsent chain from scratch on first use --
 * findasale-dev scoping correction #3 (2026-09-06) confirmed RoleConsent.paymentMethodAcceptedAt
 * (the field originally cited as "the idiom to copy") has zero call sites anywhere in the
 * backend, and separately confirmed (via grep across the whole backend) there is no existing
 * write path anywhere that creates a UserRoleSubscription row for an organizer who predates it --
 * authController.ts's registration-time consent write only creates RoleConsent
 * `if (orgRoleSubscription)` already exists and silently no-ops otherwise. This endpoint is the
 * only writer of this chain for BYOR and must not assume either row already exists.
 */
export const optInOffPlatformSales = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const hasOrganizerRole = req.user.roles?.includes('ORGANIZER') || req.user.role === 'ORGANIZER';
    if (!hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const { enabled } = req.body as { enabled?: unknown };
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'enabled (boolean) is required.' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      select: { id: true },
    });
    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    let consentedAt: Date | null = null;

    if (enabled) {
      let roleSubscription = await prisma.userRoleSubscription.findFirst({
        where: { userId: req.user.id, role: 'ORGANIZER' },
        select: { id: true },
      });
      if (!roleSubscription) {
        roleSubscription = await prisma.userRoleSubscription.create({
          data: { userId: req.user.id, role: 'ORGANIZER' },
          select: { id: true },
        });
      }

      consentedAt = new Date();
      await prisma.roleConsent.upsert({
        where: { subscriptionId: roleSubscription.id },
        create: {
          subscriptionId: roleSubscription.id,
          role: 'ORGANIZER',
          offPlatformSalesConsentedAt: consentedAt,
        },
        update: {
          offPlatformSalesConsentedAt: consentedAt,
        },
      });
    } else {
      const roleSubscription = await prisma.userRoleSubscription.findFirst({
        where: { userId: req.user.id, role: 'ORGANIZER' },
        select: { consentRecord: { select: { offPlatformSalesConsentedAt: true } } },
      });
      consentedAt = roleSubscription?.consentRecord?.offPlatformSalesConsentedAt ?? null;
    }

    const updated = await prisma.organizer.update({
      where: { id: organizer.id },
      data: { offPlatformSalesEnabled: enabled },
      select: { offPlatformSalesEnabled: true },
    });

    res.json({
      ok: true,
      offPlatformSalesEnabled: updated.offPlatformSalesEnabled,
      offPlatformSalesConsentedAt: consentedAt ? consentedAt.toISOString() : null,
    });
  } catch (error) {
    console.error('[Billing] off-platform-sales opt-in error:', error);
    res.status(500).json({ message: 'Server error while updating off-platform sales setting' });
  }
};

/**
 * GET /api/billing/off-platform-usage
 *
 * Current-billing-period off-platform-sale usage for the logged-in organizer. Fee amount is
 * NOT computed here -- Patrick's flat/tiered/hybrid pricing decision (ADR-121 Open Decision
 * #13) hasn't been made yet, so this deliberately returns amountCents: null and
 * pricingNotYetSet: true rather than guessing a number. byorFeeCalculator.ts (a later
 * dispatch) is what turns itemCount into a real amountCents.
 */
export const getOffPlatformUsage = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const hasOrganizerRole = req.user.roles?.includes('ORGANIZER') || req.user.role === 'ORGANIZER';
    if (!hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      select: { id: true, offPlatformSalesEnabled: true },
    });
    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    const now = new Date();
    const billingPeriodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    const itemCount = await prisma.offPlatformSale.count({
      where: { organizerId: organizer.id, billingPeriodKey },
    });

    res.json({
      offPlatformSalesEnabled: organizer.offPlatformSalesEnabled,
      billingPeriodKey,
      itemCount,
      amountCents: null,
      pricingNotYetSet: true,
    });
  } catch (error) {
    console.error('[Billing] off-platform-usage error:', error);
    res.status(500).json({ message: 'Server error while fetching off-platform sales usage' });
  }
};
