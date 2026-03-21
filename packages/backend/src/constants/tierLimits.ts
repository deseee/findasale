/**
 * Tier Limits Configuration
 * Feature #75: Tier Lapse State Logic
 *
 * Defines resource limits for each subscription tier (SIMPLE, PRO, TEAMS)
 */

export type SubscriptionTier = 'SIMPLE' | 'PRO' | 'TEAMS';

export const TIER_LIMITS: Record<SubscriptionTier, {
  itemsPerSale: number;
  photosPerItem: number;
  aiTagsPerMonth: number;
  batchOpsAllowed: boolean;
  multiUserAllowed: boolean;
}> = {
  SIMPLE: {
    itemsPerSale: 200,
    photosPerItem: 5,
    aiTagsPerMonth: 100,
    batchOpsAllowed: false,
    multiUserAllowed: false,
  },
  PRO: {
    itemsPerSale: 500,
    photosPerItem: 10,
    aiTagsPerMonth: 2000,
    batchOpsAllowed: true,
    multiUserAllowed: false,
  },
  TEAMS: {
    itemsPerSale: 2000,
    photosPerItem: Infinity,
    aiTagsPerMonth: Infinity,
    batchOpsAllowed: true,
    multiUserAllowed: true,
  },
};

/**
 * Get the limit for a given tier and resource type
 */
export function getTierLimit(
  tier: SubscriptionTier,
  resource: keyof typeof TIER_LIMITS[SubscriptionTier]
): number {
  return TIER_LIMITS[tier][resource] as number;
}
