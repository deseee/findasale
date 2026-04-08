import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { awardXp, spendXp } from './xpService';

/**
 * Lucky Roll Service — XP-only weekly gacha with pity counters and regulatory transparency
 * Phase 2b: Weekly gacha mechanic for shoppers
 */

// Outcome types (matches schema.prisma LuckyRollOutcome enum)
type LuckyRollOutcome = 'CONSOLATION' | 'XP_50' | 'XP_100' | 'XP_200' | 'COUPON_1' | 'XP_500' | 'COSMETIC_RARE';

// Reward table: outcome → (probability 0-10000, xpValue or null, description)
type RewardRow = {
  outcome: LuckyRollOutcome;
  probability: number;
  description: string;
  xpValue: number | null;
};

const BASE_REWARD_TABLE: RewardRow[] = [
  { outcome: 'CONSOLATION', probability: 3500, description: '10 XP back', xpValue: 10 },
  { outcome: 'XP_50', probability: 2800, description: '50 XP', xpValue: 50 },
  { outcome: 'XP_100', probability: 1500, description: '100 XP', xpValue: 100 },
  { outcome: 'XP_200', probability: 1000, description: '200 XP', xpValue: 200 },
  { outcome: 'COUPON_1', probability: 700, description: '$1 coupon ($10+ min)', xpValue: null },
  { outcome: 'XP_500', probability: 400, description: '500 XP jackpot', xpValue: 500 },
  { outcome: 'COSMETIC_RARE', probability: 100, description: 'Rare cosmetic', xpValue: null },
];

/**
 * Build probability table with pity adjustments applied
 * Layer 1: if luckyRollPityCount >= 2, remove CONSOLATION, redistribute 35% proportionally
 * Layer 2: if (luckyRollPityYear + 1) % 10 === 0, force outcome from [XP_200, COUPON_1, XP_500, COSMETIC_RARE]
 * Streak protection: if luckyRollStreakBad >= 5, double XP_500 from 4% to 8%
 */
function buildProbabilityTable(
  user: {
    luckyRollPityCount: number;
    luckyRollPityYear: number;
    luckyRollStreakBad: number;
  }
): {
  buckets: Array<{ start: number; end: number; outcome: LuckyRollOutcome }>;
  layer2Force: boolean;
  payloadForce: LuckyRollOutcome[] | null;
} {
  let table = [...BASE_REWARD_TABLE];

  // Layer 1 pity: if pityCount >= 2, remove CONSOLATION and redistribute
  if (user.luckyRollPityCount >= 2) {
    const consolationRow = table.findIndex((r) => r.outcome === 'CONSOLATION');
    if (consolationRow >= 0) {
      const consolationProb = table[consolationRow].probability;
      table = table.filter((r) => r.outcome !== 'CONSOLATION');

      // Redistribute consolation probability proportionally to remaining outcomes
      const totalRemaining = table.reduce((sum, r) => sum + r.probability, 0);
      table = table.map((r) => ({
        ...r,
        probability: Math.round((r.probability / totalRemaining) * (10000 - consolationProb)),
      }));
    }
  }

  // Streak protection: double XP_500 if streakBad >= 5
  if (user.luckyRollStreakBad >= 5) {
    table = table.map((r) => ({
      ...r,
      probability: r.outcome === 'XP_500' ? r.probability * 2 : r.probability,
    }));
  }

  // Normalize to 10000 total
  const totalProb = table.reduce((sum, r) => sum + r.probability, 0);
  table = table.map((r) => ({
    ...r,
    probability: Math.round((r.probability / totalProb) * 10000),
  }));

  // Build bucketed lookup table
  const buckets: Array<{ start: number; end: number; outcome: LuckyRollOutcome }> = [];
  let cumulative = 0;
  for (const row of table) {
    buckets.push({
      start: cumulative,
      end: cumulative + row.probability,
      outcome: row.outcome,
    });
    cumulative += row.probability;
  }

  // Layer 2: if (luckyRollPityYear + 1) % 10 === 0, force outcome to one of the premium tiers
  // This is applied at roll time, not at table build time
  const layer2Force = (user.luckyRollPityYear + 1) % 10 === 0;
  const forcedOutcomes: LuckyRollOutcome[] = ['XP_200', 'COUPON_1', 'XP_500', 'COSMETIC_RARE'];

  return { buckets, layer2Force, payloadForce: layer2Force ? forcedOutcomes : null };
}

/**
 * Derive the weekly reset boundary: Sunday 23:59:59 UTC
 * Returns the most recent Sunday at 23:59:59 UTC
 */
function getWeeklyResetBoundary(now: Date = new Date()): Date {
  const utcNow = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
  const dayOfWeek = utcNow.getUTCDay(); // 0 = Sunday
  const daysToLastSunday = dayOfWeek; // How many days back to Sunday
  const lastSunday = new Date(utcNow);
  lastSunday.setUTCDate(utcNow.getUTCDate() - daysToLastSunday);
  lastSunday.setUTCHours(23, 59, 59, 999);
  return lastSunday;
}

/**
 * Check eligibility: XP balance, account age, weekly cap
 */
export async function getEligibility(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      guildXp: true,
      createdAt: true,
      luckyRollLastRolledAt: true,
      huntPassActive: true,
      huntPassExpiry: true,
    },
  });

  if (!user) {
    return { canRoll: false, message: 'User not found' };
  }

  const now = new Date();
  const accountAgeDays = (now.getTime() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const accountOldEnough = accountAgeDays >= 30;
  const hasXp = user.guildXp >= 100;

  // Check weekly reset boundary
  const weeklyResetBoundary = getWeeklyResetBoundary(now);
  const lastRolledAfterReset = user.luckyRollLastRolledAt && user.luckyRollLastRolledAt > weeklyResetBoundary;
  const weeklyLimit = user.huntPassActive && user.huntPassExpiry && user.huntPassExpiry > now ? 2 : 1;

  // Count rolls this week
  let rollsThisWeek = 0;
  if (lastRolledAfterReset) {
    const rollCountThisWeek = await prisma.luckyRoll.count({
      where: {
        userId,
        createdAt: { gte: weeklyResetBoundary },
      },
    });
    rollsThisWeek = rollCountThisWeek;
  }

  const canRoll = accountOldEnough && hasXp && rollsThisWeek < weeklyLimit;

  // Next roll at = next Sunday 23:59:59 UTC if weekly cap hit
  let nextRollAt: Date | null = null;
  if (!canRoll && rollsThisWeek >= weeklyLimit) {
    const nextWeekSunday = new Date(weeklyResetBoundary);
    nextWeekSunday.setUTCDate(nextWeekSunday.getUTCDate() + 7);
    nextRollAt = nextWeekSunday;
  }

  return {
    canRoll,
    rollsRemainingThisWeek: Math.max(0, weeklyLimit - rollsThisWeek),
    weeklyLimit,
    nextRollAt,
    xpCost: 100,
    userXpBalance: user.guildXp,
    canAfford: hasXp,
    rewardTable: BASE_REWARD_TABLE.map((r) => ({
      outcome: r.outcome,
      probability: r.probability / 100, // Convert to percentage
      description: r.description,
      xpValue: r.xpValue,
    })),
    legalNotice: 'No real-money purchase required. XP cannot be exchanged for cash.',
  };
}

/**
 * Perform the lucky roll: RNG, pity adjustments, XP deduction, award, counter updates
 * Celebrationtier: JACKPOT (XP_500/COSMETIC_RARE), WIN (XP_200/COUPON_1), BREAK_EVEN (XP_100), CONSOLATION (XP_50 or CONSOLATION)
 */
export async function performRoll(
  userId: string
): Promise<{
  outcome: LuckyRollOutcome;
  xpAwarded: number | null;
  couponCode: string | null;
  description: string;
  celebrationTier: 'JACKPOT' | 'WIN' | 'BREAK_EVEN' | 'CONSOLATION';
  rollNumber: number;
  pityFired: boolean;
  newXpBalance: number;
  nextRollAt: Date;
  rollsRemainingThisWeek: number;
}> {
  // Load user and verify eligibility
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      guildXp: true,
      createdAt: true,
      luckyRollLastRolledAt: true,
      huntPassActive: true,
      huntPassExpiry: true,
      luckyRollPityCount: true,
      luckyRollPityYear: true,
      luckyRollStreakBad: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const now = new Date();
  const accountAgeDays = (now.getTime() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (accountAgeDays < 30) {
    throw new Error('Account must be at least 30 days old to roll.');
  }

  if (user.guildXp < 100) {
    throw new Error(`Lucky Roll costs 100 XP. You have ${user.guildXp} XP.`);
  }

  const weeklyResetBoundary = getWeeklyResetBoundary(now);
  const weeklyLimit = user.huntPassActive && user.huntPassExpiry && user.huntPassExpiry > now ? 2 : 1;
  const rollCountThisWeek = await prisma.luckyRoll.count({
    where: {
      userId,
      createdAt: { gte: weeklyResetBoundary },
    },
  });

  if (rollCountThisWeek >= weeklyLimit) {
    const nextWeekSunday = new Date(weeklyResetBoundary);
    nextWeekSunday.setUTCDate(nextWeekSunday.getUTCDate() + 7);
    throw new Error(`You've already rolled this week. Next roll available ${nextWeekSunday.toISOString()}.`);
  }

  // Build probability table with pity adjustments
  const { buckets, layer2Force, payloadForce } = buildProbabilityTable(user);

  // Generate RNG seed and perform roll
  const seedBytes = crypto.randomBytes(4);
  const uint32 = seedBytes.readUInt32BE(0);
  const roll = uint32 % 10000;
  const seedHash = crypto.createHash('sha256').update(seedBytes).digest('hex');

  // Bucket lookup
  let outcome: LuckyRollOutcome = 'CONSOLATION';
  for (const bucket of buckets) {
    if (roll >= bucket.start && roll < bucket.end) {
      outcome = bucket.outcome;
      break;
    }
  }

  // Layer 2 pity: force outcome if conditions met
  let pityFired = false;
  if (layer2Force && payloadForce) {
    // Sub-RNG: pick from [XP_200, COUPON_1, XP_500, COSMETIC_RARE]
    const forcedOutcomes = payloadForce as LuckyRollOutcome[];
    const subRng = crypto.randomBytes(1).readUInt8(0) % forcedOutcomes.length;
    outcome = forcedOutcomes[subRng];
    pityFired = true;
  }

  // Determine celebration tier
  let celebrationTier: 'JACKPOT' | 'WIN' | 'BREAK_EVEN' | 'CONSOLATION';
  if (outcome === 'XP_500' || outcome === 'COSMETIC_RARE') {
    celebrationTier = 'JACKPOT';
  } else if (outcome === 'XP_200' || outcome === 'COUPON_1') {
    celebrationTier = 'WIN';
  } else if (outcome === 'XP_100') {
    celebrationTier = 'BREAK_EVEN';
  } else {
    celebrationTier = 'CONSOLATION';
  }

  // Determine XP awarded
  const outcomeRow = BASE_REWARD_TABLE.find((r) => r.outcome === outcome);
  const xpAwarded = outcomeRow?.xpValue ?? null;

  // Build description
  let description = '';
  if (outcome === 'CONSOLATION') description = 'Better luck next time! +10 XP';
  else if (outcome === 'XP_50') description = 'Not bad! +50 XP';
  else if (outcome === 'XP_100') description = 'Break even! +100 XP';
  else if (outcome === 'XP_200') description = 'Nice roll! +200 XP';
  else if (outcome === 'COUPON_1') description = 'Coupon awarded! $1 off your next purchase';
  else if (outcome === 'XP_500') description = 'JACKPOT! +500 XP';
  else if (outcome === 'COSMETIC_RARE') description = 'RARE! Cosmetic reward unlocked';

  // Transaction: deduct XP, award outcome, update counters
  const result = await prisma.$transaction(async (tx) => {
    // Deduct 100 XP
    const spent = await tx.user.update({
      where: { id: userId },
      data: {
        guildXp: { decrement: 100 },
      },
    });

    // Award outcome
    if (xpAwarded && xpAwarded > 0) {
      await tx.user.update({
        where: { id: userId },
        data: {
          guildXp: { increment: xpAwarded },
        },
      });
    }

    // Update pity counters
    let newPityCount = user.luckyRollPityCount;
    if (outcome === 'CONSOLATION') {
      newPityCount = Math.min(newPityCount + 1, 3);
    } else {
      newPityCount = 0;
    }

    let newStreakBad = user.luckyRollStreakBad;
    if (outcome === 'CONSOLATION' || outcome === 'XP_50') {
      newStreakBad = newStreakBad + 1;
    } else {
      newStreakBad = 0;
    }

    // Increment pity year counter
    const newPityYear = user.luckyRollPityYear + 1;

    // Calculate roll number (for annual tracking)
    const rollsThisYear = await tx.luckyRoll.count({
      where: {
        userId,
        createdAt: {
          gte: new Date(new Date().getFullYear(), 0, 1),
        },
      },
    });
    const rollNumber = rollsThisYear + 1;

    // Update user counters
    await tx.user.update({
      where: { id: userId },
      data: {
        luckyRollPityCount: newPityCount,
        luckyRollPityYear: newPityYear,
        luckyRollStreakBad: newStreakBad,
        luckyRollLastRolledAt: now,
      },
    });

    // Create audit log entry
    await tx.luckyRoll.create({
      data: {
        userId,
        outcome,
        xpAwarded,
        xpSpent: 100,
        seedHash,
        rollNumber,
        pityFired,
      },
    });

    return {
      newBalance: spent.guildXp - 100 + (xpAwarded ?? 0),
      rollNumber,
    };
  });

  // Derive next roll boundary
  const nextWeekSunday = new Date(weeklyResetBoundary);
  nextWeekSunday.setUTCDate(nextWeekSunday.getUTCDate() + 7);

  return {
    outcome,
    xpAwarded,
    couponCode: outcome === 'COUPON_1' ? 'PENDING_GENERATION' : null, // Backend coupon generation will happen separately
    description,
    celebrationTier,
    rollNumber: result.rollNumber,
    pityFired: pityFired || (user.luckyRollPityCount >= 2 && outcome !== 'CONSOLATION'),
    newXpBalance: result.newBalance,
    nextRollAt: nextWeekSunday,
    rollsRemainingThisWeek: Math.max(0, weeklyLimit - rollCountThisWeek - 1),
  };
}
