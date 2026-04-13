/**
 * Feature: Explorer Rank Benefits Page
 * Page: /shopper/ranks
 * - Display all 5 Explorer ranks with perks
 * - Highlight user's current rank
 * - Show unlock thresholds and progress
 */

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '@/components/AuthContext';
import useXpProfile from '@/hooks/useXpProfile';
import { ExplorerRank } from '@/components/RankBadge';
import { Check } from 'lucide-react';

// Rank metadata
const RANK_ORDER: ExplorerRank[] = ['INITIATE', 'SCOUT', 'RANGER', 'SAGE', 'GRANDMASTER'];

const RANK_CONFIG: Record<
  ExplorerRank,
  {
    emoji: string;
    label: string;
    threshold: number;
    borderColor: string;
    borderColorDark: string;
    bgTint: string;
    bgTintDark: string;
  }
> = {
  INITIATE: {
    emoji: '🌱',
    label: 'Initiate',
    threshold: 0,
    borderColor: 'border-gray-400',
    borderColorDark: 'dark:border-gray-500',
    bgTint: 'bg-gray-50',
    bgTintDark: 'dark:bg-gray-800/30',
  },
  SCOUT: {
    emoji: '🔍',
    label: 'Scout',
    threshold: 500,
    borderColor: 'border-blue-400',
    borderColorDark: 'dark:border-blue-500',
    bgTint: 'bg-blue-50',
    bgTintDark: 'dark:bg-blue-900/20',
  },
  RANGER: {
    emoji: '🎯',
    label: 'Ranger',
    threshold: 2000,
    borderColor: 'border-emerald-400',
    borderColorDark: 'dark:border-emerald-500',
    bgTint: 'bg-emerald-50',
    bgTintDark: 'dark:bg-emerald-900/20',
  },
  SAGE: {
    emoji: '✨',
    label: 'Sage',
    threshold: 5000,
    borderColor: 'border-amber-400',
    borderColorDark: 'dark:border-amber-500',
    bgTint: 'bg-amber-50',
    bgTintDark: 'dark:bg-amber-900/20',
  },
  GRANDMASTER: {
    emoji: '👑',
    label: 'Grandmaster',
    threshold: 12000,
    borderColor: 'border-purple-400',
    borderColorDark: 'dark:border-purple-500',
    bgTint: 'bg-purple-50',
    bgTintDark: 'dark:bg-purple-900/20',
  },
};

const RANK_PERKS: Record<ExplorerRank, string[]> = {
  INITIATE: [
    'Hold items for 30 minutes',
    'Save 1 item to your wishlist',
  ],
  SCOUT: [
    'Hold items for 45 minutes',
    'Save up to 3 items to your wishlist',
    '1-hour early access to Legendary items',
    'Scout Reveal, Haul Unboxing & Bump Post unlocked',
    'Scout badge & map pin cosmetics',
  ],
  RANGER: [
    'Hold items for 60 minutes',
    'Hold 2 items at the same time',
    '2-hour early access to Legendary items',
    'Save up to 10 items to your wishlist',
    'Auto-confirm 1 item per sale',
    'Treasure Trails: 3 per week',
    'Ranger badge, map pin & collector badges',
  ],
  SAGE: [
    'Hold items for 75 minutes',
    'Hold 3 items at the same time',
    '4-hour early access to Legendary items',
    'Save up to 15 items to your wishlist',
    'Auto-confirm 2 items per sale',
    'Leaderboard visibility & Hall of Fame eligibility',
    'Treasure Trails: unlimited',
    'Sage badge, map pin & profile colors',
  ],
  GRANDMASTER: [
    'Hold items for 90 minutes',
    'Hold 3 items at the same time',
    '6-hour early access to Legendary items',
    'Unlimited wishlist',
    'All holds auto-confirm automatically',
    'Permanent Hall of Fame eligibility',
    'All cosmetics unlocked for free',
    'Treasure Trails: unlimited',
  ],
};

function formatXp(xp: number): string {
  return xp.toLocaleString();
}

interface RankCardProps {
  rank: ExplorerRank;
  isCurrentRank: boolean;
  isLocked: boolean;
  userXp: number;
  xpToUnlock?: number;
}

const RankCard: React.FC<RankCardProps> = ({
  rank,
  isCurrentRank,
  isLocked,
  userXp,
  xpToUnlock,
}) => {
  const config = RANK_CONFIG[rank];
  const perks = RANK_PERKS[rank];
  const threshold = config.threshold;

  return (
    <div
      className={`
        border-l-4 rounded-lg p-6 transition-all
        ${isCurrentRank
          ? `${config.borderColor} ${config.borderColorDark} ${config.bgTint} ${config.bgTintDark} bg-white dark:bg-gray-800`
          : isLocked
            ? `border-gray-300 dark:border-gray-600 opacity-60 bg-white dark:bg-gray-800 border-l-4`
            : `${config.borderColor} ${config.borderColorDark} bg-white dark:bg-gray-800`
        }
      `}
    >
      {/* Header: Rank badge + name + threshold */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-4xl">{config.emoji}</span>
          <div>
            <h2 className={`text-2xl font-bold ${isLocked ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>
              {config.label}
            </h2>
            <p className={`text-sm ${isLocked ? 'text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-400'}`}>
              {formatXp(threshold)} XP
            </p>
          </div>
        </div>
        {isCurrentRank && (
          <div className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold rounded-full">
            📍 Your rank
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-gray-200 dark:bg-gray-700 my-4" />

      {/* Perks list */}
      <div className={`space-y-3 mb-6 ${isLocked ? 'opacity-70' : ''}`}>
        {perks.map((perk, idx) => (
          <div key={idx} className="flex items-start gap-3">
            <Check
              size={18}
              className={`flex-shrink-0 mt-0.5 ${
                isLocked
                  ? 'text-gray-400 dark:text-gray-500'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            />
            <span
              className={`text-sm ${
                isLocked
                  ? 'text-gray-600 dark:text-gray-400'
                  : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              {perk}
            </span>
          </div>
        ))}
      </div>

      {/* Footer: Status message */}
      {isCurrentRank && rank === 'GRANDMASTER' && (
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm font-semibold text-purple-700 dark:text-purple-400">
            You've reached the peak! 👑 Legendary explorer status unlocked.
          </p>
        </div>
      )}

      {isLocked && xpToUnlock && xpToUnlock > 0 && (
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Unlock at{' '}
            <span className="font-semibold text-gray-900 dark:text-white">
              {formatXp(threshold)}
            </span>{' '}
            XP
            <br />
            <span className="text-xs text-gray-500 dark:text-gray-500">
              {formatXp(xpToUnlock)} XP to go
            </span>
          </p>
        </div>
      )}

      {!isCurrentRank && !isLocked && (
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            You've unlocked this rank!
          </p>
        </div>
      )}
    </div>
  );
};

function RanksPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { data: xpProfile, isLoading: xpLoading } = useXpProfile(!!user);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect if not authenticated
  if (mounted && !authLoading && !user) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4">
        <Head>
          <title>Explorer Ranks | FindA.Sale</title>
        </Head>
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Explorer Rank Benefits
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Sign in to view your rank and unlock exclusive perks.
          </p>
          <Link
            href="/login"
            className="inline-block px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (authLoading || xpLoading || !mounted) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4">
        <Head>
          <title>Explorer Ranks | FindA.Sale</title>
        </Head>
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">Loading your ranks...</p>
        </div>
      </div>
    );
  }

  const currentXp = xpProfile?.guildXp ?? 0;
  const currentRank = xpProfile?.explorerRank ?? 'INITIATE';

  return (
    <>
      <Head>
        <title>Explorer Rank Benefits | FindA.Sale</title>
        <meta name="description" content="Explore all Explorer rank benefits and unlock exclusive perks." />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Page Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">
              Explorer Rank Benefits
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Climb the ranks and unlock exclusive perks
            </p>
          </div>

          {/* Current XP Display */}
          {user && (
            <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6 mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Your Guild XP</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {formatXp(currentXp)} XP
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Current Rank: <span className="font-semibold text-gray-900 dark:text-white">{RANK_CONFIG[currentRank].label}</span>
                  </p>
                </div>
                <div className="text-5xl">{RANK_CONFIG[currentRank].emoji}</div>
              </div>
            </div>
          )}

          {/* Rank Cards Stack */}
          <div className="space-y-6">
            {RANK_ORDER.map((rank) => {
              const config = RANK_CONFIG[rank];
              const isCurrentRank = rank === currentRank;
              const isLocked = currentXp < config.threshold;
              const xpToUnlock = isLocked ? config.threshold - currentXp : 0;

              return (
                <RankCard
                  key={rank}
                  rank={rank}
                  isCurrentRank={isCurrentRank}
                  isLocked={isLocked}
                  userXp={currentXp}
                  xpToUnlock={xpToUnlock}
                />
              );
            })}
          </div>

          {/* Back to Loyalty Link */}
          <div className="text-center mt-12">
            <Link
              href="/shopper/loyalty"
              className="inline-block text-amber-600 dark:text-amber-400 hover:underline font-semibold"
            >
              ← Back to Loyalty Passport
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

export default RanksPage;
