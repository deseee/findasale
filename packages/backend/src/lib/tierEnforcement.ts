/**
 * Tier Enforcement Helpers
 * Feature #75: Tier Lapse State Logic
 *
 * Helpers to check if organizers are over tier limits for items/photos/AI tags
 */

import { prisma } from './prisma';
import { SubscriptionTier, getTierLimit } from '../constants/tierLimits';
import { getSaleAiTagAllowance } from './aiTagsQuotaTracker';

/**
 * Check if a sale exceeds the organizer's item limit for their tier
 */
export async function checkSaleOverLimit(
  saleId: string,
  tier: SubscriptionTier
): Promise<{
  isOverLimit: boolean;
  itemCount: number;
  limit: number;
  message?: string;
}> {
  const itemCount = await prisma.item.count({
    where: { saleId, listingType: { not: 'CONSIGNOR_TAG' } } // price tags do not use up the item limit
  });

  const limit = getTierLimit(tier, 'itemsPerSale');

  return {
    isOverLimit: itemCount > limit,
    itemCount,
    limit,
    message: itemCount > limit
      ? `Sale has ${itemCount} items (limit: ${limit})`
      : undefined,
  };
}

/**
 * Check if an item exceeds the organizer's photo limit for their tier
 */
export async function checkItemOverPhotoLimit(
  itemId: string,
  tier: SubscriptionTier
): Promise<{
  isOverLimit: boolean;
  photoCount: number;
  limit: number;
  message?: string;
}> {
  const photoCount = await prisma.photo.count({
    where: { itemId }
  });

  const limit = getTierLimit(tier, 'photosPerItem');

  return {
    isOverLimit: photoCount >= limit,
    photoCount,
    limit,
    message: photoCount >= limit
      ? `Item has ${photoCount} photos (limit: ${limit})`
      : undefined,
  };
}

/**
 * Check if an organizer exceeds their AI tag limit for this calendar month
 */
export async function checkAITagLimit(
  organizerId: string,
  tier: SubscriptionTier,
  saleId?: string | null
): Promise<{
  isOverLimit: boolean;
  tagCount: number;
  limit: number;
  message?: string;
}> {
  // A paid $9.99 a-la-carte sale with tags left in its own 500 (lib/saleProFeatures.ts) is never over the limit for
  // its own items. Only that sale: any other saleId falls through to the monthly count below.
  if (saleId) {
    const saleAllowance = await getSaleAiTagAllowance(organizerId, saleId);
    if (saleAllowance && saleAllowance.remaining > 0) {
      return { isOverLimit: false, tagCount: saleAllowance.used, limit: saleAllowance.limit };
    }
  }

  // Count items tagged with AI this calendar month. Items of paid a-la-carte sales are metered by their sale's own
  // allowance, so they do not use up the monthly allowance of the organizer's other sales.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const tagCount = await prisma.item.count({
    where: {
      sale: {
        organizerId,
        NOT: { purchaseModel: 'ALA_CARTE', alaCarteFeePaid: true },
      },
      isAiTagged: true,
      createdAt: {
        gte: monthStart
      }
    }
  });

  const limit = getTierLimit(tier, 'aiTagsPerMonth');

  return {
    isOverLimit: tagCount >= limit,
    tagCount,
    limit,
    message: tagCount >= limit
      ? `Used ${tagCount} smart tags this month (limit: ${limit})`
      : undefined,
  };
}
