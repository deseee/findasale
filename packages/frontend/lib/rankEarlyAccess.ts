/**
 * Rank-Based Early Access Utility Functions (Frontend)
 * Handles unlock time calculations and formatting for presale sales
 */

export type ExplorerRank = 'INITIATE' | 'SCOUT' | 'RANGER' | 'SAGE' | 'GRANDMASTER';

const RANK_EARLY_ACCESS_HOURS: Record<ExplorerRank, number> = {
  INITIATE: 0,
  SCOUT: 1,
  RANGER: 2,
  SAGE: 4,
  GRANDMASTER: 6,
};

/**
 * Calculate minutes until a sale unlocks for a given user.
 * Returns 0 if sale is already unlocked.
 *
 * @param publishedAt - The sale's publishedAt timestamp (ISO string or Date)
 * @param userRank - The user's explorer rank
 * @param now - Current time (defaults to now)
 * @returns Minutes until unlock (0 if already unlocked)
 */
export function getMinutesUntilUnlock(
  publishedAt: string | Date | null,
  userRank: ExplorerRank = 'INITIATE',
  now: Date = new Date()
): number {
  if (!publishedAt) {
    return 0;
  }

  const publishedTime = typeof publishedAt === 'string' ? new Date(publishedAt) : publishedAt;
  const hoursEarly = RANK_EARLY_ACCESS_HOURS[userRank] || 0;
  const effectiveTime = new Date(publishedTime.getTime() - hoursEarly * 60 * 60 * 1000);

  if (now >= effectiveTime) {
    return 0;
  }

  const msUntilUnlock = effectiveTime.getTime() - now.getTime();
  return Math.ceil(msUntilUnlock / (1000 * 60)); // Round up to nearest minute
}

/**
 * Format a human-readable unlock time (e.g., "2h 30m", "45m", "1h").
 *
 * @param minutes - Minutes until unlock
 * @returns Formatted string
 */
export function formatUnlockTime(minutes: number): string {
  if (minutes <= 0) return 'Now';
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Determine if a sale is locked for a given user.
 *
 * @param publishedAt - The sale's publishedAt timestamp
 * @param userRank - The user's explorer rank
 * @param now - Current time (defaults to now)
 * @returns true if the sale is locked for this user
 */
export function isSaleLocked(
  publishedAt: string | Date | null,
  userRank: ExplorerRank = 'INITIATE',
  now: Date = new Date()
): boolean {
  return getMinutesUntilUnlock(publishedAt, userRank, now) > 0;
}

/**
 * Get the effective unlock time for a user given a sale's publishedAt.
 *
 * @param publishedAt - The sale's publishedAt timestamp
 * @param userRank - The user's explorer rank
 * @returns The Date when this user can access the sale
 */
export function getEffectiveUnlockTime(
  publishedAt: string | Date | null,
  userRank: ExplorerRank = 'INITIATE'
): Date | null {
  if (!publishedAt) {
    return null;
  }

  const publishedTime = typeof publishedAt === 'string' ? new Date(publishedAt) : publishedAt;
  const hoursEarly = RANK_EARLY_ACCESS_HOURS[userRank] || 0;
  return new Date(publishedTime.getTime() - hoursEarly * 60 * 60 * 1000);
}
