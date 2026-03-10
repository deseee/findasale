import { prisma } from '../lib/prisma';

export type OrganizerTier = 'BRONZE' | 'SILVER' | 'GOLD';

interface TierBenefits {
  feePct: number;
  auctionFeePct: number;
  label: string;
  perks: string[];
}

/**
 * Tier thresholds and benefits:
 * - BRONZE: 1+ completed sales | 10% platform fee (flat)
 * - SILVER: 5+ completed sales OR 50+ items sold | 10% platform fee (flat)
 * - GOLD: 15+ completed sales OR 200+ items sold | 10% platform fee (flat)
 */

export async function calculateOrganizerTier(organizerId: string): Promise<OrganizerTier> {
  // Count completed (ENDED) sales
  const endedSalesCount = await prisma.sale.count({
    where: { organizerId, status: 'ENDED' },
  });

  // Count total sold items across all organizer's sales
  // Items are marked SOLD when they have a Purchase record with status PAID
  const soldItemsCount = await prisma.item.count({
    where: {
      sale: { organizerId },
      purchases: {
        some: { status: 'PAID' },
      },
    },
  });

  // Determine highest tier the organizer qualifies for
  if (endedSalesCount >= 15 || soldItemsCount >= 200) {
    return 'GOLD';
  } else if (endedSalesCount >= 5 || soldItemsCount >= 50) {
    return 'SILVER';
  } else if (endedSalesCount >= 1) {
    return 'BRONZE';
  }
  // Default to BRONZE if no completed sales yet
  return 'BRONZE';
}

export async function syncOrganizerTier(organizerId: string): Promise<void> {
  const newTier = await calculateOrganizerTier(organizerId);
  const now = new Date();

  await prisma.organizer.update({
    where: { id: organizerId },
    data: {
      tier: newTier,
      tierUpdatedAt: now,
    },
  });
}

export function getTierBenefits(tier: OrganizerTier): TierBenefits {
  const benefits: Record<OrganizerTier, TierBenefits> = {
    BRONZE: {
      feePct: 10.0,
      auctionFeePct: 10.0,
      label: 'Verified Organizer',
      perks: [
        'Verified Organizer badge on all listings',
        'Standard platform fee (10% flat)',
        'Basic organizer profile page',
      ],
    },
    SILVER: {
      feePct: 10.0,
      auctionFeePct: 10.0,
      label: 'Silver Organizer',
      perks: [
        'Silver Organizer badge on all listings',
        'Priority placement in search results',
        'Standard platform fee (10% flat)',
        'Enhanced organizer profile page',
        'Access to advanced analytics',
      ],
    },
    GOLD: {
      feePct: 10.0,
      auctionFeePct: 10.0,
      label: 'Gold Organizer',
      perks: [
        'Gold Organizer badge on all listings',
        'Featured on homepage',
        'Standard platform fee (10% flat)',
        'Premium organizer profile page',
        'Early access to new features',
        'Dedicated seller support',
      ],
    },
  };

  return benefits[tier];
}

/**
 * Get progress info toward next tier
 * Returns: { currentTier, nextTier, salesNeeded, itemsNeeded }
 */
export async function getTierProgress(organizerId: string): Promise<{
  currentTier: OrganizerTier;
  nextTier: OrganizerTier | null;
  completedSales: number;
  soldItems: number;
  salesNeeded: number;
  itemsNeeded: number;
}> {
  const endedSalesCount = await prisma.sale.count({
    where: { organizerId, status: 'ENDED' },
  });

  const soldItemsCount = await prisma.item.count({
    where: {
      sale: { organizerId },
      purchases: {
        some: { status: 'PAID' },
      },
    },
  });

  const currentTier = await calculateOrganizerTier(organizerId);

  let nextTier: OrganizerTier | null = null;
  let salesNeeded = 0;
  let itemsNeeded = 0;

  if (currentTier === 'BRONZE') {
    nextTier = 'SILVER';
    salesNeeded = Math.max(0, 5 - endedSalesCount);
    itemsNeeded = Math.max(0, 50 - soldItemsCount);
  } else if (currentTier === 'SILVER') {
    nextTier = 'GOLD';
    salesNeeded = Math.max(0, 15 - endedSalesCount);
    itemsNeeded = Math.max(0, 200 - soldItemsCount);
  }

  return {
    currentTier,
    nextTier,
    completedSales: endedSalesCount,
    soldItems: soldItemsCount,
    salesNeeded,
    itemsNeeded,
  };
}
