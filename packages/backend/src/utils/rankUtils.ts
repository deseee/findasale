/**
 * Rank Perks System Utilities
 * Source of truth for all Explorer's Guild rank logic
 * No DB calls — pure functions for rank calculation and benefits lookup
 */

export type ExplorerRank = 'INITIATE' | 'SCOUT' | 'RANGER' | 'SAGE' | 'GRANDMASTER';

export interface RankBenefits {
  rank: ExplorerRank;
  holdDurationMinutes: number;
  maxConcurrentHolds: number;
  enRouteGraceHolds: number;
  wishlistSlots: number | 'unlimited';
  confirmationSkipsPerSale: number | 'all';
  autoConfirmAllHolds: boolean;
  legendaryEarlyAccessHours: number;
  maxTreasureTrails: number | 'unlimited';
  cosmetics: {
    unlocked: string[];
  };
  microSinksAvailable: {
    scoutReveal: boolean;
    haulUnboxing: boolean;
    bumpPost: boolean;
  };
}

export const RANK_THRESHOLDS: Record<ExplorerRank, number> = {
  INITIATE: 0,
  SCOUT: 500,
  RANGER: 2000,
  SAGE: 5000,
  GRANDMASTER: 12000,
};

/**
 * Calculate explorer rank from XP
 * @param guildXp Cumulative XP balance
 * @returns Explorer rank
 */
export function calculateRankFromXp(guildXp: number): ExplorerRank {
  if (guildXp < 500) return 'INITIATE';
  if (guildXp < 2000) return 'SCOUT';
  if (guildXp < 5000) return 'RANGER';
  if (guildXp < 12000) return 'SAGE';
  return 'GRANDMASTER';
}

/**
 * Get all benefits unlocked by a specific rank
 * Pure function — no DB calls, safe to call from anywhere
 */
export function getRankBenefits(rank: ExplorerRank | string = 'INITIATE'): RankBenefits {
  const normalizedRank = (rank as ExplorerRank) || 'INITIATE';

  const benefitsMap: Record<ExplorerRank, RankBenefits> = {
    INITIATE: {
      rank: 'INITIATE',
      holdDurationMinutes: 30,
      maxConcurrentHolds: 1,
      enRouteGraceHolds: 1,
      wishlistSlots: 1,
      confirmationSkipsPerSale: 0,
      autoConfirmAllHolds: false,
      legendaryEarlyAccessHours: 0,
      maxTreasureTrails: 0,
      cosmetics: { unlocked: [] },
      microSinksAvailable: {
        scoutReveal: false,
        haulUnboxing: false,
        bumpPost: false,
      },
    },
    SCOUT: {
      rank: 'SCOUT',
      holdDurationMinutes: 45,
      maxConcurrentHolds: 1,
      enRouteGraceHolds: 2,
      wishlistSlots: 3,
      confirmationSkipsPerSale: 0,
      autoConfirmAllHolds: false,
      legendaryEarlyAccessHours: 1,
      maxTreasureTrails: 0,
      cosmetics: { unlocked: ['scout_badge', 'scout_map_pin'] },
      microSinksAvailable: {
        scoutReveal: true,
        haulUnboxing: true,
        bumpPost: true,
      },
    },
    RANGER: {
      rank: 'RANGER',
      holdDurationMinutes: 60,
      maxConcurrentHolds: 2,
      enRouteGraceHolds: 2,
      wishlistSlots: 10,
      confirmationSkipsPerSale: 1,
      autoConfirmAllHolds: false,
      legendaryEarlyAccessHours: 2,
      maxTreasureTrails: 3,
      cosmetics: { unlocked: ['ranger_badge', 'ranger_map_pin', 'collector_badges'] },
      microSinksAvailable: {
        scoutReveal: true,
        haulUnboxing: true,
        bumpPost: true,
      },
    },
    SAGE: {
      rank: 'SAGE',
      holdDurationMinutes: 75,
      maxConcurrentHolds: 3,
      enRouteGraceHolds: 3,
      wishlistSlots: 15,
      confirmationSkipsPerSale: 2,
      autoConfirmAllHolds: false,
      legendaryEarlyAccessHours: 4,
      maxTreasureTrails: 'unlimited',
      cosmetics: { unlocked: ['sage_badge', 'sage_map_pin', 'collector_badges', 'leaderboard_visibility'] },
      microSinksAvailable: {
        scoutReveal: true,
        haulUnboxing: true,
        bumpPost: true,
      },
    },
    GRANDMASTER: {
      rank: 'GRANDMASTER',
      holdDurationMinutes: 90,
      maxConcurrentHolds: 3,
      enRouteGraceHolds: 3,
      wishlistSlots: 'unlimited',
      confirmationSkipsPerSale: 'all',
      autoConfirmAllHolds: true,
      legendaryEarlyAccessHours: 6,
      maxTreasureTrails: 'unlimited',
      cosmetics: { unlocked: ['grandmaster_badge', 'custom_map_pin_unlock', 'all_cosmetics_free'] },
      microSinksAvailable: {
        scoutReveal: true,
        haulUnboxing: true,
        bumpPost: true,
      },
    },
  };

  return benefitsMap[normalizedRank] || benefitsMap.INITIATE;
}

export interface RankProgressInfo {
  currentRank: ExplorerRank;
  currentXp: number;
  nextRank: ExplorerRank | null;
  nextRankXp: number;
  xpToNextRank: number;
  percentToNextRank: number;
}

/**
 * Get rank progression info for UI (next rank threshold, XP remaining)
 */
export function getRankProgressInfo(guildXp: number): RankProgressInfo {
  const currentRank = calculateRankFromXp(guildXp);

  const thresholds: Record<ExplorerRank, number> = {
    INITIATE: 0,
    SCOUT: 500,
    RANGER: 2000,
    SAGE: 5000,
    GRANDMASTER: 12000,
  };

  const nextRankMap: Record<ExplorerRank, ExplorerRank | null> = {
    INITIATE: 'SCOUT',
    SCOUT: 'RANGER',
    RANGER: 'SAGE',
    SAGE: 'GRANDMASTER',
    GRANDMASTER: null,
  };

  const nextRank = nextRankMap[currentRank];
  const nextRankXp = nextRank ? thresholds[nextRank] : Infinity;
  const xpToNextRank = Math.max(0, nextRankXp - guildXp);
  const currentRankXp = thresholds[currentRank];
  const percentToNextRank = nextRank
    ? Math.round(((guildXp - currentRankXp) / (nextRankXp - currentRankXp)) * 100)
    : 100;

  return {
    currentRank,
    currentXp: guildXp,
    nextRank,
    nextRankXp,
    xpToNextRank,
    percentToNextRank,
  };
}

// Export constants for frontend use
export const RANK_NAMES: Record<ExplorerRank, string> = {
  INITIATE: 'Initiate',
  SCOUT: 'Scout',
  RANGER: 'Ranger',
  SAGE: 'Sage',
  GRANDMASTER: 'Grandmaster',
};

export const RANK_COLORS: Record<ExplorerRank, string> = {
  INITIATE: '#6B7280',
  SCOUT: '#3B82F6',
  RANGER: '#10B981',
  SAGE: '#F59E0B',
  GRANDMASTER: '#8B5CF6',
};
