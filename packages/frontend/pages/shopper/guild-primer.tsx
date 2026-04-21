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

            {/* XP Sources Table */}
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
                    <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Once per sale per day</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Item wishlist</td>
                    <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">3</td>
                    <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Once per item</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Purchase</td>
                    <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">10</td>
                    <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Flat rate</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Auction win</td>
                    <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">15</td>
                    <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Bonus for competitive wins</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Referral success</td>
                    <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">50</td>
                    <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">On referred user's first purchase</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Weekly streak</td>
                    <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">25</td>
                    <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">7-day active streak</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Challenge completion</td>
                    <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">10–50</td>
                    <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Varies by challenge</td>
                  </tr>
                  <tr className="hover:bg-warm-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-warm-900 dark:text-warm-100">Social share</td>
                    <td className="px-4 py-3 text-right font-bold text-purple-600 dark:text-purple-300">5</td>
                    <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs">Self-reported</td>
                  </tr>
                </tbody>
              </table>
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
                  a: 'No. XP never disappears. At annual reset (Jan 1), Grandmasters drop to Sage -- everyone else stays put.',
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
