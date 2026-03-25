import { prisma } from '../lib/prisma';

/**
 * Feature #72 Phase 2 + Feature #75: Tier Lapse Service
 * Handles:
 * - Detecting subscription tier lapses (trial expiry, past_due, canceled)
 * - Sending tier-lapse warning emails
 * - Downgrading tiers to SIMPLE fallback
 * - Recording lapse and resumption timestamps
 */

/**
 * Get all ORGANIZER subscriptions approaching expiry
 * Returns subscriptions where trialEndsAt is within the next N days
 */
export async function getApproachingLapseSubscriptions(daysAhead: number = 7) {
  const warningThreshold = new Date();
  warningThreshold.setDate(warningThreshold.getDate() + daysAhead);

  const subscriptions = await prisma.userRoleSubscription.findMany({
    where: {
      role: 'ORGANIZER',
      trialEndsAt: {
        lte: warningThreshold,
        gte: new Date(), // Only future dates
      },
      subscriptionStatus: 'trialing',
      tierLapseWarning: null, // Only those not yet warned
    },
    include: {
      user: true,
    },
  });

  return subscriptions;
}

/**
 * Get all ORGANIZER subscriptions that have lapsed
 * Returns subscriptions where trial has ended, subscription is past_due or canceled
 */
export async function getLapsedSubscriptions() {
  const now = new Date();

  const subscriptions = await prisma.userRoleSubscription.findMany({
    where: {
      role: 'ORGANIZER',
      OR: [
        {
          // Trial has ended
          subscriptionStatus: 'trialing',
          trialEndsAt: {
            lt: now,
          },
        },
        {
          // Subscription is past_due or canceled
          subscriptionStatus: {
            in: ['past_due', 'canceled'],
          },
        },
      ],
      tierLapsedAt: null, // Only those not yet marked as lapsed
    },
    include: {
      user: true,
    },
  });

  return subscriptions;
}

/**
 * Mark a subscription as having received a lapse warning
 * Called after sending warning email
 */
export async function markTierLapseWarning(subscriptionId: string) {
  const warningDate = new Date();

  const updated = await prisma.userRoleSubscription.update({
    where: { id: subscriptionId },
    data: {
      tierLapseWarning: warningDate,
    },
    include: { user: true },
  });

  return updated;
}

/**
 * Mark a subscription as lapsed and downgrade to SIMPLE
 * Called when trial/subscription actually expires
 */
export async function processTierLapse(subscriptionId: string) {
  const now = new Date();

  const updated = await prisma.userRoleSubscription.update({
    where: { id: subscriptionId },
    data: {
      subscriptionTier: 'SIMPLE', // Fallback to free tier
      tierLapsedAt: now,
      subscriptionStatus: null, // Clear stripe status
    },
    include: { user: true },
  });

  return updated;
}

/**
 * Mark a subscription as resumed (user reactivated after lapse)
 */
export async function recordTierResumption(subscriptionId: string) {
  const now = new Date();

  const updated = await prisma.userRoleSubscription.update({
    where: { id: subscriptionId },
    data: {
      tierResumedAt: now,
      tierLapseWarning: null, // Clear warning flag for future lapse detection
    },
    include: { user: true },
  });

  return updated;
}

/**
 * Get subscription stats for an organizer
 * Returns tier, status, and lapse timeline
 */
export async function getSubscriptionStats(userId: string) {
  const subscription = await prisma.userRoleSubscription.findFirst({
    where: {
      userId,
      role: 'ORGANIZER',
    },
    include: { user: true },
  });

  if (!subscription) {
    return null;
  }

  return {
    subscriptionId: subscription.id,
    userId: subscription.userId,
    tier: subscription.subscriptionTier,
    status: subscription.subscriptionStatus,
    trialEndsAt: subscription.trialEndsAt,
    tierLapseWarning: subscription.tierLapseWarning,
    tierLapsedAt: subscription.tierLapsedAt,
    tierResumedAt: subscription.tierResumedAt,
  };
}

/**
 * Batch process: Check all approaching lapses and queue warning emails
 * (Integration with email service required at call site)
 */
export async function queueTierLapseWarnings() {
  const approaching = await getApproachingLapseSubscriptions(7);

  return approaching.map((sub) => ({
    subscriptionId: sub.id,
    userId: sub.userId,
    email: sub.user.email,
    organizerName: sub.user.name,
    tier: sub.subscriptionTier,
    trialEndsAt: sub.trialEndsAt,
  }));
}

/**
 * Batch process: Check all lapsed subscriptions and downgrade to SIMPLE
 * (Also mark for notification email)
 */
export async function processBatchTierLapses() {
  const lapsed = await getLapsedSubscriptions();

  const results = [];
  for (const sub of lapsed) {
    try {
      const updated = await processTierLapse(sub.id);
      results.push({
        status: 'success',
        subscriptionId: sub.id,
        userId: sub.userId,
        email: sub.user.email,
        tier: updated.subscriptionTier,
      });
    } catch (error) {
      results.push({
        status: 'error',
        subscriptionId: sub.id,
        userId: sub.userId,
        email: sub.user.email,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}
