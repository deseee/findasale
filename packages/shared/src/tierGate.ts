// Feature #65: Organizer Mode Tiers — feature gating and access control

export type SubscriptionTier = 'SIMPLE' | 'PRO' | 'TEAMS';

export const TIER_RANK: Record<SubscriptionTier, number> = {
  SIMPLE: 0,
  PRO: 1,
  TEAMS: 2,
};

/**
 * Check if an organizer's subscription tier has access to a required tier feature.
 * A tier has access if its rank >= the required tier's rank.
 */
export function hasAccess(organizerTier: SubscriptionTier, requiredTier: SubscriptionTier): boolean {
  return TIER_RANK[organizerTier] >= TIER_RANK[requiredTier];
}

/**
 * Map of feature names to their minimum required subscription tier.
 * Used by middleware and feature gates to enforce tier requirements.
 */
export const FEATURE_TIERS: Record<string, SubscriptionTier> = {
  // SIMPLE tier features (default, free)
  // All shoppers + organizers have access to:
  // - basic sale listings
  // - item upload (up to 100 items per sale)
  // - basic organizer profile

  // PRO features ($29/month or $290/year)
  batchOperations: 'PRO',
  analytics: 'PRO',
  exports: 'PRO',
  brandKit: 'PRO',
  couponsUnlimited: 'PRO',
  flashDeals: 'PRO',

  // TEAMS features (enterprise tier, Q4 2026)
  apiAccess: 'TEAMS',
  webhooks: 'TEAMS',
  multiUser: 'TEAMS',
  bulkImport: 'TEAMS',
  commandCenter: 'TEAMS',
};
