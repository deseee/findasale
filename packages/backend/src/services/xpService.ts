import { ExplorerRank } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createNotification } from './notificationService';

/**
 * XP Service — Single source of truth for all Explorer's Guild XP logic
 * Manages XP awards, rank calculations, sinks, and leaderboards
 * Phase 2a: Core gamification engine
 */

// Rank XP thresholds — cumulative XP required to reach each rank
export const RANK_THRESHOLDS: Record<ExplorerRank, number> = {
  INITIATE: 0,
  SCOUT: 500,
  RANGER: 2000,
  SAGE: 5000,
  GRANDMASTER: 12000,
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
  // Visits (per spec Decision 2, base 5 XP)
  VISIT: 5,
  COMEBACK_BONUS: 20, // One-time if returning after 2+ weeks away

  // Purchases and engagement
  PURCHASE: 1, // Base for completed purchase ($1 = 1 XP)
  REVIEW: 8, // For leaving a product review (raised from 5 — requires text effort)
  SHARE: 10, // For social share to external platform (honor system)
  HAUL_POST: 10, // For in-app haul post (2+ items + photo, posts to Loot Legend)

  // Condition rating — organizer earns when a shopper rates one of their items
  CONDITION_RATING: 5, // Organizer credit per shopper condition submission

  // Treasure Hunt QR (Feature #85) — gamedesign S417 rebalance
  TREASURE_HUNT_SCAN: 12, // Per clue scan (down from 25)
  TREASURE_HUNT_COMPLETION: 30, // All clues found bonus (down from 50)

  // RSVPs and engagement
  RSVP: 2, // Feature #154: Shopper RSVPs to sale (capped 10/month)

  // Streak and anniversary milestones (weekly cadence, not daily)
  STREAK_7DAY_BONUS: 100, // 7-day active week bonus (once/month)
  ANNIVERSARY_30DAY: 250, // 30-day active month anniversary (once/month)

  // Community contributions
  COMMUNITY_VALUATION: 5, // Price opinion on an item (down from 10, cap 20/month)

  // Collections and challenges
  COLLECTOR_PASSPORT_COMPLETE: 50, // One-time: passport complete (specialties + categories + keywords all non-empty)
  TRAIL_COMPLETE: 100, // One-time per trail: all QR codes found

  // Auctions (wins only — gamedesign S417 rebalance)
  AUCTION_WIN: 10, // Base win XP (down from 15)
  AUCTION_VALUE_BONUS_PER_100: 0.5, // +0.5 XP per $100 of item value, max +5 XP cap
  AUCTION_MAX_BONUS: 5,

  // Referrals
  REFERRAL_SIGNUP: 20,
  REFERRAL_FIRST_PURCHASE: 30,
};

// XP sink costs (per spec Decision 7 — gamedesign S417 full sink table)
export const XP_SINKS = {
  // Organizer sinks
  COUPON_GENERATE: 50,         // Organizer generates $1-off coupon for shoppers
  EARLY_ACCESS_BOOST: 75,      // Organizer presale visibility bump
  BOUNTY_VISIBILITY_BOOST: 15, // Organizer increases fulfillment odds (raised from 5)
  LISTINGS_EXTENSION: 100,     // Organizer extends listing tier (avoids $2.99 upgrade)
  EVENT_SPONSORSHIP: 500,      // Organizer gets exclusive bounties + high visibility (gamedesign S418)

  // Shopper sinks
  COUPON_CLAIM_SHOPPER: 100,   // Shopper spends for $1 off any purchase (1 XP = $0.01, gamedesign S418)
  RARITY_BOOST: 15,            // Shopper gets +2% legendary odds for one sale
  HUNT_PASS_DISCOUNT: 100,     // Shopper gets $1 off Hunt Pass subscription (1 XP = $0.01, gamedesign S418)
  HAUL_VISIBILITY_BOOST: 25,   // Shopper boosts haul post visibility for 7 days (1 XP = $0.01, gamedesign S418)
  SEASONAL_CHALLENGE_ACCESS: 250, // Shopper unlocks seasonal challenge tier (gamedesign S418)
  GUIDE_PUBLICATION: 50,       // Shopper publishes a collection guide (raised from 30)

  // Cosmetic sinks (permanent — Sage+ only)
  CUSTOM_USERNAME_COLOR: 50,   // Permanent color on username (raised from 25)
  CUSTOM_FRAME_BADGE: 75,      // Permanent profile frame badge (raised from 30)
};

// Monthly XP caps (per spec — gamedesign S417 updated)
export const MONTHLY_XP_CAPS = {
  VISIT: 150,
  AUCTION: 100,
  RSVP: 10,                   // Max 10 XP from RSVPs per calendar month
  CONDITION_RATING: 50,       // Organizer earns max 50 XP/month from condition submissions
  COMMUNITY_VALUATION: 100,   // Max 100 XP/month from price opinions (20 valuations × 5 XP)
};

// Daily XP caps (exploit prevention)
export const DAILY_XP_CAPS = {
  TREASURE_HUNT_SCAN: 100,    // Max 100 XP/day from QR clue scans (150 with Hunt Pass)
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
 * For TREASURE_HUNT_SCAN, Hunt Pass subscribers get a higher cap (150 instead of 100)
 */
export async function checkDailyXpCap(
  userId: string,
  type: string
): Promise<number> {
  let cap = DAILY_XP_CAPS[type as keyof typeof DAILY_XP_CAPS];
  if (!cap) return Number.MAX_SAFE_INTEGER; // No cap for this type

  try {
    // Hunt Pass bonus: raise TREASURE_HUNT_SCAN cap from 100 to 150
    if (type === 'TREASURE_HUNT_SCAN') {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          huntPassActive: true,
          huntPassExpiry: true,
        },
      });

      if (user?.huntPassActive && user?.huntPassExpiry && user.huntPassExpiry > new Date()) {
        cap = 150; // Hunt Pass XP cap for treasure hunt scans
      }
    }

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
 * Check if user has reached monthly XP cap for a given type
 * Returns remaining XP that can be awarded this month (0 if cap reached)
 * Monthly period is calendar month (1st to last day)
 */
export async function checkMonthlyXpCap(
  userId: string,
  type: string
): Promise<number> {
  const cap = MONTHLY_XP_CAPS[type as keyof typeof MONTHLY_XP_CAPS];
  if (!cap) return Number.MAX_SAFE_INTEGER; // No cap for this type

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const monthXp = await prisma.pointsTransaction.aggregate({
      where: {
        userId,
        type,
        createdAt: {
          gte: monthStart,
        },
      },
      _sum: {
        points: true,
      },
    });

    const awarded = monthXp._sum.points || 0;
    const remaining = Math.max(0, cap - awarded);
    return remaining;
  } catch (error) {
    console.error(
      `[xpService] Failed to check monthly cap for ${type}:`,
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

      // Send rank-up notification
      await createNotification(
        userId,
        'RANK_UP',
        `You've reached ${newRank}!`,
        `Congratulations! You've advanced to ${newRank} rank. Keep hunting!`,
        `/shopper/profile`, // deep link to profile page
        'OPERATIONAL'
      );
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

    // Recalculate rank based on new balance (updatedUser.guildXp already reflects the decrement)
    // Note: ranks are milestones — spending XP does NOT drop rank (gamedesign S417 decision #14)
    const newRank = getRankForXp(updatedUser.guildXp);
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

/**
 * Rank-Based XP Multiplier for Treasure Hunt Scans
 * Ranger+ get bonus multipliers on TREASURE_HUNT_SCAN awards
 * INITIATE/SCOUT: 1x (12 XP), RANGER: 1.5x (18 XP), SAGE: 1.75x (21 XP), GRANDMASTER: 2x (24 XP)
 */
export function getRankXpMultiplier(rank: ExplorerRank): number {
  switch (rank) {
    case 'GRANDMASTER':
      return 2.0;
    case 'SAGE':
      return 1.75;
    case 'RANGER':
      return 1.5;
    case 'SCOUT':
    case 'INITIATE':
    default:
      return 1.0;
  }
}

/**
 * Check and award streak milestone bonuses
 * Gamedesign S417 decision #10: daily streak milestones (5/10/20 days) removed.
 * Replaced by weekly cadence: 7-day active week bonus (STREAK_7DAY_BONUS = 100 XP, once/month)
 * and 30-day anniversary (ANNIVERSARY_30DAY = 250 XP, once/month).
 * This function now awards STREAK_7DAY_BONUS when user hits 7 active days in a calendar month.
 * TODO: wire ANNIVERSARY_30DAY into user anniversary tracking (separate feature).
 */
export async function checkStreakMilestones(
  userId: string,
  activeMonthDays: number
): Promise<void> {
  // Award the 7-day streak bonus once per calendar month
  if (activeMonthDays === 7) {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const existingBonus = await prisma.pointsTransaction.findFirst({
        where: {
          userId,
          type: 'STREAK_7DAY_BONUS',
          createdAt: { gte: monthStart },
        },
      });

      if (!existingBonus) {
        await awardXp(userId, 'STREAK_7DAY_BONUS', XP_AWARDS.STREAK_7DAY_BONUS, {
          description: '7-day active week bonus',
        });
      }
    } catch (error) {
      console.error(`[xpService] Failed to award 7-day streak bonus for user ${userId}:`, error);
    }
  }
}

/**
 * Check if user has already earned trail completion bonus
 * Returns true if XP has already been awarded for this trail
 */
export async function hasEarnedTrailBonus(userId: string, trailId: string): Promise<boolean> {
  try {
    const existing = await prisma.pointsTransaction.findFirst({
      where: {
        userId,
        type: 'TRAIL_COMPLETE',
        description: { contains: trailId },
      },
    });
    return !!existing;
  } catch (error) {
    console.error('[xpService] Failed to check trail bonus:', error);
    return false;
  }
}
