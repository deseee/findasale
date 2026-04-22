/**
 * Rank Service — Early Access Logic for Rank-Based Sale Publishing (Option A)
 * Manages rank-gated publishing windows and visibility logic
 */

import { RANK_EARLY_ACCESS_HOURS } from './xpService';

// Rank type — defined in schema.prisma
type ExplorerRank = 'INITIATE' | 'SCOUT' | 'RANGER' | 'SAGE' | 'GRANDMASTER';

/**
 * Calculate the effective publish time for a sale given the user's rank.
 * Users with higher ranks can access the sale earlier.
 *
 * @param publishedAt - The sale's publishedAt timestamp (UTC)
 * @param userRank - The user's explorer rank (defaults to INITIATE if unauthenticated)
 * @returns The effective unlock time for this user (may be before publishedAt if user is high rank)
 */
export function getEffectivePublishTime(
  publishedAt: Date,
  userRank: ExplorerRank = 'INITIATE'
): Date {
  const hoursEarly = RANK_EARLY_ACCESS_HOURS[userRank] || 0;
  const effectiveTime = new Date(publishedAt.getTime() - hoursEarly * 60 * 60 * 1000);
  return effectiveTime;
}

/**
 * Determine if a sale is locked for a given user at the current time.
 * A sale is locked if the current time is before the user's effective unlock time.
 *
 * @param publishedAt - The sale's publishedAt timestamp (UTC)
 * @param userRank - The user's explorer rank
 * @param now - Current time (defaults to now)
 * @returns true if the sale is locked for this user, false if accessible
 */
export function isSaleLocked(
  publishedAt: Date | null,
  userRank: ExplorerRank = 'INITIATE',
  now: Date = new Date()
): boolean {
  if (!publishedAt) {
    // publishedAt not set — sale is not yet published; only organizers see it
    return true;
  }

  const effectiveTime = getEffectivePublishTime(publishedAt, userRank);
  return now < effectiveTime;
}

/**
 * Calculate the minutes until a sale unlocks for a given user.
 * Returns 0 if sale is already unlocked.
 *
 * @param publishedAt - The sale's publishedAt timestamp (UTC)
 * @param userRank - The user's explorer rank
 * @param now - Current time (defaults to now)
 * @returns Minutes until unlock (0 if already unlocked)
 */
export function getMinutesUntilUnlock(
  publishedAt: Date | null,
  userRank: ExplorerRank = 'INITIATE',
  now: Date = new Date()
): number {
  if (!publishedAt || !isSaleLocked(publishedAt, userRank, now)) {
    return 0;
  }

  const effectiveTime = getEffectivePublishTime(publishedAt, userRank);
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
