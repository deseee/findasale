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

export const RankHeroSection: React.FC<RankHeroSectionProps> = ({
  rank,
  guildXp,
  xpToNext,
  xpPercent,
  userName = 'Explorer',
}) => {
  const perks = RANK_PERKS[rank];
  const displayPerks = perks.slice(0, 4);

  return (
    <div className="bg-gradient-to-br from-sage-50 to-white dark:from-sage-900/20 dark:to-gray-800 rounded-lg border border-sage-200 dark:border-sage-700 p-8 mb-8">
      {/* Header: Rank Badge + Title */}
      <div className="flex items-start gap-6 mb-6">
        <RankBadge rank={rank} size="lg" />
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-sage-900 dark:text-sage-100 mb-1">
            {userName}
          </h1>
          <p className="text-lg text-sage-600 dark:text-sage-400 font-semibold">
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

      {/* XP Stats */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-sage-600 dark:text-sage-400">
          <span className="font-semibold text-sage-900 dark:text-sage-100">{guildXp.toLocaleString()}</span> total XP earned
        </span>
        <span className="text-sage-600 dark:text-sage-400">
          {Math.round(xpPercent)}% to next rank
        </span>
      </div>
    </div>
  );
};

export default RankHeroSection;
