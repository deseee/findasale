import React from 'react';
import Link from 'next/link';
import { ExplorerRank } from './RankBadge';

interface RankLevelingHintProps {
  rank: ExplorerRank;
  currentXp: number;
  nextRankXp: number;
  nextRank: ExplorerRank | null;
}

// Next rank unlock copy
const NEXT_RANK_UNLOCKS: Record<ExplorerRank, { unlock: string; emoji: string }> = {
  INITIATE: {
    emoji: '🔍',
    unlock: 'Scout unlock: +15 min holds, early access, Scout Reveal features',
  },
  SCOUT: {
    emoji: '🎯',
    unlock: 'Ranger unlock: +30 min holds, hold 2 items at once, Treasure Trails',
  },
  RANGER: {
    emoji: '✨',
    unlock: 'Sage unlock: +75 min holds, Leaderboard visibility, premium features',
  },
  SAGE: {
    emoji: '👑',
    unlock: 'Grandmaster unlock: All holds auto-confirm, unlimited wishlist, all cosmetics',
  },
  GRANDMASTER: {
    emoji: '🏆',
    unlock: 'You\'ve reached the top rank! Keep earning XP for exclusive rewards.',
  },
};

export const RankLevelingHint: React.FC<RankLevelingHintProps> = ({
  rank,
  currentXp,
  nextRankXp,
  nextRank,
}) => {
  if (!nextRank || rank === 'GRANDMASTER') {
    return null;
  }

  const percentToNext = (currentXp / nextRankXp) * 100;
  const xpRemaining = nextRankXp - currentXp;
  const isCloseToNext = percentToNext >= 80;
  // NEXT_RANK_UNLOCKS is keyed by current rank (it describes what unlocks on the next rank)
  const nextRankInfo = NEXT_RANK_UNLOCKS[rank];

  // Initiate-specific messaging
  if (rank === 'INITIATE') {
    return (
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">{nextRankInfo.emoji}</span>
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
              Level Up to Scout
            </h3>
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
              {nextRankInfo.unlock}
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
              <strong>Earn XP by:</strong> Scanning items at sales, making purchases (10 XP per $), or posting hauls (30 XP each)
            </p>
            <Link
              href="/sales"
              className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100"
            >
              Start exploring →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Scout near Ranger messaging
  if (rank === 'SCOUT' && isCloseToNext) {
    return (
      <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">{nextRankInfo.emoji}</span>
          <div className="flex-1">
            <h3 className="font-semibold text-purple-900 dark:text-purple-100 mb-1">
              Almost Ranger!
            </h3>
            <p className="text-sm text-purple-800 dark:text-purple-200 mb-2">
              {nextRankInfo.unlock}
            </p>
            <p className="text-xs text-purple-700 dark:text-purple-300">
              <strong>{xpRemaining.toLocaleString()} XP</strong> to go. Keep hunting!
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Default "next rank preview" for other ranks
  return (
    <div className="bg-gradient-to-r from-warm-50 to-amber-50 dark:from-gray-800 dark:to-gray-800/50 border border-warm-200 dark:border-gray-700 rounded-lg p-3 mb-6">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-lg">{nextRankInfo.emoji}</span>
        <div>
          <p className="font-semibold text-warm-900 dark:text-warm-100">
            Next: {nextRank.charAt(0) + nextRank.slice(1).toLowerCase()}
          </p>
          <p className="text-xs text-warm-600 dark:text-warm-400">
            {xpRemaining.toLocaleString()} XP remaining
          </p>
        </div>
      </div>
    </div>
  );
};

export default RankLevelingHint;
