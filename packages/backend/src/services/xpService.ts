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

  // Sale creation
  FIRST_SALE_CREATED: 25, // One-time XP bonus when organizer creates first sale

  // Purchases and engagement
  PURCHASE: 10, // Flat XP per completed purchase (D-XP-004 — not per dollar)
  REVIEW: 5, // For leaving a product review (D-XP-004)
  SHARE: 5, // For social share to external platform — honor system (D-XP-018, was 10)
  HAUL_POST: 15, // For in-app haul post — post-purchase documentation (D-XP-016, was 25)
  APPRAISAL_SELECTED: 20, // Appraiser's valuation selected by seller — paid service contribution (D-XP-004)

  // Condition rating — organizer earns when a shopper rates one of their items
  CONDITION_RATING: 5, // Organizer credit per shopper condition submission

  // Treasure Hunt QR (Feature #85) — D-XP-015 rebalance
  TREASURE_HUNT_SCAN: 3, // Per clue scan — progress marker, not the payout (D-XP-015, was 12)
  TREASURE_HUNT_COMPLETION: 15, // All clues found bonus — the real reward (D-XP-015, was 30)

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

  // Auctions (wins only — D-XP-009: flat 20 XP, value multiplier eliminated)
  AUCTION_WIN: 20, // Flat XP per auction win — competitive transaction (D-XP-009, was 10+bonus)

  // Referrals
  REFERRAL_SIGNUP: 20,
  REFERRAL_FIRST_PURCHASE: 500, // Referrer earns when friend's first purchase clears (D-XP-004, was 30)
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
  HAUL_VISIBILITY_BOOST: 10,   // Shopper bumps haul post to top of local feed for 2h (D-XP-013, was 25)
  SEASONAL_CHALLENGE_ACCESS: 250, // Shopper unlocks seasonal challenge tier (gamedesign S418)
  GUIDE_PUBLICATION: 50,       // Shopper publishes a collection guide (raised from 30)

  // Cosmetic sinks (permanent — Sage+ only) — D-XP-005 repricing
  CUSTOM_USERNAME_COLOR: 1000,  // Permanent color on username (D-XP-005: 1,000 XP)
  CUSTOM_FRAME_BADGE: 2500,     // Permanent profile frame badge (D-XP-005: 2,500 XP)

  // Phase 2c: New XP Sinks
  CUSTOM_MAP_PIN: 500,          // Organizer customizes sale map icon with emoji (D-XP-012, was 75)
  PROFILE_SHOWCASE_SLOT_2: 250,  // Shopper unlocks 2nd profile showcase slot — Bronze (D-XP-005: 250 XP)
  PROFILE_SHOWCASE_SLOT_3: 350, // Shopper unlocks 3rd profile showcase slot — Silver (D-XP-005: 350 XP)
  PROFILE_SHOWCASE_SLOT_GOLD: 500, // Shopper unlocks 4th profile showcase slot — Gold (D-XP-005: 500 XP)
  TREASURE_TRAIL_SPONSOR: 100,  // Organizer pays to create a Treasure Trail

  // Phase 2a Social Retention: Explorer's Guild
  CREW_CREATION: 500,   // Shopper creates a named collector crew (S420)
};

// Monthly XP caps (per locked decisions)
export const MONTHLY_XP_CAPS = {
  // VISIT cap removed — D-XP-014: no daily/monthly cap, only once per unique sale per day
  AUCTION: 100,
  HAUL_POST_COUNT: 4,         // D-XP-008: max 4 haul posts earn XP per calendar month (60 XP max)
  RSVP: 10,                   // Max 10 XP from RSVPs per calendar month
  CONDITION_RATING: 50,       // Organizer earns max 50 XP/month from condition submissions
  COMMUNITY_VALUATION: 100,   // Max 100 XP/month from price opinions (20 valuations × 5 XP)
};

// Daily XP caps (exploit prevention)
export const DAILY_XP_CAPS = {
  // TREASURE_HUNT_SCAN cap removed — D-XP-015: at 3 XP/scan not farmable; unique-clue gate is sufficient
  // TREASURE_HUNT_COMPLETION cap removed — D-XP-015: at 15 XP/hunt not farmable
  APPRAISAL_SELECTED: 100,    // Max 100 XP/day from appraisal selections (5 selections × 20 XP) — P0 security fix
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
 * Updates lastXpActivityAt and xpExpiresAt (D-XP-002)
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
    purchaseId?: string; // P0 Exploit Fix: link for chargeback claw-back
    description?: string;
    holdUntil?: Date; // P0 Exploit Fix: when this XP becomes spendable
  }
): Promise<{ newXp: number; newRank: ExplorerRank; xpAwarded: number; rankIncreased: boolean } | null> {
  try {
    // Platform Safety #118: Device Fingerprinting — block XP awards to fraud suspects
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.fraudSuspect) {
      console.log(`[FRAUD] Blocked XP award to fraudSuspect user ${userId}, type: ${type}, amount: ${amount}`);
      return null;
    }

    // Calculate old rank before XP increment
    const oldRank = getRankForXp(user?.guildXp || 0);

    // Add transaction record
    await prisma.pointsTransaction.create({
      data: {
        userId,
        type,
        points: amount,
        saleId: context?.saleId,
        itemId: context?.itemId,
        purchaseId: context?.purchaseId, // P0 Exploit Fix
        couponId: context?.couponId,
        description: context?.description,
        holdUntil: context?.holdUntil, // P0 Exploit Fix
      },
    });

    // Calculate expiry window (365 days from now for D-XP-002)
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    // Update User guildXp, lifetime XP earned, and expiry tracking (D-XP-002)
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        guildXp: {
          increment: amount,
        },
        lifetimeXpEarned: {
          increment: amount, // Track total XP ever earned
        },
        lastXpActivityAt: now, // Reset activity timer
        xpExpiresAt: expiresAt, // Recalculate expiry (365 days from now)
        xpExpiryWarned300: false, // Reset warning flags on new activity
        xpExpiryWarned350: false,
      },
    });

    // Recalculate rank based on new XP
    const newRank = getRankForXp(updatedUser.guildXp);
    const rankIncreased = newRank !== oldRank;

    if (rankIncreased) {
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
      rankIncreased,
    };
  } catch (error) {
    console.error(`[xpService] Failed to award ${amount} XP to user ${userId}:`, error);
    return null;
  }
}

/**
 * P0 Exploit Fix: Get user's spendable XP (guildXp minus any XP on hold)
 * XP on hold: purchases (72-hour hold), Hunt Pass churn (30-day post-cancel hold)
 */
export async function getSpendableXp(userId: string): Promise<number> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { guildXp: true },
    });

    if (!user) return 0;

    // Find all XP transactions still on hold (holdUntil in the future)
    const onHold = await prisma.pointsTransaction.aggregate({
      where: {
        userId,
        holdUntil: {
          gt: new Date(), // Still on hold
        },
      },
      _sum: {
        points: true,
      },
    });

    const heldXp = onHold._sum.points || 0;
    const spendable = Math.max(0, user.guildXp - heldXp);

    return spendable;
  } catch (error) {
    console.error(`[xpService] Failed to get spendable XP for user ${userId}:`, error);
    return 0; // Fail safe: return 0 (user gets error)
  }
}

/**
 * Spend XP from a user's balance (for sinks)
 * Returns true if successful, false if insufficient spendable XP
 * P0 Exploit Fix: Checks holdUntil restrictions (72h for chargebacks, 30d for HP churn)
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
    // P0 Exploit Fix: Check spendable XP (not total guildXp)
    const spendable = await getSpendableXp(userId);

    if (spendable < amount) {
      return false; // Insufficient spendable XP
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
    if (newRank !== updatedUser.explorerRank) {
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

    const entries = topUsers.map((user, index) => ({
      rank: index + 1,
      userId: user.id,
      userName: user.name,
      guildXp: user.guildXp,
      explorerRank: user.explorerRank,
    }));

    return {
      entries,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[xpService] Failed to fetch leaderboard:', error);
    return { entries: [], lastUpdated: new Date().toISOString() };
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
 * D-XP-002: Check if user is exempt from XP expiry
 * Grandmaster+ (lifetime XP earned >= 5000) never expires
 */
export async function isXpExpiryExempt(userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lifetimeXpEarned: true },
    });

    if (!user) return false;
    return user.lifetimeXpEarned >= 5000; // Grandmaster+ exemption
  } catch (error) {
    console.error(`[xpService] Failed to check XP expiry exemption for user ${userId}:`, error);
    return false;
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

/**
 * P0 Exploit Fix: Mark XP earned during HP subscription for settlement hold on cancellation
 * Called when user cancels Hunt Pass subscription
 * XP earned while HP was active will be held for 30 days after cancellation
 * to prevent HP churn exploit (buy HP, farm XP at 1.5x, cancel, redeem)
 */
export async function markHuntPassCancellation(userId: string): Promise<void> {
  try {
    // Record the cancellation timestamp on the user
    await prisma.user.update({
      where: { id: userId },
      data: {
        huntPassCancelledAt: new Date(),
      },
    });

    console.log(`[xpService] Hunt Pass cancellation recorded for user ${userId}`);
  } catch (error) {
    console.error(
      `[xpService] Failed to record Hunt Pass cancellation for user ${userId}:`,
      error
    );
  }
}

/**
 * P0 Exploit Fix: Check if XP from HP-earned window is still on hold post-cancellation
 * Called before allowing XP redemption
 * If user cancelled HP within last 30 days, hold any XP earned during their HP subscription
 */
export async function applyHuntPassChurnHold(
  userId: string,
  xpAmount: number
): Promise<Date | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        huntPassCancelledAt: true,
        huntPassActive: true,
        huntPassExpiry: true,
      },
    });

    if (!user || !user.huntPassCancelledAt) {
      return null; // No hold needed
    }

    // Check if cancellation was within last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    if (user.huntPassCancelledAt < thirtyDaysAgo) {
      return null; // Cancellation was >30 days ago, hold expired
    }

    // Apply 30-day hold from cancellation date
    const holdUntil = new Date(user.huntPassCancelledAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    return holdUntil;
  } catch (error) {
    console.error(
      `[xpService] Failed to check Hunt Pass churn hold for user ${userId}:`,
      error
    );
    return null; // Fail open: no hold
  }
}

/**
 * P0 Exploit Fix: Claw back XP earned from a disputed purchase
 * Called when charge.dispute.created webhook fires
 * Removes all XP awarded for the purchase within a 72-hour window
 */
export async function clawBackChargebackXp(
  purchaseId: string,
  userId: string
): Promise<number> {
  try {
    // Find all XP transactions linked to this purchase
    const xpTransactions = await prisma.pointsTransaction.findMany({
      where: {
        purchaseId,
        userId,
      },
    });

    if (xpTransactions.length === 0) {
      console.log(`[xpService] No XP to claw back for purchase ${purchaseId}`);
      return 0;
    }

    // Calculate total XP to claw back
    const totalXpToRemove = xpTransactions.reduce((sum, tx) => sum + tx.points, 0);

    // Remove XP from user's guildXp
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        guildXp: {
          decrement: totalXpToRemove,
        },
      },
    });

    // Create a reverse transaction to record the claw-back in audit log
    await prisma.pointsTransaction.create({
      data: {
        userId,
        type: 'CHARGEBACK_XP_CLAWBACK', // Audit record for reverse
        points: -totalXpToRemove,
        purchaseId,
        description: `Chargeback dispute — XP reversed from purchase ${purchaseId}`,
      },
    });

    // Recalculate rank (may drop if spending would have dropped it)
    const newRank = getRankForXp(updatedUser.guildXp);
    if (newRank !== updatedUser.explorerRank) {
      await prisma.user.update({
        where: { id: userId },
        data: { explorerRank: newRank },
      });
    }

    console.log(
      `[xpService] Clawed back ${totalXpToRemove} XP from user ${userId} for purchase ${purchaseId}`
    );
    return totalXpToRemove;
  } catch (error) {
    console.error(
      `[xpService] Failed to claw back XP for purchase ${purchaseId}:`,
      error
    );
    return 0;
  }
}
