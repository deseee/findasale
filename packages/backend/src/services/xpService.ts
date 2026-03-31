import { ExplorerRank } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * XP Service — Single source of truth for all Explorer's Guild XP logic
 * Manages XP awards, rank calculations, sinks, and leaderboards
 * Phase 2a: Core gamification engine
 */

// Rank XP thresholds — cumulative XP required to reach each rank
export const RANK_THRESHOLDS: Record<ExplorerRank, number> = {
  INITIATE: 0,
  SCOUT: 500,
  RANGER: 1500,
  SAGE: 2500,
  GRANDMASTER: 5000,
};

// Seasonal reset floor — when resetting, users drop to this rank minimum
export const SEASONAL_RESET_FLOOR: Record<ExplorerRank, ExplorerRank> = {
  INITIATE: 'INITIATE',
  SCOUT: 'SCOUT',
  RANGER: 'SCOUT',
  SAGE: 'RANGER',
  GRANDMASTER: 'SAGE',
};

// XP awards for different event types
export const XP_AWARDS = {
  // Visits (per spec Decision 2, base 10 XP)
  VISIT: 10,
  COMEBACK_BONUS: 20, // One-time if returning after 2+ weeks away
  STREAK_BONUS_PER_WEEK: 2, // Max +10 XP at 5+ consecutive weeks

  // Purchases and engagement
  PURCHASE: 15, // Base for completed purchase
  REVIEW: 5, // For leaving a product review
  SHARE: 10, // For social share (honor system)
  ITEM_SCANNED: 25, // Feature #85: Treasure Hunt QR scan

  // Auctions (per spec Decision 5, wins only)
  AUCTION_WIN: 15,
  AUCTION_VALUE_BONUS_PER_100: 0.5, // +0.5 XP per $100 of item value, max +5 XP
  AUCTION_MAX_BONUS: 5,

  // Future: Referrals, challenges, etc.
  REFERRAL_SIGNUP: 20,
  REFERRAL_FIRST_PURCHASE: 30,
};

// XP sink costs (per spec Decision 7)
export const XP_SINKS = {
  COUPON_GENERATE: 20, // Organizer spends 20 XP to create $1-off coupon
  RARITY_BOOST: 15, // Shopper spends 15 XP for +2% legendary odds
  HUNT_PASS_DISCOUNT: 50, // Shopper spends 50 XP for $1 off Hunt Pass
};

// Monthly XP caps (per spec)
export const MONTHLY_XP_CAPS = {
  VISIT: 150,
  AUCTION: 100,
};

// Daily XP caps (exploit prevention)
export const DAILY_XP_CAPS = {
  ITEM_SCANNED: 100,
};

/**
 * Calculate which rank a user should hold based on cumulative XP
 */
export function getRankForXp(xp: number): ExplorerRank {
  if (xp >= RANK_THRESHOLDS.GRANDMASTER) return 'GRANDMASTER';
  if (xp >= RANK_THRESHOLDS.SAGE) return 'SAGE';
  if (xp >= RANK_THRESHOLDS.RANGER) return 'RANGER';
  if (xp >= RANK_THRESHOLDS.SCOUT) return 'SCOUT';
  return 'INITIATE';
}

/**
 * Get minimum XP required for a rank
 */
export function getXpForRank(rank: ExplorerRank): number {
  return RANK_THRESHOLDS[rank];
}

/**
 * Get rank progression info: how much XP to next rank, percentage toward next rank
 */
export function getRankProgress(currentXp: number) {
  const currentRank = getRankForXp(currentXp);
  const nextRank = (
    Object.keys(RANK_THRESHOLDS) as ExplorerRank[]
  ).find((r) => RANK_THRESHOLDS[r] > RANK_THRESHOLDS[currentRank]);

  if (!nextRank) {
    // Already at GRANDMASTER
    return {
      currentRank,
      nextRank: null,
      currentXp,
      nextRankXp: null,
      progressPct: 100,
    };
  }

  const nextRankThreshold = RANK_THRESHOLDS[nextRank];
  const currentRankThreshold = RANK_THRESHOLDS[currentRank];
  const xpInCurrentRank = currentXp - currentRankThreshold;
  const xpNeededForNextRank = nextRankThreshold - currentRankThreshold;
  const progressPct = Math.round(
    (xpInCurrentRank / xpNeededForNextRank) * 100
  );

  return {
    currentRank,
    nextRank,
    currentXp,
    nextRankXp: nextRankThreshold,
    progressPct,
  };
}

/**
 * Check if user has reached daily XP cap for a given type
 * Returns remaining XP that can be awarded today (0 if cap reached)
 */
export async function checkDailyXpCap(
  userId: string,
  type: string
): Promise<number> {
  const cap = DAILY_XP_CAPS[type as keyof typeof DAILY_XP_CAPS];
  if (!cap) return Number.MAX_SAFE_INTEGER; // No cap for this type

  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const todayXp = await prisma.pointsTransaction.aggregate({
      where: {
        userId,
        type,
        createdAt: {
          gte: today,
        },
      },
      _sum: {
        points: true,
      },
    });

    const awarded = todayXp._sum.points || 0;
    const remaining = Math.max(0, cap - awarded);
    return remaining;
  } catch (error) {
    console.error(
      `[xpService] Failed to check daily cap for ${type}:`,
      error
    );
    return cap; // Return full cap on error (fail open)
  }
}

/**
 * Award XP to a user for an event
 * Creates PointsTransaction record and updates guildXp + explorerRank
 * Non-blocking: wraps in try/catch so failures don't break main flow
 */
export async function awardXp(
  userId: string,
  type: string,
  amount: number,
  context?: {
    saleId?: string;
    itemId?: string;
    referralId?: string;
    couponId?: string;
    description?: string;
  }
): Promise<{ newXp: number; newRank: ExplorerRank; xpAwarded: number } | null> {
  try {
    // Add transaction record
    await prisma.pointsTransaction.create({
      data: {
        userId,
        type,
        points: amount,
        saleId: context?.saleId,
        itemId: context?.itemId,
        couponId: context?.couponId,
        description: context?.description,
      },
    });

    // Update User guildXp and recalculate rank
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        guildXp: {
          increment: amount,
        },
      },
    });

    // Recalculate rank based on new XP
    const newRank = getRankForXp(updatedUser.guildXp);
    if (newRank !== updatedUser.explorerRank) {
      await prisma.user.update({
        where: { id: userId },
        data: { explorerRank: newRank },
      });
    }

    return {
      newXp: updatedUser.guildXp,
      newRank,
      xpAwarded: amount,
    };
  } catch (error) {
    console.error(`[xpService] Failed to award ${amount} XP to user ${userId}:`, error);
    return null;
  }
}

/**
 * Spend XP from a user's balance (for sinks)
 * Returns true if successful, false if insufficient XP
 */
export async function spendXp(
  userId: string,
  amount: number,
  sinkType: string,
  context?: {
    saleId?: string;
    description?: string;
  }
): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.guildXp < amount) {
      return false; // Insufficient XP
    }

    // Deduct XP
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        guildXp: {
          decrement: amount,
        },
      },
    });

    // Create negative transaction record
    await prisma.pointsTransaction.create({
      data: {
        userId,
        type: sinkType,
        points: -amount, // Negative = spend
        saleId: context?.saleId,
        description: context?.description,
      },
    });

    // Recalculate rank if needed
    const newRank = getRankForXp(updatedUser.guildXp - amount);
    if (newRank !== user.explorerRank) {
      await prisma.user.update({
        where: { id: userId },
        data: { explorerRank: newRank },
      });
    }

    return true;
  } catch (error) {
    console.error(`[xpService] Failed to spend ${amount} XP for user ${userId}:`, error);
    return false;
  }
}

/**
 * Get XP leaderboard — top users by guildXp
 */
export async function getLeaderboard(limit: number = 50) {
  try {
    const topUsers = await prisma.user.findMany({
      where: {
        guildXp: { gt: 0 },
      },
      select: {
        id: true,
        name: true,
        guildXp: true,
        explorerRank: true,
      },
      orderBy: {
        guildXp: 'desc',
      },
      take: limit,
    });

    return topUsers.map((user, index) => ({
      rank: index + 1,
      ...user,
      rankName: user.explorerRank,
    }));
  } catch (error) {
    console.error('[xpService] Failed to fetch leaderboard:', error);
    return [];
  }
}

/**
 * Apply seasonal reset to all users
 * Drops rank to seasonal floor, keeps XP for history
 * Called annually on Jan 1 UTC
 */
export async function applySeasonalReset() {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, guildXp: true, explorerRank: true },
    });

    for (const user of users) {
      const newRank = SEASONAL_RESET_FLOOR[user.explorerRank];
      const newSeasonalResetAt = new Date(
        new Date().getFullYear(),
        0,
        1,
        0,
        0,
        0,
        0
      ); // Jan 1 UTC midnight

      await prisma.user.update({
        where: { id: user.id },
        data: {
          explorerRank: newRank,
          seasonalResetAt: newSeasonalResetAt,
        },
      });
    }

    console.log('[xpService] Seasonal reset applied to all users');
  } catch (error) {
    console.error('[xpService] Failed to apply seasonal reset:', error);
  }
}

/**
 * Get user's XP profile for dashboard display
 * Returns: { guildXp, explorerRank, rankProgress: { currentXp, nextRankXp, nextRank } }
 */
export async function getUserXpProfile(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        guildXp: true,
        explorerRank: true,
        huntPassActive: true,
        huntPassExpiry: true,
      },
    });

    if (!user) return null;

    const progress = getRankProgress(user.guildXp);

    return {
      guildXp: user.guildXp,
      explorerRank: user.explorerRank,
      huntPassActive: user.huntPassActive,
      huntPassExpiry: user.huntPassExpiry,
      rankProgress: {
        currentXp: progress.currentXp,
        nextRankXp: progress.nextRankXp,
        nextRank: progress.nextRank,
      },
    };
  } catch (error) {
    console.error('[xpService] Failed to fetch user XP profile:', error);
    return null;
  }
}

/**
 * Hunt Pass XP Multiplier Helper
 * Applies 1.5x multiplier if user has active Hunt Pass
 * Used by item purchase XP awards and other Hunt Pass benefits
 */
export async function applyHuntPassMultiplier(userId: string, baseXp: number): Promise<number> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        huntPassActive: true,
        huntPassExpiry: true,
      },
    });

    if (!user) return baseXp;

    // Check if Hunt Pass is active and not expired
    if (user.huntPassActive && user.huntPassExpiry && user.huntPassExpiry > new Date()) {
      return Math.round(baseXp * 1.5);
    }

    return baseXp;
  } catch (error) {
    console.error(`[xpService] Failed to apply Hunt Pass multiplier for user ${userId}:`, error);
    return baseXp;
  }
}
