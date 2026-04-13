import React from 'react';
import Link from 'next/link';
import RankBadge, { ExplorerRank } from './RankBadge';
import RankProgressBar from './RankProgressBar';

interface RankHeroSectionProps {
  rank: ExplorerRank;
  guildXp: number;
  xpToNext: number;
  xpPercent: number;
  userName?: string;
  xpToNextRank?: number; // Amount of XP needed to reach next rank
}

// Rank-specific perks (top 4-5 for display)
const RANK_PERKS: Record<ExplorerRank, string[]> = {
  INITIATE: ['Hold items for 30 minutes', 'Save 1 item to wishlist'],
  SCOUT: [
    'Hold items for 45 minutes',
    'Save up to 3 items',
    '1-hour early access to Legendary items',
    'Scout Reveal + Haul Unboxing unlocked',
  ],
  RANGER: [
    'Hold items for 60 minutes',
    'Hold 2 items at once',
    '2-hour early access',
    'Save up to 10 items',
    'Treasure Trails: 3/week',
  ],
  SAGE: [
    'Hold items for 75 minutes',
    'Hold 3 items at once',
    '4-hour early access',
    'Leaderboard visibility',
    'Treasure Trails: unlimited',
  ],
  GRANDMASTER: [
    'Hold items for 90 minutes',
    'All holds auto-confirm',
    '6-hour early access',
    'Unlimited wishlist',
    'All cosmetics unlocked',
  ],
};

// Rank thresholds for XP progress (must match backend RANK_THRESHOLDS)
const RANK_THRESHOLDS: Record<ExplorerRank, number> = {
  INITIATE: 0,
  SCOUT: 500,
  RANGER: 2000,
  SAGE: 5000,
  GRANDMASTER: 12000,
};

// Rank-specific hero section styles (gradient background and border colors)
const getRankHeroStyles = (rank: ExplorerRank): string => {
  switch (rank) {
    case 'INITIATE':
      return 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-700/40';
    case 'SCOUT':
      return 'bg-gradient-to-r from-green-50 to-teal-50 dark:from-green-900/20 dark:to-teal-900/20 border-green-300 dark:border-green-700/40';
    case 'RANGER':
      return 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-300 dark:border-blue-700/40';
    case 'SAGE':
      return 'bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-purple-300 dark:border-purple-700/40';
    case 'GRANDMASTER':
      return 'bg-gradient-to-r from-gray-900 to-gray-800 dark:from-gray-800 dark:to-slate-700 border-yellow-400 dark:border-yellow-400';
  }
};

// Rank-specific text colors for title and subtitle
const getRankTextColors = (
  rank: ExplorerRank,
): { title: string; subtitle: string } => {
  switch (rank) {
    case 'INITIATE':
      return {
        title: 'text-amber-900 dark:text-amber-200',
        subtitle: 'text-amber-600 dark:text-amber-400',
      };
    case 'SCOUT':
      return {
        title: 'text-green-900 dark:text-green-200',
        subtitle: 'text-green-600 dark:text-green-400',
      };
    case 'RANGER':
      return {
        title: 'text-blue-900 dark:text-blue-200',
        subtitle: 'text-blue-600 dark:text-blue-400',
      };
    case 'SAGE':
      return {
        title: 'text-purple-900 dark:text-purple-200',
        subtitle: 'text-purple-600 dark:text-purple-400',
      };
    case 'GRANDMASTER':
      return {
        title: 'text-yellow-400 dark:text-yellow-300',
        subtitle: 'text-yellow-300 dark:text-yellow-400',
      };
  }
};

// Next rank unlock preview copy
const NEXT_RANK_PERKS: Record<ExplorerRank, string> = {
  INITIATE:
    'Scout Reveal, longer holds, and 3 wishlist slots',
  SCOUT:
    '60-min holds, 2 concurrent holds, and Treasure Trails',
  RANGER:
    '75-min holds, 3 concurrent holds, and 4-hour early access',
  SAGE:
    'auto-confirm holds, 6-hour early access, all cosmetics free',
  GRANDMASTER: 'Peak rank achieved — all perks unlocked 👑',
};

export const RankHeroSection: React.FC<RankHeroSectionProps> = ({
  rank,
  guildXp,
  xpToNext,
  xpPercent,
  userName = 'Explorer',
  xpToNextRank = 0,
}) => {
  const perks = RANK_PERKS[rank];
  const displayPerks = perks.slice(0, 4);
  const textColors = getRankTextColors(rank);
  const nextThreshold = rank === 'GRANDMASTER' ? RANK_THRESHOLDS.GRANDMASTER : RANK_THRESHOLDS[rank];
  const nextRankThreshold = rank === 'INITIATE' ? RANK_THRESHOLDS.SCOUT :
                            rank === 'SCOUT' ? RANK_THRESHOLDS.RANGER :
                            rank === 'RANGER' ? RANK_THRESHOLDS.SAGE :
                            rank === 'SAGE' ? RANK_THRESHOLDS.GRANDMASTER :
                            RANK_THRESHOLDS.GRANDMASTER;
  const calculatedXpToNext = Math.max(0, nextRankThreshold - guildXp);

  return (
    <div className={`rounded-lg border-2 p-8 mb-8 ${getRankHeroStyles(rank)}`}>
      {/* Header: Rank Badge + Title */}
      <div className="flex items-start gap-6 mb-6">
        <RankBadge rank={rank} size="lg" />
        <div className="flex-1">
          <h1 className={`text-3xl font-bold ${textColors.title} mb-1`}>
            {userName}
          </h1>
          <p className={`text-lg ${textColors.subtitle} font-semibold`}>
            {rank.charAt(0) + rank.slice(1).toLowerCase()} Explorer
          </p>
        </div>
      </div>

      {/* XP Progress */}
      <div className="mb-6">
        <RankProgressBar
          currentXp={guildXp}
          nextRankXp={xpToNext}
          currentRank={rank}
          nextRank={rank === 'GRANDMASTER' ? null : ('UNKNOWN' as ExplorerRank)} // nextRank determined by parent
        />
      </div>

      {/* Current Rank Perks */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-sage-900 dark:text-sage-100 mb-3">
          Your Current Perks
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {displayPerks.map((perk, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 p-2 bg-white dark:bg-gray-800/50 rounded border border-sage-100 dark:border-sage-800"
            >
              <span className="text-sage-600 dark:text-sage-400 text-lg flex-shrink-0">✓</span>
              <span className="text-sm text-sage-700 dark:text-sage-300">{perk}</span>
            </div>
          ))}
        </div>
        <Link
          href="/shopper/ranks"
          className="text-sm font-semibold text-sage-700 hover:text-sage-900 dark:text-sage-300 dark:hover:text-sage-100 mt-3 inline-flex items-center gap-1"
        >
          See all perks →
        </Link>
      </div>

      {/* XP Stats & Next Rank Preview */}
      <div className="mt-6 space-y-2">
        {rank === 'GRANDMASTER' ? (
          <div>
            <p className={`text-lg font-semibold ${textColors.title}`}>
              {NEXT_RANK_PERKS.GRANDMASTER}
            </p>
          </div>
        ) : (
          <div>
            <p className={`text-base font-semibold ${textColors.title}`}>
              {calculatedXpToNext.toLocaleString()} XP to{' '}
              {rank === 'INITIATE'
                ? 'Scout'
                : rank === 'SCOUT'
                  ? 'Ranger'
                  : rank === 'RANGER'
                    ? 'Sage'
                    : 'Grandmaster'}{' '}
              — unlock {NEXT_RANK_PERKS[rank]}
            </p>
            <p className={`text-xs ${textColors.subtitle}`}>
              {guildXp.toLocaleString()} / {nextRankThreshold.toLocaleString()} XP
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RankHeroSection;
