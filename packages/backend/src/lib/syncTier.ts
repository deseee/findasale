import { SubscriptionTier } from '@prisma/client';
import { prisma } from './prisma';
import { createNotification } from './notificationService';

/**
 * One-time "auto-markdown cycles paused" notice (2026-09-29, Patrick D1), sent when an organizer
 * drops from PRO/TEAMS to SIMPLE. Paid automation (MarkdownCycle rows and their marketplace price
 * pushes) pauses; nothing is deleted, restored or repriced. The free Day-2/Day-3 sale markdown
 * (Sale.markdownEnabled) is NOT paused, so it is not what triggers this notice: it only fires when
 * the organizer has at least one ACTIVE MarkdownCycle.
 *
 * Best-effort by design: every error is swallowed and logged, this function never throws, and it
 * must never block or fail a downgrade. Delivery goes through createNotification, which already
 * refuses to email the finda.sale domain zone and suppressed addresses (in-app notice is still
 * created). Shared by syncTier below and squareBillingChargeJob.downgradeOrganizerToSimple.
 */
export async function notifyAutoMarkdownsPaused(organizerId: string): Promise<void> {
  try {
    const activeCycles = await prisma.markdownCycle.count({
      where: { organizerId, isActive: true },
    });
    if (activeCycles === 0) return;

    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: { userId: true },
    });
    if (!organizer?.userId) return;

    // Items currently discounted by a cycle step (markdownStepIndexApplied is only ever set by the cycle cron).
    const discountedItems = await prisma.item.count({
      where: {
        organizerId,
        markdownApplied: true,
        markdownStepIndexApplied: { not: null },
        status: { in: ['AVAILABLE', 'RESERVED'] },
        deletedAt: null,
      },
    });

    const cycleWord = activeCycles === 1 ? 'cycle is' : 'cycles are';
    const itemPhrase =
      discountedItems === 0
        ? 'No items are discounted by a cycle right now.'
        : `${discountedItems} item${discountedItems === 1 ? ' is' : 's are'} currently discounted by your cycles and will stay at ${discountedItems === 1 ? 'its' : 'their'} current price${discountedItems === 1 ? '' : 's'}.`;

    await createNotification({
      userId: organizer.userId,
      type: 'AUTO_MARKDOWNS_PAUSED',
      title: 'Your automatic markdown cycles are paused',
      body:
        `Your account is no longer on a PRO or TEAMS plan, so your ${activeCycles} automatic markdown ${cycleWord} paused. ` +
        `Cycles will not lower prices or update your marketplace listings until you upgrade again. ` +
        `${itemPhrase} Nothing is changed or restored automatically, and your cycle settings are kept. ` +
        `The standard Day 2 and Day 3 sale markdowns are free and keep running.`,
      link: '/organizer/subscription',
      channel: 'OPERATIONAL',
      sendEmail: true,
      emailSubject: 'Your automatic markdown cycles are paused',
    });
  } catch (err) {
    console.error(`[syncTier] notifyAutoMarkdownsPaused failed for organizer ${organizerId} (swallowed):`, err);
  }
}

/**
 * Sync organizer subscription tier from Stripe webhook event
 * Maps Stripe priceId → SubscriptionTier, updates Organizer in DB
 */
export async function syncTier(
  organizerId: string,
  status: string,
  priceId: string | null,
  stripeSubscriptionId?: string | null
): Promise<void> {
  try {
    // Map price ID to tier
    const tier = getTierFromPriceId(priceId);

    // Remember the tier we are leaving so a real PRO/TEAMS -> SIMPLE drop can send the one-time
    // "auto-markdown cycles paused" notice below (never for a repeat webhook on an already-SIMPLE organizer).
    let previousTier: string | null = null;
    try {
      const before = await prisma.organizer.findUnique({
        where: { id: organizerId },
        select: { subscriptionTier: true },
      });
      previousTier = before?.subscriptionTier ?? null;
    } catch (lookupErr) {
      console.warn(`[syncTier] could not read previous tier for organizer ${organizerId}:`, lookupErr);
    }

    // Determine subscription status
    const subscriptionStatus = status === 'canceled' ? 'canceled' : status;

    // Build update — include stripeSubscriptionId only when explicitly passed
    const updateData: {
      subscriptionTier: SubscriptionTier;
      subscriptionStatus: string;
      stripeSubscriptionId?: string | null;
    } = { subscriptionTier: tier, subscriptionStatus };

    if (stripeSubscriptionId !== undefined) {
      // null clears it (on cancel), string sets it (on create/update)
      updateData.stripeSubscriptionId = stripeSubscriptionId;
    }

    // Update organizer subscription tier and status
    await prisma.organizer.update({
      where: { id: organizerId },
      data: updateData,
    });

    // Increment tokenVersion to invalidate stale tier JWTs
    await prisma.organizer.update({
      where: { id: organizerId },
      data: { tokenVersion: { increment: 1 } },
    });

    console.log(`[syncTier] Updated organizer ${organizerId} to tier ${tier} with status ${subscriptionStatus} and incremented tokenVersion`);

    // Best-effort, not awaited: must never delay or fail the webhook. notifyAutoMarkdownsPaused never throws.
    if (tier === 'SIMPLE' && (previousTier === 'PRO' || previousTier === 'TEAMS')) {
      void notifyAutoMarkdownsPaused(organizerId);
    }
  } catch (error) {
    console.error(`[syncTier] Error updating organizer ${organizerId}:`, error);
    // Don't throw — let webhook handler deal with it
  }
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
