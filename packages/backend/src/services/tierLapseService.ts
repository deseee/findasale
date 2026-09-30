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
      // 2026-09-29 (Patrick D2): a Square-billed organizer's lifecycle belongs to
      // jobs/squareBillingChargeJob.ts, which reads the Organizer row (billingCurrentPeriodEnd,
      // dunning fail count, billingGraceEndsAt) and only downgrades when paid time is really
      // over. This scan reads the UserRoleSubscription mirror, so it used to lapse an organizer
      // whose card had just failed (status 'past_due', still inside the 7-day dunning window) or
      // whose trial ended a few hours before the next 01:00 UTC charge run, flagging them as
      // lapsed while they still had paid access. Square-billed organizers are excluded here;
      // organizers with no Square billing keep the existing behavior.
      NOT: { user: { organizer: { billingProcessor: 'square' } } },
    },
    include: {
      user: true,
    },
  });

  return subscriptions;
}

/**
 * Real entitlement of an organizer, computed from the Organizer row (the same row the backend
 * tier gate requireTier and the billing scheduler read), NOT from the UserRoleSubscription
 * lapse mirror. Patrick D2: PRO/TEAMS features stay available until the subscription actually
 * runs out.
 *
 * Returns `entitlementEndsAt`, the moment paid access ends, or null when the organizer has no
 * paid time left (SIMPLE tier, finished trial, dunning window over, no known end date):
 *   - past_due (dunning, payment failed): billingGraceEndsAt, while it is in the future.
 *   - active / trialing / scheduled_for_cancellation: the later of billingCurrentPeriodEnd and
 *     (for trialing) trialEndsAt, while in the future.
 * `inDunning` is true for a paid organizer whose last payment failed and who is still inside
 * the retry window. Exposed through GET /billing/subscription for the frontend tier hook.
 */
export function computeOrganizerEntitlement(
  organizer: {
    subscriptionTier?: string | null;
    subscriptionStatus?: string | null;
    billingCurrentPeriodEnd?: Date | string | null;
    billingGraceEndsAt?: Date | string | null;
    trialEndsAt?: Date | string | null;
  },
  now: Date = new Date()
): { entitlementEndsAt: Date | null; inDunning: boolean } {
  const tier = organizer.subscriptionTier;
  if (tier !== 'PRO' && tier !== 'TEAMS') {
    return { entitlementEndsAt: null, inDunning: false };
  }
  const toDate = (v: Date | string | null | undefined): Date | null => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const future = (d: Date | null): Date | null => (d && d.getTime() > now.getTime() ? d : null);
  const status = organizer.subscriptionStatus ?? null;

  if (status === 'past_due') {
    const graceEnd = future(toDate(organizer.billingGraceEndsAt));
    return { entitlementEndsAt: graceEnd, inDunning: graceEnd !== null };
  }

  if (status === 'active' || status === 'trialing' || status === 'scheduled_for_cancellation') {
    const candidates: Date[] = [];
    const periodEnd = future(toDate(organizer.billingCurrentPeriodEnd));
    if (periodEnd) candidates.push(periodEnd);
    if (status === 'trialing') {
      const trialEnd = future(toDate(organizer.trialEndsAt));
      if (trialEnd) candidates.push(trialEnd);
    }
    if (candidates.length === 0) return { entitlementEndsAt: null, inDunning: false };
    const latest = candidates.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
    return { entitlementEndsAt: latest, inDunning: false };
  }

  return { entitlementEndsAt: null, inDunning: false };
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
 * Applies grace period: only downgrade if failure/lapse was at least TIER_GRACE_DAYS ago
 * (Also mark for notification email)
 */
export async function processBatchTierLapses() {
  const lapsed = await getLapsedSubscriptions();

  // Grace period: wait N days before downgrading (default 7)
  const GRACE_DAYS = parseInt(process.env.TIER_GRACE_DAYS || '7', 10);
  const gracePeriodMs = GRACE_DAYS * 24 * 60 * 60 * 1000;
  const now = new Date();

  const results: Array<{
    status: 'grace_active' | 'success' | 'error';
    subscriptionId: string;
    userId: string;
    email: string;
    organizerName?: string | null;
    daysRemaining?: number;
    tier?: string;
    previousTier?: string;
    error?: string;
  }> = [];
  for (const sub of lapsed) {
    try {
      // Check if grace period has elapsed
      // tierLapseWarning is set when we first detect the lapse, so use that timestamp
      const lapsedAt = sub.tierLapseWarning || sub.trialEndsAt || new Date();
      const timeSinceLapse = now.getTime() - new Date(lapsedAt).getTime();

      if (timeSinceLapse < gracePeriodMs) {
        // Grace period still active — skip downgrade for now
        console.log(
          `[tierLapse] Grace period active for ${sub.user.email}: ${Math.ceil((gracePeriodMs - timeSinceLapse) / (24 * 60 * 60 * 1000))} days remaining`
        );
        results.push({
          status: 'grace_active',
          subscriptionId: sub.id,
          userId: sub.userId,
          email: sub.user.email,
          organizerName: sub.user.name,
          daysRemaining: Math.ceil((gracePeriodMs - timeSinceLapse) / (24 * 60 * 60 * 1000)),
        });
        continue;
      }

      // Grace period expired — proceed with downgrade. Capture the PRE-lapse tier
      // before calling processTierLapse(), which immediately overwrites
      // subscriptionTier to 'SIMPLE' -- the caller needs to tell the organizer what
      // they're losing, not just what they're on now.
      const previousTier = sub.subscriptionTier;
      const updated = await processTierLapse(sub.id);
      results.push({
        status: 'success',
        subscriptionId: sub.id,
        userId: sub.userId,
        email: sub.user.email,
        // Notification-gap fix (S1195 sweep continuation, 2026-08-08): the caller
        // (jobs/tierLapseJob.ts processBatchTierLapsesJob) previously only console.log'd
        // this success result -- the organizer whose tier just actually lapsed (as opposed
        // to the "expires in N days" pre-warning already sent by queueTierLapseWarningsJob)
        // was never told. organizerName is threaded through here so that job can send a
        // "your subscription has lapsed" email in the same rich-template style as
        // sendTierLapseWarningEmail, instead of a generic "Hi there".
        organizerName: sub.user.name,
        previousTier,
        tier: updated.subscriptionTier,
      });
    } catch (error) {
      results.push({
        status: 'error',
        subscriptionId: sub.id,
        userId: sub.userId,
        email: sub.user.email,
        organizerName: sub.user.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}
