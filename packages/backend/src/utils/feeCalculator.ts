/**
 * Platform fee calculation utilities
 * Tier-aware fee rates (as of S388):
 * - SIMPLE: 10%
 * - PRO: 8%
 * - TEAMS: 8%
 */

export type SubscriptionTier = 'SIMPLE' | 'PRO' | 'TEAMS' | null;

/**
 * Get platform fee rate based on subscription tier
 * @param tier The organizer's subscription tier (or null defaults to SIMPLE)
 * @returns Fee rate as decimal (0.10 for SIMPLE, 0.08 for PRO/TEAMS)
 */
export const getPlatformFeeRate = (tier: SubscriptionTier): number => {
  if (!tier || tier === 'SIMPLE') {
    return 0.10; // 10% for SIMPLE and null (defaults)
  }
  if (tier === 'PRO' || tier === 'TEAMS') {
    return 0.08; // 8% for PRO and TEAMS
  }
  return 0.10; // Safe default
};

/**
 * Format fee rate as percentage string for display
 * @param tier The organizer's subscription tier
 * @returns Percentage string (e.g., "10%" or "8%")
 */
export const formatFeeRate = (tier: SubscriptionTier): string => {
  const rate = getPlatformFeeRate(tier);
  return `${Math.round(rate * 100)}%`;
};
