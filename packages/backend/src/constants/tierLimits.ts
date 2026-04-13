/**
 * Tier Limits Configuration
 * Feature #75: Tier Lapse State Logic
 *
 * Defines resource limits for each subscription tier (SIMPLE, PRO, TEAMS)
 */

export type SubscriptionTier = 'SIMPLE' | 'PRO' | 'TEAMS' | 'ENTERPRISE';

export const TIER_LIMITS: Record<SubscriptionTier, {
  itemsPerSale: number;
  photosPerItem: number;
  aiTagsPerMonth: number;
  batchOpsAllowed: boolean;
  multiUserAllowed: boolean;
  maxConcurrentSales: number;
  maxTeamMembers: number;
}> = {
  SIMPLE: {
    itemsPerSale: 200,
    photosPerItem: 5,
    aiTagsPerMonth: 100,
    batchOpsAllowed: true,
    multiUserAllowed: false,
    maxConcurrentSales: 1,
    maxTeamMembers: 0,
  },
  PRO: {
    itemsPerSale: 500,
    photosPerItem: 10,
    aiTagsPerMonth: 2000,
    batchOpsAllowed: true,
    multiUserAllowed: false,
    maxConcurrentSales: 3,
    maxTeamMembers: 0,
  },
  TEAMS: {
    itemsPerSale: 2000,
    photosPerItem: Infinity,
    aiTagsPerMonth: Infinity,
    batchOpsAllowed: true,
    multiUserAllowed: true,
    maxConcurrentSales: Number.MAX_SAFE_INTEGER,
    maxTeamMembers: 5,
  },
  ENTERPRISE: {
    itemsPerSale: Number.MAX_SAFE_INTEGER,
    photosPerItem: Infinity,
    aiTagsPerMonth: Infinity,
    batchOpsAllowed: true,
    multiUserAllowed: true,
    maxConcurrentSales: Number.MAX_SAFE_INTEGER,
    maxTeamMembers: Number.MAX_SAFE_INTEGER,
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
