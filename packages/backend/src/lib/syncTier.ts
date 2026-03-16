import { prisma } from './prisma';

/**
 * Sync organizer subscription tier from Stripe webhook event
 * Maps Stripe priceId → SubscriptionTier, updates Organizer in DB
 */
export async function syncTier(
  organizerId: string,
  status: string,
  priceId: string | null
): Promise<void> {
  try {
    // Map price ID to tier
    const tier = getTierFromPriceId(priceId);

    // Determine subscription status
    const subscriptionStatus = status === 'canceled' ? 'canceled' : status;

    // Update organizer
    await prisma.organizer.update({
      where: { id: organizerId },
      data: {
        subscriptionTier: tier,
        subscriptionStatus,
        subscriptionEndsAt: status === 'canceled' ? new Date() : null,
      },
    });

    console.log(`[syncTier] Updated organizer ${organizerId} to tier ${tier} with status ${subscriptionStatus}`);
  } catch (error) {
    console.error(`[syncTier] Error updating organizer ${organizerId}:`, error);
    // Don't throw — let webhook handler deal with it
  }
}

/**
 * Helper: Map Stripe price ID to tier (PRO, TEAMS, or SIMPLE)
 */
function getTierFromPriceId(priceId: string | null): string {
  if (!priceId) return 'SIMPLE';

  const proMonthly = process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
  const proAnnual = process.env.STRIPE_PRO_ANNUAL_PRICE_ID;
  const teamsMonthly = process.env.STRIPE_TEAMS_MONTHLY_PRICE_ID;
  const teamsAnnual = process.env.STRIPE_TEAMS_ANNUAL_PRICE_ID;

  if (priceId === proMonthly || priceId === proAnnual) return 'PRO';
  if (priceId === teamsMonthly || priceId === teamsAnnual) return 'TEAMS';
  return 'SIMPLE';
}
