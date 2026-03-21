/**
 * Tier Enforcement Helpers
 * Feature #75: Tier Lapse State Logic
 *
 * Helpers to check if organizers are over tier limits for items/photos/AI tags
 */

import { prisma } from './prisma';
import { SubscriptionTier, getTierLimit } from '../constants/tierLimits';

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
    where: { saleId }
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
  const photoCount = await prisma.itemPhoto.count({
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
