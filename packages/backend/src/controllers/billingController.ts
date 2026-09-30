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
import { computeOrganizerEntitlement } from '../services/tierLapseService';
import {
  ORGANIZER_TRIAL_DAYS,
  BILLING_INTERVAL_DAYS,
  SQUARE_TIER_PRICE_CENTS,
  createPlatformBillingCard,
  chargeStoredCard,
  computeUpgradeProrationCents,
  type BillableOrganizerTier,
} from '../services/squareBillingService';
import { claimBillingCharge, completeBillingCharge, failBillingCharge, findRecentCompletedSubscribeCharge } from '../services/organizerBillingLedger';
import { addDaysUtc, renewalPeriodKey } from '../utils/billingPeriod'; // 2026-09-30: every period / trial end is exact UTC-millisecond arithmetic, same as the renewal job

// 2026-09-29: lazy. This used to call getStripe() at import time, which throws when
// STRIPE_SECRET_KEY is missing and would crash the whole server at boot even though Stripe is closed
// and payments run on Square. The proxy resolves the real client on first property access, so the
// existing `stripe.subscriptions...` / `stripe.webhooks...` call sites are unchanged, and a legacy
// path that is really called without a key throws StripeNotConfiguredError (503) at that moment.
const stripe: ReturnType<typeof getStripe> = new Proxy({} as ReturnType<typeof getStripe>, {
  get: (_target, prop) => (getStripe() as any)[prop],
});

// 2026-09-29: Stripe's platform account is permanently closed (see the removal note below), so
// every Stripe API call for an organizer subscription fails. While this is true (the default),
// cancel / undo-cancel / subscription-read for any organizer that is not billed through Square
// work from the database only and never touch Stripe. The original Stripe branches stay in the
// code below, untouched, and become reachable again only if STRIPE_PLATFORM_CLOSED is set to the
// literal string 'false' (for example if a Stripe account is ever reopened).
const STRIPE_PLATFORM_CLOSED = process.env.STRIPE_PLATFORM_CLOSED !== 'false';

function isPaidTierValue(tier: unknown): boolean {
  return tier === 'PRO' || tier === 'TEAMS';
}

/** Entitlement fields added to /billing/subscription for the frontend tier hook (additive). */
function entitlementFields(organizer: any) {
  const { entitlementEndsAt, inDunning } = computeOrganizerEntitlement(organizer);
  return { entitlementEndsAt: entitlementEndsAt ? entitlementEndsAt.toISOString() : null, inDunning };
}

/**
 * The date a scheduled cancellation takes effect: the organizer's current period end.
 * A Square-billed organizer always has billingCurrentPeriodEnd. An organizer still on the old
 * frozen Stripe subscription has no period end stored (Stripe is closed, so there is nobody to
 * ask), so fall back to their Square-migration deadline (billingGraceEndsAt) when one was set,
 * and otherwise to one full billing interval from now. `isEstimate` is true for those fallbacks.
 */
function resolveCancellationPeriodEnd(organizer: any, now: Date = new Date()): { periodEnd: Date; isEstimate: boolean } {
  if (organizer.billingCurrentPeriodEnd) {
    return { periodEnd: new Date(organizer.billingCurrentPeriodEnd), isEstimate: false };
  }
  if (organizer.billingGraceEndsAt) {
    return { periodEnd: new Date(organizer.billingGraceEndsAt), isEstimate: true };
  }
  return { periodEnd: addDaysUtc(now, BILLING_INTERVAL_DAYS), isEstimate: true };
}

/**
 * DB-only "cancel at period end". Mirrors cancelSquareBillingSubscription's writes
 * (subscriptionStatus = 'scheduled_for_cancellation', tier untouched, access kept until the
 * period ends) and records the period end in billingCurrentPeriodEnd when the organizer has none,
 * so the end date survives and the daily downgrade pass has a deadline to act on (Square-billed
 * organizers are downgraded by jobs/squareBillingChargeJob.ts, everyone else by
 * tierGraceService.downgradeScheduledCancelFrozenOrganizers, run from jobs/tierGraceCronJob.ts).
 * Zero Stripe calls. Idempotent: an already-scheduled cancellation keeps its date.
 */
async function scheduleCancellationFromDb(organizer: any): Promise<{ periodEnd: Date; alreadyScheduled: boolean }> {
  if (organizer.subscriptionStatus === 'scheduled_for_cancellation' && organizer.billingCurrentPeriodEnd) {
    return { periodEnd: new Date(organizer.billingCurrentPeriodEnd), alreadyScheduled: true };
  }
  const { periodEnd } = resolveCancellationPeriodEnd(organizer);
  await prisma.organizer.update({
    where: { id: organizer.id },
    data: {
      subscriptionStatus: 'scheduled_for_cancellation',
      ...(organizer.billingCurrentPeriodEnd ? {} : { billingCurrentPeriodEnd: periodEnd }),
    },
  });
  return { periodEnd, alreadyScheduled: false };
}

// createCheckoutSession (dead Stripe subscription-checkout endpoint) removed 2026-09-20 --
// zero live frontend callers (pricing.tsx redirects to the Square billing flow instead,
// see createSquareBillingSubscription below), and Stripe's platform account is permanently
// closed so this always failed Stripe-side if hit directly. Patrick's decision, in chat:
// "theres no stripe at all get rid of it". `stripe` (getStripe()) stays imported -- still
// used below by handleStripeWebhook/getSubscription/cancelSubscription/createBillingPortal
// for existing legacy Stripe subscribers.

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
        ...entitlementFields(organizer),
      });
    }

    // 2026-09-29: not Square-billed and Stripe's platform account is closed (see
    // STRIPE_PLATFORM_CLOSED above). An organizer with a leftover Stripe subscription id, or one
    // who already scheduled a DB-only cancellation, is answered from the database only: no Stripe
    // call, and the scheduled end date (billingCurrentPeriodEnd) is reported instead of null.
    if (STRIPE_PLATFORM_CLOSED && (organizer.stripeSubscriptionId || organizer.subscriptionStatus === 'scheduled_for_cancellation')) {
      return res.json({
        tier: organizer.subscriptionTier,
        status: organizer.subscriptionStatus,
        currentPeriodEnd: organizer.billingCurrentPeriodEnd,
        cancelAtPeriodEnd: organizer.subscriptionStatus === 'scheduled_for_cancellation',
        priceId: null,
        billingInterval: organizer.billingInterval,
        billingProcessor: null,
        ...entitlementFields(organizer),
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
        ...entitlementFields(organizer),
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
        ...entitlementFields(organizer),
      });
    } catch (stripeError) {
      console.error('Failed to fetch subscription from Stripe, falling back to DB:', stripeError);
      res.json({
        tier: organizer.subscriptionTier,
        status: organizer.subscriptionStatus,
        currentPeriodEnd: organizer.billingCurrentPeriodEnd,
        cancelAtPeriodEnd: organizer.subscriptionStatus === 'scheduled_for_cancellation',
        priceId: null,
        billingInterval: null,
        ...entitlementFields(organizer),
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

    // 2026-09-29: DB-only cancel for every organizer that is not on a live Stripe subscription
    // (Square-billed, or frozen on the closed Stripe account). The Stripe branch below used to be
    // the only path for frozen organizers and always failed with a 500 (closed platform account).
    // Same fields and messaging as cancelSquareBillingSubscription; no Stripe API call.
    if (STRIPE_PLATFORM_CLOSED || organizer.billingProcessor === 'square') {
      if (!isPaidTierValue(organizer.subscriptionTier)) {
        return res.status(400).json({ message: 'No active subscription to cancel' });
      }
      const { periodEnd } = await scheduleCancellationFromDb(organizer);
      return res.json({
        tier: organizer.subscriptionTier,
        status: 'scheduled_for_cancellation',
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: true,
        priceId: null,
        billingInterval: organizer.billingInterval,
        billingProcessor: organizer.billingProcessor === 'square' ? 'square' : null,
      });
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
 * POST /api/billing/cancel/undo
 * Undo a scheduled cancellation while the paid period is still running (2026-09-29). Puts the
 * organizer back to 'active' (or 'trialing' when a trial is still running) and, for an organizer
 * that is not Square-billed, clears the period end that scheduleCancellationFromDb recorded (a
 * non-Square organizer has no real billing period, so that date only meant "cancellation date").
 * DB-only, no Stripe call, unless STRIPE_PLATFORM_CLOSED is 'false' and the organizer has a live
 * Stripe subscription (then the original Stripe cancel_at_period_end is reversed too).
 * AUTHZ/OWNERSHIP: organizer resolved only from req.user.id.
 */
export const undoCancelSubscription = async (req: AuthRequest, res: Response) => {
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
    if (organizer.subscriptionStatus !== 'scheduled_for_cancellation') {
      return res.status(400).json({ message: 'There is no scheduled cancellation to undo' });
    }

    const now = new Date();
    if (organizer.billingCurrentPeriodEnd && organizer.billingCurrentPeriodEnd.getTime() <= now.getTime()) {
      return res.status(400).json({ message: 'Your plan period has already ended. Subscribe again to restart it.' });
    }

    const isSquare = organizer.billingProcessor === 'square';
    if (!STRIPE_PLATFORM_CLOSED && !isSquare && organizer.stripeSubscriptionId) {
      await stripe.subscriptions.update(organizer.stripeSubscriptionId, { cancel_at_period_end: false });
    }

    const restoredStatus = organizer.trialEndsAt && organizer.trialEndsAt.getTime() > now.getTime() ? 'trialing' : 'active';
    const updated = await prisma.organizer.update({
      where: { id: organizer.id },
      data: {
        subscriptionStatus: restoredStatus,
        ...(isSquare ? {} : { billingCurrentPeriodEnd: null }),
      },
      select: { subscriptionTier: true, billingCurrentPeriodEnd: true, billingInterval: true },
    });

    res.json({
      tier: updated.subscriptionTier,
      status: restoredStatus,
      currentPeriodEnd: updated.billingCurrentPeriodEnd,
      cancelAtPeriodEnd: false,
      priceId: null,
      billingInterval: updated.billingInterval,
      billingProcessor: isSquare ? 'square' : null,
    });
  } catch (error) {
    console.error('[Billing] undoCancelSubscription error:', error);
    res.status(500).json({ message: 'Failed to undo the cancellation' });
  }
};

/** Organizer ids with a subscribe / upgrade charge currently running in THIS process (double-click guard). */
const subscribeInFlight = new Set<string>();

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function isRecordNotFoundError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: unknown }).code === 'P2025';
}

/**
 * POST /api/billing/square/subscribe
 * Body: { tier: 'PRO' | 'TEAMS', sourceId: string }
 *
 * Square Plan B (2026-09-13, see squareBillingService.ts header + claude_docs/feature-notes/
 * square-changeover-remaining-work-scoping-2026-09-09.md Section 2): tokenizes a card
 * (Square Web Payments SDK sourceId, produced client-side) into a Card-on-file in
 * FindA.Sale's platform Square account.
 *
 * 2026-09-29 PAYMENT-FIRST REWRITE (P0): this endpoint used to store the card and grant the tier
 * and a fresh period end without charging anything, and every call reset the period end, so
 * calling it repeatedly granted PRO/TEAMS for free forever (the 01:00 UTC job only bills once a
 * period is due). It now decides one of four modes from the organizer's CURRENT state:
 *
 *   trial_start   billingProcessor is still null (first-ever Square subscription, including a
 *                 frozen Stripe organizer migrating over): 7-day trial, card stored, NO charge.
 *                 This is the documented trial-to-paid flow: billingCurrentPeriodEnd = trial end,
 *                 and squareBillingChargeJob charges the tier price when it arrives. Happens once
 *                 per organizer because billingProcessor becomes 'square' and is never cleared.
 *   trial_update  an active Square trial (trialEndsAt in the future): swap the card / tier, NO
 *                 charge, and the trial end and period end are NOT moved (no free extension).
 *   upgrade       a paid PRO period is running and TEAMS is requested: immediate TEAMS, charged
 *                 the price DIFFERENCE prorated by remaining days (computeUpgradeProrationCents),
 *                 period end unchanged, next renewal bills full TEAMS price.
 *   new_period    everything else (first paid period after a lapse, dunning recovery, legacy
 *                 processor): the tier price is charged SYNCHRONOUSLY for a fresh 30-day period.
 *
 * Refusals: a paid, still-running period for the SAME tier is 409 ALREADY_ACTIVE (use the undo
 * cancel endpoint if it is only scheduled to cancel); asking for PRO while on a paid TEAMS period
 * is 409 DOWNGRADE_NOT_ALLOWED (downgrades go through /billing/cancel or /billing/downgrade-confirm,
 * which schedule the change for the period end). A second request while one is running is 409
 * PAYMENT_IN_PROGRESS.
 *
 * MONEY RULES: subscriptionTier, billingCurrentPeriodEnd and billingProcessor are only written
 * after a COMPLETED Square payment id (chargeStoredCard requireCompleted). A declined card is 402
 * CARD_DECLINED and leaves tier, period end and stored card untouched. The charge is claimed in
 * the OrganizerBillingCharge ledger first (unique per organizer + period key), so a retry after a
 * crash finds the COMPLETED row and re-applies the grant without charging again.
 *
 * ONE CHARGE PER PERIOD (2026-09-30): a new_period subscribe by an organizer whose period end has
 * ALREADY PASSED (dunning, lapsed trial) claims the SAME ledger key the daily job uses for that period
 * (`renewal:<periodEndISO>`), so the job and this endpoint can never both charge it: the unique
 * (organizerId, periodKey) row makes the loser 'in_progress' or 'already_completed'. Every other
 * new_period key is `subscribe:<period end or none>:<UTC day>` with NO tier in it, and the retry lookup
 * is tier-blind: when a period was already PAID (COMPLETED) but never activated, the grant applies the
 * tier that was actually paid (never a silent second charge for a different tier; the organizer can
 * then upgrade, which is prorated). The Square
 * idempotency key contains organizerId + kind + tier + period key + amount + the card sourceId, so
 * retrying with a NEW card after a decline is never IDEMPOTENCY_KEY_REUSED.
 *
 * AUTHZ/OWNERSHIP: organizer is resolved ONLY from req.user.id -- no organizerId is ever
 * accepted from the request body, so there is no IDOR path to attach a card to someone
 * else's organizer record. NO MASS ASSIGNMENT: tier is restricted to the fixed 'PRO'|'TEAMS'
 * enum and the charge amount is ALWAYS computed server-side from SQUARE_TIER_PRICE_CENTS --
 * the client can select which tier to buy, never what it costs.
 */
export const createSquareBillingSubscription = async (req: AuthRequest, res: Response) => {
  let lockedOrganizerId: string | null = null;
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
      select: {
        id: true,
        businessName: true,
        billingProcessor: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        billingCurrentPeriodEnd: true,
        trialEndsAt: true,
      },
    });
    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    const validatedTier = tier as BillableOrganizerTier;
    const now = new Date();
    const currentTier = (organizer.subscriptionTier as string | null | undefined) ?? null;
    const currentPeriodEnd = organizer.billingCurrentPeriodEnd ? new Date(organizer.billingCurrentPeriodEnd) : null;
    const periodRunning =
      organizer.billingProcessor === 'square' &&
      !!currentPeriodEnd &&
      currentPeriodEnd.getTime() > now.getTime() &&
      isPaidTierValue(currentTier);
    const trialRunning =
      periodRunning && !!organizer.trialEndsAt && new Date(organizer.trialEndsAt).getTime() > now.getTime();
    const paidPeriodRunning = periodRunning && !trialRunning;

    if (paidPeriodRunning && currentTier === validatedTier) {
      const cancelScheduled = organizer.subscriptionStatus === 'scheduled_for_cancellation';
      return res.status(409).json({
        code: 'ALREADY_ACTIVE',
        message: cancelScheduled
          ? `Your ${validatedTier} plan is already paid through ${currentPeriodEnd!.toISOString().slice(0, 10)} and is set to cancel. Undo the cancellation to keep it instead of subscribing again.`
          : `Your ${validatedTier} plan is already active through ${currentPeriodEnd!.toISOString().slice(0, 10)}. You will be billed again when the period ends.`,
        tier: validatedTier,
        currentPeriodEnd,
        cancelAtPeriodEnd: cancelScheduled,
      });
    }
    if (paidPeriodRunning && currentTier === 'TEAMS' && validatedTier === 'PRO') {
      return res.status(409).json({
        code: 'DOWNGRADE_NOT_ALLOWED',
        message: `Your TEAMS plan is paid through ${currentPeriodEnd!.toISOString().slice(0, 10)}. To move to a lower plan, schedule the change from your subscription settings and it will take effect when the period ends.`,
        tier: currentTier,
        currentPeriodEnd,
      });
    }

    type SubscribeMode = 'trial_start' | 'trial_update' | 'upgrade' | 'new_period';
    const mode: SubscribeMode = trialRunning
      ? 'trial_update'
      : paidPeriodRunning
        ? 'upgrade'
        : !organizer.billingProcessor
          ? 'trial_start'
          : 'new_period';

    if (subscribeInFlight.has(organizer.id)) {
      return res.status(409).json({
        code: 'PAYMENT_IN_PROGRESS',
        message: 'A payment for your subscription is already being processed. Please wait a moment and check your plan before trying again.',
      });
    }
    subscribeInFlight.add(organizer.id);
    lockedOrganizerId = organizer.id;

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

    // ---- Charge (new_period / upgrade only). Nothing below this block runs unless it succeeds. ----
    let amountCents = 0;
    let paymentId: string | null = null;
    // The tier that gets granted: the requested tier, unless the period being applied was already PAID
    // for a different tier (then that paid tier, never a second charge).
    let grantTier: BillableOrganizerTier = validatedTier;
    let tierAdjusted = false;
    if (mode === 'new_period' || mode === 'upgrade') {
      const kind = mode === 'upgrade' ? 'UPGRADE' : 'SUBSCRIBE';
      amountCents =
        mode === 'upgrade'
          ? computeUpgradeProrationCents(currentTier as BillableOrganizerTier, validatedTier, currentPeriodEnd!, now)
          : SQUARE_TIER_PRICE_CENTS[validatedTier];
      if (!(amountCents > 0)) {
        console.error(`[Billing] createSquareBillingSubscription computed a non-positive charge (${amountCents}) for organizer ${organizer.id}, mode ${mode} -- refusing to grant anything`);
        return res.status(500).json({ message: 'Failed to set up Square billing' });
      }
      // A period end that is already past on a Square-billed organizer is a period the daily job bills
      // under `renewal:<periodEndISO>`: share that exact key so the two paths are mutually exclusive.
      const pastDuePeriodEnd =
        mode === 'new_period' &&
        organizer.billingProcessor === 'square' &&
        !!currentPeriodEnd &&
        currentPeriodEnd.getTime() <= now.getTime();
      let periodKey =
        mode === 'upgrade'
          ? `upgrade:${currentTier}>${validatedTier}:${currentPeriodEnd!.toISOString()}`
          : pastDuePeriodEnd
            ? renewalPeriodKey(currentPeriodEnd!)
            : `subscribe:${currentPeriodEnd ? currentPeriodEnd.toISOString() : 'none'}:${utcDayKey(now)}`;
      if (mode === 'new_period') {
        // UTC-day edge (2026-09-29): the key above ends in today's UTC day. If an earlier attempt for
        // this organizer + tier was charged (COMPLETED) within the last 24h but the plan was never
        // activated (the period end is unchanged), a retry after UTC midnight would build a different
        // key and charge a second time. Reuse that earlier row's exact key instead: the claim below
        // then reports 'already_completed' and the grant is re-applied WITHOUT a new charge. The lookup
        // is TIER-BLIND (2026-09-30): a paid PRO whose activation failed, then a TEAMS request the same
        // day, must reuse the PRO row (and grant PRO) rather than charge TEAMS on top. The renewal key
        // has no UTC day in it, so it needs no lookup; it still runs so rows written under the older
        // `subscribe:<TIER>:...` key format are honoured during rollout. A lookup failure propagates
        // (500, nothing charged), the same fail-closed rule as the claim itself.
        const prior = await findRecentCompletedSubscribeCharge({
          organizerId: organizer.id,
          periodEndKey: currentPeriodEnd ? currentPeriodEnd.toISOString() : 'none',
          now,
        });
        if (prior) {
          console.warn(`[Billing] createSquareBillingSubscription found a recent COMPLETED-but-unactivated charge for organizer ${organizer.id} (${prior.periodKey}) -- re-applying it instead of charging a new period`);
          periodKey = prior.periodKey;
        }
      }

      const claim = await claimBillingCharge({
        organizerId: organizer.id,
        periodKey,
        kind,
        tier: validatedTier,
        amountCents,
      });
      if (claim.state === 'in_progress') {
        return res.status(409).json({
          code: 'PAYMENT_IN_PROGRESS',
          message: 'A payment for your subscription is already being processed. Please wait a moment and check your plan before trying again.',
        });
      }
      if (claim.state === 'already_completed') {
        // A previous attempt was charged (COMPLETED) but the plan was never activated, for example a
        // crash between the two writes. Re-apply the grant below WITHOUT charging again.
        paymentId = claim.paymentId ?? 'previously-completed';
        if (typeof claim.amountCents === 'number') amountCents = claim.amountCents;
        if ((claim.tier === 'PRO' || claim.tier === 'TEAMS') && claim.tier !== validatedTier) {
          grantTier = claim.tier;
          tierAdjusted = true;
          console.warn(`[Billing] createSquareBillingSubscription: period already PAID as ${claim.tier} for organizer ${organizer.id}, requested ${validatedTier} -- granting ${claim.tier}, no second charge`);
        }
        console.warn(`[Billing] createSquareBillingSubscription re-applying an already COMPLETED charge for organizer ${organizer.id} (period ${periodKey}) without a new charge`);
      } else {
        const charge = await chargeStoredCard({
          customerId: squareCustomerId,
          cardId: squareCardId,
          amountCents,
          idempotencyParts: ['org-subscribe', organizer.id, kind, validatedTier, periodKey, sourceId, String(amountCents)],
          note: mode === 'upgrade' ? `FindA.Sale upgrade to ${validatedTier} (prorated)` : `FindA.Sale ${validatedTier} subscription`,
          referenceId: organizer.id,
          requireCompleted: true,
        });
        if (!charge.ok) {
          const marked = await failBillingCharge(claim.id, charge.message);
          if (!marked) {
            return res.status(409).json({
              code: 'PAYMENT_IN_PROGRESS',
              message: 'A payment for your subscription is already being processed. Please wait a moment and check your plan before trying again.',
            });
          }
          console.warn(`[Billing] createSquareBillingSubscription charge declined for organizer ${organizer.id}: ${charge.message}`);
          return res.status(402).json({
            code: 'CARD_DECLINED',
            message: `Your payment was declined: ${charge.message}. You have not been charged and your plan has not changed. Please try a different card.`,
          });
        }
        paymentId = charge.paymentId;
        try {
          await completeBillingCharge(claim.id, charge.paymentId);
        } catch (ledgerErr) {
          // The money is taken: never fail the grant over a bookkeeping write. The row stays PENDING
          // and the Square payment id is in this log line for manual reconciliation.
          console.error(`[Billing] CRITICAL: payment ${charge.paymentId} COMPLETED for organizer ${organizer.id} but the ledger write failed:`, ledgerErr);
        }
      }
    }

    // ---- Grant. Only reached with a COMPLETED payment (charge modes) or an explicit trial. ----
    const trialEndsAt = mode === 'trial_start' ? addDaysUtc(now, ORGANIZER_TRIAL_DAYS) : null;
    const grantData: Record<string, unknown> = {
      subscriptionTier: grantTier,
      subscriptionStatus: mode === 'trial_start' || mode === 'trial_update' ? 'trialing' : 'active',
      billingProcessor: 'square',
      billingInterval: 'monthly',
      squareCustomerId,
      squareCardId,
      billingDunningFailCount: 0,
      billingNextRetryAt: null,
      billingGraceEndsAt: null,
      billingLastFailureReason: null,
      billingMigrationNoticeSentAt: null,
    };
    if (mode === 'trial_start') {
      grantData.billingCurrentPeriodEnd = trialEndsAt;
      grantData.trialEndsAt = trialEndsAt;
    } else if (mode === 'new_period') {
      grantData.billingCurrentPeriodEnd = addDaysUtc(now, BILLING_INTERVAL_DAYS);
      grantData.trialEndsAt = null;
    }
    // trial_update and upgrade never move billingCurrentPeriodEnd or trialEndsAt.
    if (currentTier !== grantTier) {
      grantData.tokenVersion = { increment: 1 }; // real tier change -- invalidate any stale tier claim in a live JWT
    }

    let updated;
    try {
      updated = await prisma.organizer.update({
        // Optimistic guard: only apply when the period end is still what this request read.
        where: { id: organizer.id, billingCurrentPeriodEnd: organizer.billingCurrentPeriodEnd ?? null },
        data: grantData,
        select: { subscriptionTier: true, subscriptionStatus: true, billingCurrentPeriodEnd: true, billingInterval: true },
      });
    } catch (grantErr) {
      if (isRecordNotFoundError(grantErr)) {
        console.error(`[Billing] createSquareBillingSubscription: organizer ${organizer.id} changed while this request ran${paymentId ? ` (payment ${paymentId} already COMPLETED)` : ''}`);
        return res.status(409).json({
          code: 'SUBSCRIPTION_CHANGED',
          message: paymentId
            ? 'Your subscription changed while your payment was processing. Your payment went through. Refresh this page to see your plan, and contact support if it does not show.'
            : 'Your subscription changed while this request was processing. Refresh this page and try again.',
        });
      }
      if (paymentId) {
        console.error(`[Billing] CRITICAL: payment ${paymentId} COMPLETED for organizer ${organizer.id} but activating the plan failed:`, grantErr);
        return res.status(500).json({
          code: 'ACTIVATION_PENDING',
          message: 'Your payment went through but we could not finish activating your plan. Please try again in a moment: you will not be charged twice.',
        });
      }
      throw grantErr;
    }

    const roleTrialEndsAt = mode === 'trial_start' ? trialEndsAt : mode === 'new_period' ? null : organizer.trialEndsAt ?? null;
    await prisma.userRoleSubscription.upsert({
      where: { userId_role: { userId: req.user.id, role: 'ORGANIZER' } },
      create: {
        userId: req.user.id,
        role: 'ORGANIZER',
        subscriptionTier: grantTier,
        subscriptionStatus: updated.subscriptionStatus,
        trialEndsAt: roleTrialEndsAt,
        tierLapsedAt: null,
        tierResumedAt: new Date(),
      },
      update: {
        subscriptionTier: grantTier,
        subscriptionStatus: updated.subscriptionStatus,
        trialEndsAt: roleTrialEndsAt,
        tierLapsedAt: null,
        tierResumedAt: new Date(),
      },
    });

    // 2026-09-29: restore anything the grace machinery locked. clearGracePeriod used to run only
    // from the Stripe webhook, so a Square re-subscribe left legacy GRACE_LOCKED items and
    // graceRemovedAt staff locked forever. Items come back for any paid tier; staff only come back
    // on TEAMS (D6, staff access requires the owner on TEAMS). Runs whether or not graceEndAt is
    // still set (finalizeGracePeriod clears it when it locks). Best-effort: a failure here must
    // never fail a subscription the organizer has already paid for.
    try {
      const restored = await clearGracePeriod(organizer.id, grantTier);
      if (restored && (restored.itemsRestored > 0 || restored.membersRestored > 0)) {
        console.log(`[Billing] Square subscribe restored ${restored.itemsRestored} locked item(s) and ${restored.membersRestored} staff member(s) for organizer ${organizer.id}`);
      }
    } catch (graceErr) {
      console.error(`[Billing] clearGracePeriod after Square subscribe failed for organizer ${organizer.id} (swallowed):`, graceErr);
    }

    res.json({
      tier: updated.subscriptionTier,
      status: updated.subscriptionStatus,
      currentPeriodEnd: updated.billingCurrentPeriodEnd,
      cancelAtPeriodEnd: false,
      priceId: null,
      billingInterval: updated.billingInterval,
      billingProcessor: 'square',
      trialEndsAt: mode === 'trial_start' ? trialEndsAt : organizer.trialEndsAt ?? null,
      chargedCents: amountCents,
      mode,
      ...(tierAdjusted
        ? {
            tierAdjusted: true,
            requestedTier: validatedTier,
            message: `Your ${grantTier} plan was already paid for this period, so it is now active and you were not charged again. To move to ${validatedTier}, upgrade from your subscription settings: you will only pay the prorated difference.`,
          }
        : {}),
    });
  } catch (error) {
    console.error('[Billing] createSquareBillingSubscription error:', error);
    res.status(500).json({ message: 'Failed to set up Square billing' });
  } finally {
    if (lockedOrganizerId) subscribeInFlight.delete(lockedOrganizerId);
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
 * Preview what changes when downgrading to SIMPLE.
 *
 * 2026-09-29 (Patrick D1/D2): describes the real behavior. The plan stays active until the current
 * billing period ends (`planEndsAt`), then paid automation (markdown CYCLES) pauses, free-tier
 * features keep working (including the free Day 2/3 sale markdowns and the Re-tag list), staff
 * access ends when TEAMS ends, and nothing is deleted or restored automatically. This used to
 * invent `graceEndDate = now + 7 days` and promise a 30-day restore; those fields are gone
 * (replaced by planEndsAt / planEndsAtIsEstimate / restoresAutomatically).
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
    const { periodEnd, isEstimate } = resolveCancellationPeriodEnd(organizer);
    const activeMarkdownCycles = await prisma.markdownCycle
      .count({ where: { organizerId: organizer.id, isActive: true } })
      .catch(() => 0);

    return res.json({
      currentTier: organizer.subscriptionTier,
      downgradingTo: 'SIMPLE',
      ...delta,
      // Staff only exist on TEAMS; a PRO organizer has no staff access to lose.
      teamMembersLosing: organizer.subscriptionTier === 'TEAMS' ? delta.teamMembersLosing : 0,
      planEndsAt: periodEnd.toISOString(),
      planEndsAtIsEstimate: isEstimate,
      alreadyScheduled: organizer.subscriptionStatus === 'scheduled_for_cancellation',
      activeMarkdownCycles,
      restoresAutomatically: false,
      upgradeUrl: '/organizer/subscription'
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

    // 2026-09-29: DB-only path (Square-billed, or frozen on the closed Stripe account). Schedules
    // the same cancel-at-period-end as POST /billing/cancel and does NOT start a grace period:
    // under D1/D2 the plan stays fully active until the period ends and nothing is locked.
    // (The Stripe branch below used to set graceEndAt first and then 500 on the closed account,
    // leaving a grace marker behind with no cancellation scheduled.)
    if (STRIPE_PLATFORM_CLOSED || organizer.billingProcessor === 'square') {
      if (!isPaidTierValue(organizer.subscriptionTier)) {
        return res.status(400).json({ message: 'No active subscription to downgrade' });
      }
      const { periodEnd } = await scheduleCancellationFromDb(organizer);
      return res.json({
        success: true,
        message: `Downgrade scheduled. Your ${organizer.subscriptionTier} plan stays active until ${periodEnd.toISOString().slice(0, 10)}.`,
        planEndsAt: periodEnd.toISOString(),
      });
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
