/**
 * /shopper/guild-primer - Explorer's Guild Walkthrough Guide
 *
 * Complete guide to the Explorer's Guild rank system, XP earning paths,
 * seasonal adventures, and rank thresholds.
 */

import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../components/AuthContext';
import useXpProfile from '../../hooks/useXpProfile';

type ExplorerRank = 'INITIATE' | 'SCOUT' | 'RANGER' | 'SAGE' | 'GRANDMASTER';

interface RankInfo {
  rank: ExplorerRank;
  minXp: number;
  maxXp: number;
  emoji: string;
  label: string;
  milestone: string;
  perks: string[];
}

const RANK_THRESHOLDS: RankInfo[] = [
  {
    rank: 'INITIATE',
    minXp: 0,
    maxXp: 499,
    emoji: '🧭',
    label: 'Initiate',
    milestone: 'Everyone starts here',
    perks: ['Basic access', 'Start earning XP', 'Join community'],
  },
  {
    rank: 'SCOUT',
    minXp: 500,
    maxXp: 1999,
    emoji: '🔍',
    label: 'Scout',
    milestone: 'First milestone',
    perks: ['Haul posts unlocked', 'Cosmetics available', 'Boosts unlock', '1 early-access sale/week'],
  },
  {
    rank: 'RANGER',
    minXp: 2000,
    maxXp: 4999,
    emoji: '🎯',
    label: 'Ranger',
    milestone: 'Serious hunter',
    perks: ['3 early-access sales/week', 'Priority support (2hr)', 'Sourcebook access'],
  },
  {
    rank: 'SAGE',
    minXp: 5000,
    maxXp: 11999,
    emoji: '✨',
    label: 'Sage',
    milestone: 'Expert collector',
    perks: ['Unlimited early access', '48h alerts', 'Featured placement'],
  },
  {
    rank: 'GRANDMASTER',
    minXp: 12000,
    maxXp: Infinity,
    emoji: '👑',
    label: 'Grandmaster',
    milestone: 'Mastery achieved',
    perks: ['Free Hunt Pass forever', 'All Sage perks', 'Annual leaderboard'],
  },
];

const GuildPrimerPage = () => {
  const { user } = useAuth();
  const { data: xpProfile, isLoading } = useXpProfile(Boolean(user));
  const [expandedRank, setExpandedRank] = useState<ExplorerRank | null>(null);

  const currentRank = xpProfile?.explorerRank as ExplorerRank | undefined;
  const currentXp = xpProfile?.guildXp ?? 0;
  const rankProgress = xpProfile?.rankProgress;

  return (
    <>
      <Head>
        <title>Explorer's Guild - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 py-12">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <div className="text-7xl mb-4">🗺️</div>
            <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-3">
              Explorer's Guild
            </h1>
            <p className="text-xl text-warm-600 dark:text-warm-400 mb-8">
              Your Journey to Mastery
            </p>
            <p className="text-lg text-warm-600 dark:text-warm-400">
              Earn XP, climb ranks, unlock exclusive rewards. Every action counts.
            </p>

            {/* Personalized Progress Bar */}
            {user && xpProfile && rankProgress && currentRank && !isLoading && (
              <div className="mt-12 bg-white dark:bg-gray-800 rounded-lg p-8 border border-warm-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm text-warm-600 dark:text-warm-400 mb-1">Your Current Rank</p>
                    <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">
                      {RANK_THRESHOLDS.find((r) => r.rank === currentRank)?.emoji} {RANK_THRESHOLDS.find((r) => r.rank === currentRank)?.label}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-warm-600 dark:text-warm-400 mb-1">Current XP</p>
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-300">{currentXp.toLocaleString()}</p>
                  </div>
                </div>

                {rankProgress.nextRank && (
                  <>
                    <p className="text-sm text-warm-600 dark:text-warm-400 mb-2">
                      Progress to {RANK_THRESHOLDS.find((r) => r.rank === rankProgress.nextRank)?.label}
                    </p>
                    <div className="bg-warm-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden mb-2">
                      <div
                        className="bg-purple-600 dark:bg-purple-400 h-full transition-all"
                        style={{
                          width: `${Math.min(100, (rankProgress.currentXp / rankProgress.nextRankXp) * 100)}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-warm-600 dark:text-warm-400">
                      {rankProgress.currentXp.toLocaleString()} / {rankProgress.nextRankXp.toLocaleString()} XP
                    </p>
                  </>
                )}
                {!rankProgress.nextRank && (
                  <p className="text-sm text-sage-700 dark:text-sage-300 font-semibold">You've reached Grandmaster! 👑</p>
                )}
              </div>
            )}

            {!user && (
              <div className="mt-12 bg-sage-50 dark:bg-sage-900/20 border border-sage-200 dark:border-sage-700 rounded-lg p-6">
                <p className="text-warm-900 dark:text-warm-100">
                  <Link href="/login" className="font-semibold text-sage-700 dark:text-sage-300 underline hover:text-sage-800">
                    Log in
                  </Link>{' '}
                  to see your personal progress toward your next rank.
                </p>
              </div>
            )}
          </div>

          {/* The Rank Journey */}
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-8">
              The Rank Journey
            </h2>
            <div className="space-y-4">
              {RANK_THRESHOLDS.map((rankInfo) => (
                <div
                  key={rankInfo.rank}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedRank(expandedRank === rankInfo.rank ? null : rankInfo.rank)}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-4 text-left">
                      <div className="text-4xl">{rankInfo.emoji}</div>
                      <div>
                        <h3 className="text-xl font-bold text-warm-900 dark:text-warm-100">{rankInfo.label}</h3>
                        <p className="text-sm text-warm-600 dark:text-warm-400">
                          {rankInfo.minXp.toLocaleString()} – {rankInfo.maxXp === Infinity ? '∞' : rankInfo.maxXp.toLocaleString()} XP
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-sage-700 dark:text-sage-300 font-semibold mb-1">{rankInfo.milestone}</p>
                      <span className="text-warm-600 dark:text-warm-400">
                        {expandedRank === rankInfo.rank ? '−' : '+'}
                      </span>
                    </div>
                  </button>

                  {expandedRank === rankInfo.rank && (
                    <div className="px-6 py-4 bg-warm-50 dark:bg-gray-700/30 border-t border-warm-200 dark:border-gray-700">
                      <h4 className="font-semibold text-warm-900 dark:text-warm-100 mb-3">Perks:</h4>
                      <ul className="space-y-2">
                        {rankInfo.perks.map((perk, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-warm-700 dark:text-warm-300">
                            <span className="text-purple-600 dark:text-purple-400 mt-0.5">✓</span>
                            <span>{perk}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* How to Earn XP */}
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-4">
              How to Earn XP
            </h2>
            <p className="text-warm-600 dark:text-warm-400 mb-8">
              XP isn't a grind. You earn it by doing what you already love.
            </p>

            {/* Archetype Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">
                  🔍 Bargain Hunter
                </h3>
                <p className="text-warm-600 dark:text-warm-400 text-sm mb-3">
                  Visits + purchases
                </p>
                <p className="text-xs text-warm-600 dark:text-warm-400">
                  Visit 20 sales per month? You'll hit Ranger via visits alone.
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">
                  🎁 Quality Collector
                </h3>
                <p className="text-warm-600 dark:text-warm-400 text-sm mb-3">
                  High-value finds + haul posts
                </p>
                <p className="text-xs text-warm-600 dark:text-warm-400">
                  Curate your collection, earn as you go.
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">
                  🤝 Social Connector
                </h3>
                <p className="text-warm-600 dark:text-warm-400 text-sm mb-3">
                  Referrals + shares
                </p>
                <p className="text-xs text-warm-600 dark:text-warm-400">
                  Bring 10 friends = 500 XP toward Scout.
                </p>
              </div>
            </div>

            {/* Visiting & Exploring */}
            <div className="mb-8">
              <h3 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">Visiting & Exploring</h3>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-warm-100 dark:bg-gray-700">
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Action</th>
                      <th className="px-4 py-3 text-right font-semibold text-warm-900 dark:text-warm-100">XP</th>
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Sale visit</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">5</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Once per unique sale per day — no cap</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">RSVP to a sale</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">2</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Max 10 RSVPs/month</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Photo Station scan</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">5</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Per scan at organizer photo stations</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Treasure Hunt clue scan</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">3</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Per QR clue found — each clue once</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Treasure Hunt completion</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">15</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Bonus for finding all clues</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Treasure Trail complete</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">100</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">One-time per trail — all QR stops found</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Comeback bonus</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">20</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">One-time — returning after 2+ weeks away</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Buying & Bidding */}
            <div className="mb-8">
              <h3 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">Buying & Bidding</h3>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-warm-100 dark:bg-gray-700">
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Action</th>
                      <th className="px-4 py-3 text-right font-semibold text-warm-900 dark:text-warm-100">XP</th>
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Purchase</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">10</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Flat rate per completed transaction</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Auction win</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">20</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Flat bonus for competitive wins</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Item review</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">5</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Per review left on a purchased item</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Community & Content */}
            <div className="mb-8">
              <h3 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">Community & Content</h3>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-warm-100 dark:bg-gray-700">
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Action</th>
                      <th className="px-4 py-3 text-right font-semibold text-warm-900 dark:text-warm-100">XP</th>
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Haul post</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">15</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">In-app haul documentation — max 4/month</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Social share</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">5</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Share a sale or find externally — honor system</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Community valuation</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">5</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Price opinion on an item — max 20/month</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Appraisal selected</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">20</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Seller chooses your valuation — max 5/day</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Streaks, Milestones & Referrals */}
            <div className="mb-8">
              <h3 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">Streaks, Milestones & Referrals</h3>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-warm-100 dark:bg-gray-700">
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Action</th>
                      <th className="px-4 py-3 text-right font-semibold text-warm-900 dark:text-warm-100">XP</th>
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">7-day streak bonus</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">100</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Active week completion — once/month</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">30-day anniversary</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">250</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Active month milestone — once/month</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Explorer Profile complete</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">50</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">One-time — fill out specialties, categories, keywords</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Challenge completion</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">10–50</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Varies by challenge difficulty</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Referral — friend signs up</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">20</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Awarded when referred user creates an account</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Referral — friend's first purchase</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">500</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">The big payout — when they actually buy</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Organizer Bonuses */}
            <div className="mb-4">
              <h3 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">Organizer Bonuses</h3>
              <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">Running sales earns XP too — organizers are part of the Guild.</p>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-warm-100 dark:bg-gray-700">
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Action</th>
                      <th className="px-4 py-3 text-right font-semibold text-warm-900 dark:text-warm-100">XP</th>
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">First sale created</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">25</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">One-time milestone bonus</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Shopper condition rating received</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">5</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Per rating a shopper submits on your items — max 50/month</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Spend Your XP — XP Sinks */}
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-4">
              Spend Your XP — XP Sinks
            </h2>
            <p className="text-warm-600 dark:text-warm-400 mb-8">
              XP is currency. Spend it on cosmetics, gameplay boosts, organizer tools, and guild features.
            </p>

            {/* Cosmetics & Profile */}
            <div className="mb-8">
              <h3 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">Cosmetics & Profile</h3>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-warm-100 dark:bg-gray-700">
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Item</th>
                      <th className="px-4 py-3 text-right font-semibold text-warm-900 dark:text-warm-100">XP</th>
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Custom Username Color</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">1,000</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Ranger+ / Permanent</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Custom Frame Badge</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">2,500</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Sage+ / Permanent / One choice</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Custom Map Pin</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">1,000 or $10</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Organizer Scout+ / Permanent</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Profile Showcase Slot</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">250–500</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Scout+ / Permanent (Bronze 250, Silver 350, Gold 500)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Gameplay Boosts */}
            <div className="mb-8">
              <h3 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">Gameplay Boosts</h3>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-warm-100 dark:bg-gray-700">
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Item</th>
                      <th className="px-4 py-3 text-right font-semibold text-warm-900 dark:text-warm-100">XP</th>
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Rarity Boost (1 Sale)</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">50 or $0.50</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Scout+ / Until sale ends / Stackable</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Haul Visibility Boost</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">80 or $0.80</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Scout+ / 7 days</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Bounty Visibility Boost</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">50 or $0.50</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Organizer Scout+ / 7 days</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Wishlist Notification Boost</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">100 or $1.00</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Scout+ / 30 days</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Content Creation & Unlocks */}
            <div className="mb-8">
              <h3 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">Content Creation & Unlocks</h3>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-warm-100 dark:bg-gray-700">
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Item</th>
                      <th className="px-4 py-3 text-right font-semibold text-warm-900 dark:text-warm-100">XP</th>
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Seasonal Challenge Access</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">250 or $2.50</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Scout+ (non-Hunt Pass) / 1 season</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Guide Publication</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">100 or $1.00</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Ranger+ / Permanent</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Hunt Pass & Discounts */}
            <div className="mb-8">
              <h3 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">Hunt Pass & Discounts</h3>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-warm-100 dark:bg-gray-700">
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Item</th>
                      <th className="px-4 py-3 text-right font-semibold text-warm-900 dark:text-warm-100">XP</th>
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Shopper Coupon Tier 1</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">100</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Scout+ / $0.75 off $10+ / XP-only</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Shopper Coupon Tier 2</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">200</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Scout+ / $2.00 off $25+ / XP-only</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Shopper Coupon Tier 3</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">500</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Scout+ / $5.00 off $50+ / XP-only</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Hunt Pass Discount</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">100</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Scout+ / $1 off one month / One-time</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Early Access Cache</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">100</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Account age 30+ days / Weekly gacha spin</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Guild & Social */}
            <div className="mb-8">
              <h3 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">Guild & Social</h3>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-warm-100 dark:bg-gray-700">
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Item</th>
                      <th className="px-4 py-3 text-right font-semibold text-warm-900 dark:text-warm-100">XP</th>
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Guild/Crew Creation</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">500</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">One-time / Max 50 members / XP-only</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Organizer Features */}
            <div className="mb-8">
              <h3 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">Organizer Features</h3>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-warm-100 dark:bg-gray-700">
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Item</th>
                      <th className="px-4 py-3 text-right font-semibold text-warm-900 dark:text-warm-100">XP</th>
                      <th className="px-4 py-3 text-left font-semibold text-warm-900 dark:text-warm-100">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Sale Bump</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">100 or $1.00</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Organizer Scout+ / 1 hour</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Early Access Boost</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">200 or $2.00</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Organizer Elite+ / 1 week</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Listings Extension (10 listings)</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">250 or $2.50</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Organizer Trusted+ / 1 month</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Event Sponsorship (7-day)</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">1,000 or $10</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Organizer Elite+ / 7 days</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Event Sponsorship (14-day)</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">1,800 or $18</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Organizer Elite+ / 14 days</td>
                    </tr>
                    <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Treasure Trail Sponsor</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">150 or $1.50</td>
                      <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Organizer Scout+ / Per trail</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Seasonal Adventures */}
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-4">
              Seasonal Adventures
            </h2>
            <p className="text-warm-600 dark:text-warm-400 mb-8">
              Every season brings new challenges, cosmetics, and a fresh leaderboard. Your rank never resets -- your competition does.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-6 border border-green-200 dark:border-green-700">
                <div className="text-4xl mb-3">🌱</div>
                <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">Q1: Spring Awakening</h3>
                <p className="text-sm text-warm-600 dark:text-warm-400">Find treasures across 3 sale types. Celebrate spring renewals.</p>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-700">
                <div className="text-4xl mb-3">☀️</div>
                <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">Q2: Summer Exploration</h3>
                <p className="text-sm text-warm-600 dark:text-warm-400">Explore new regions and sale formats.</p>
              </div>

              <div className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-lg p-6 border border-orange-200 dark:border-orange-700">
                <div className="text-4xl mb-3">🍂</div>
                <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">Q3: Fall Collection</h3>
                <p className="text-sm text-warm-600 dark:text-warm-400">Curate your specialty. Earn category mastery.</p>
              </div>

              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-lg p-6 border border-indigo-200 dark:border-indigo-700">
                <div className="text-4xl mb-3">❄️</div>
                <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">Q4: Winter Treasures</h3>
                <p className="text-sm text-warm-600 dark:text-warm-400">Reflect on the year's best finds. Share your top hauls.</p>
              </div>
            </div>
          </div>

          {/* The Prestige Layer */}
          <div className="mb-16 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-8 border-2 border-purple-200 dark:border-purple-700">
            <div className="flex items-start gap-4 mb-6">
              <div className="text-5xl">👑</div>
              <div>
                <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100">What Separates the Best</h2>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-1">Loot Legend Status</h3>
                <p className="text-sm text-warm-600 dark:text-warm-400">
                  Your best finds become a permanent public collection. Your rank appears next to your name everywhere.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-1">Presales & Exclusives</h3>
                <p className="text-sm text-warm-600 dark:text-warm-400">
                  Sage shoppers see the best sales 24 hours early. Grandmasters get 48 hours.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-warm-900 dark:text-warm-100 mb-1">Grandmaster Forever</h3>
                <p className="text-sm text-warm-600 dark:text-warm-400">
                  Grandmaster isn't about winning. It's about mastery. You've attended hundreds of sales, found rare gems, helped other hunters. That's what the badge means.
                </p>
              </div>
            </div>
          </div>

          {/* FAQ */}
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-8">
              Frequently Asked Questions
            </h2>

            <div className="space-y-4">
              {[
                {
                  q: 'Do I need Hunt Pass to earn XP?',
                  a: 'No. XP is free for all users. Hunt Pass gives you a 1.5x XP multiplier and seasonal challenge access.',
                },
                {
                  q: 'Can I lose my rank?',
                  a: 'At the annual reset (January 1st), everyone drops one tier — Grandmaster becomes Sage, Sage becomes Ranger, Ranger becomes Scout, Scout becomes Initiate. Your XP resets to the floor of your new rank. The soft floor means you can never drop more than one tier. One exception: if you reached Grandmaster, your free Hunt Pass stays with you for life.',
                },
                {
                  q: "What's the fastest path to Scout?",
                  a: 'Visit 5 sales + make 2 purchases + refer 3 friends. You can hit 500 XP in a few weekends.',
                },
                {
                  q: 'Is this worth it if I only go to 5 sales a month?',
                  a: 'Yes. 5 visits = 25 XP/month. Add a purchase or two and a referral -- you\'ll reach Scout inside a year.',
                },
                {
                  q: 'What happens when I reach Grandmaster?',
                  a: 'Free Hunt Pass forever. That\'s yours to keep, regardless of future activity.',
                },
              ].map((faq, idx) => (
                <details key={idx} className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-warm-200 dark:border-gray-700">
                  <summary className="font-semibold text-warm-900 dark:text-warm-100 cursor-pointer">
                    {faq.q}
                  </summary>
                  <p className="text-warm-600 dark:text-warm-400 mt-3">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>

          {/* Bottom CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/shopper/dashboard">
              <button className="py-3 px-8 bg-sage-600 hover:bg-sage-700 text-white font-bold rounded-lg transition-colors">
                Start My Journey
              </button>
            </Link>
            <Link href="/shopper/hunt-pass">
              <button className="py-3 px-8 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors">
                Learn About Hunt Pass
              </button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default GuildPrimerPage;
