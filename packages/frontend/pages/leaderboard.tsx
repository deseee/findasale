import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { GetStaticProps } from 'next';
import { useAuth } from '../components/AuthContext';

interface ShopperRank {
  rank: number;
  userId: string;
  name: string;
  score: number;
  explorerRank: string;
  huntPassActive?: boolean;
  badges?: Array<{
    id: string;
    name: string;
    iconUrl: string | null;
    awardedAt: string;
  }>;
}

interface OrganizerRank {
  rank: number;
  organizerId: string;
  organizerName: string;
  completedSales: number;
  totalItemsSold: number;
}

interface ScoutRank {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  count: number;
  isCurrentUser: boolean;
}

interface LeaderboardPageProps {
  initialShoppers: ShopperRank[];
  initialOrganizers: OrganizerRank[];
  initialScouts: ScoutRank[];
  initialScoutSeason: string;
  initialScoutResetDate: string;
}

const Leaderboard = ({
  initialShoppers,
  initialOrganizers,
  initialScouts,
  initialScoutSeason,
}: LeaderboardPageProps) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'shoppers' | 'organizers' | 'scouts'>('shoppers');

  // ISR-seeded initial data — no loading spinner on first render
  const shoppers = initialShoppers;
  const organizers = initialOrganizers;
  // Mark the current user's scout entry client-side (userId is only known after auth)
  const scouts: ScoutRank[] = initialScouts.map((s) => ({
    ...s,
    isCurrentUser: user ? s.userId === user.id : false,
  }));
  const scoutSeason = initialScoutSeason;

  const defaultCity = process.env.NEXT_PUBLIC_DEFAULT_CITY || 'your area';

  const getMedalEmoji = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  const getRankColor = (rank: number): string => {
    if (rank === 1) return 'from-amber-100 to-amber-50';
    if (rank === 2) return 'from-slate-100 to-slate-50';
    if (rank === 3) return 'from-orange-100 to-orange-50';
    return 'from-warm-50 to-white';
  };

  return (
    <>
      <Head>
        <title>City Leaderboards - FindA.Sale</title>
        <meta name="description" content={`Top shoppers and organizers in ${defaultCity}`} />
      </Head>

      <main id="main-content" className="min-h-screen bg-gradient-to-b from-warm-50 to-white dark:from-gray-900 dark:to-gray-800 py-8">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">City Leaderboards</h1>
            <p className="text-lg text-warm-600 dark:text-warm-400">
              Celebrating the top local shoppers and organizers
            </p>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-4 mb-8 border-b border-warm-300 dark:border-gray-700 dark:bg-gray-800 dark:text-warm-100">
            <button
              onClick={() => setActiveTab('shoppers')}
              className={`px-6 py-3 font-semibold transition-colors ${
                activeTab === 'shoppers'
                  ? 'text-amber-600 border-b-2 border-amber-600'
                  : 'text-warm-600 dark:text-warm-400 hover:text-warm-900'
              }`}
            >
              Top Shoppers
            </button>
            <button
              onClick={() => setActiveTab('organizers')}
              className={`px-6 py-3 font-semibold transition-colors ${
                activeTab === 'organizers'
                  ? 'text-amber-600 border-b-2 border-amber-600'
                  : 'text-warm-600 dark:text-warm-400 hover:text-warm-900'
              }`}
            >
              Top Organizers
            </button>
            <button
              onClick={() => setActiveTab('scouts')}
              className={`px-6 py-3 font-semibold transition-colors ${
                activeTab === 'scouts'
                  ? 'text-amber-600 border-b-2 border-amber-600'
                  : 'text-warm-600 dark:text-warm-400 hover:text-warm-900'
              }`}
            >
              Scout Leaderboard
            </button>
          </div>

          {/* Shoppers Tab */}
          {activeTab === 'shoppers' && (
            <div className="space-y-3">
              {shoppers.length === 0 ? (
                <div className="text-center py-12 bg-warm-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-warm-600 dark:text-warm-400">No shoppers yet. Be the first to earn badges!</p>
                </div>
              ) : (
                shoppers.map((shopper) => (
                  <div
                    key={shopper.userId}
                    className={`bg-gradient-to-r ${getRankColor(shopper.rank)} dark:from-gray-800 dark:to-gray-700 rounded-lg p-4 border border-warm-200 dark:border-gray-700 transition-transform hover:scale-102`}
                  >
                    <div className="flex items-center justify-between">
                      {/* Rank and Name */}
                      <div className="flex items-center gap-4 flex-1">
                        <div className="text-3xl font-bold text-amber-600 w-12 text-center">
                          {getMedalEmoji(shopper.rank)}
                        </div>
                        <div>
                          <p className="text-warm-900 dark:text-warm-100 font-semibold text-lg">
                            {shopper.name}
                            {shopper.huntPassActive && (
                              <span className="ml-1.5" title="Hunt Pass subscriber">🏆</span>
                            )}
                          </p>
                          <p className="text-sm text-warm-600 dark:text-warm-400">{shopper.explorerRank}</p>
                        </div>
                      </div>

                      {/* Score */}
                      <div className="text-center mr-6">
                        <p className="text-2xl font-bold text-amber-600">{shopper.score}</p>
                        <p className="text-xs text-warm-600 dark:text-warm-400">XP</p>
                      </div>

                      {/* Badges */}
                      <div className="flex gap-2">
                        {(shopper.badges?.length ?? 0) > 0 ? (
                          shopper.badges?.slice(0, 3).map((badge) => (
                            <div
                              key={badge.id}
                              title={badge.name}
                              className="flex items-center justify-center w-10 h-10 rounded-full bg-warm-200 border border-warm-300 dark:border-gray-700 dark:bg-gray-800 dark:text-warm-100 text-lg"
                            >
                              {badge.iconUrl ? (
                                <img
                                  src={badge.iconUrl}
                                  alt={badge.name}
                                  className="w-full h-full rounded-full object-cover"
                                />
                              ) : (
                                <span>🏅</span>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-warm-500 dark:text-warm-400">No badges yet</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Organizers Tab */}
          {activeTab === 'organizers' && (
            <div className="space-y-3">
              {organizers.length === 0 ? (
                <div className="text-center py-12 bg-warm-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-warm-600 dark:text-warm-400">No organizers yet.</p>
                </div>
              ) : (
                organizers.map((org) => (
                  <div
                    key={org.organizerId}
                    className={`bg-gradient-to-r ${getRankColor(org.rank)} dark:from-gray-800 dark:to-gray-700 rounded-lg p-4 border border-warm-200 dark:border-gray-700 transition-transform hover:scale-102`}
                  >
                    <div className="flex items-center justify-between">
                      {/* Rank and Name */}
                      <div className="flex items-center gap-4 flex-1">
                        <div className="text-3xl font-bold text-amber-600 w-12 text-center">
                          {getMedalEmoji(org.rank)}
                        </div>
                        <div>
                          <Link
                            href={`/organizers/${org.organizerId}`}
                            className="text-warm-900 dark:text-warm-100 font-semibold text-lg hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
                          >
                            {org.organizerName}
                          </Link>
                          <p className="text-sm text-warm-600 dark:text-warm-400">
                            {org.completedSales} sale{org.completedSales !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>

                      {/* Items Sold */}
                      {org.totalItemsSold > 0 && (
                        <div className="text-center">
                          <p className="text-2xl font-bold text-amber-600">{org.totalItemsSold}</p>
                          <p className="text-xs text-warm-600 dark:text-warm-400">items sold</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Scouts Tab */}
          {activeTab === 'scouts' && (
            <div>
              <div className="space-y-3">
                {scouts.length === 0 ? (
                  <div className="text-center py-12 bg-warm-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-warm-600 dark:text-warm-400">No scouts yet. Introduce organizers to earn a spot!</p>
                  </div>
                ) : (
                  scouts.map((scout) => (
                    <div
                      key={scout.userId}
                      className={`bg-gradient-to-r ${getRankColor(scout.rank)} dark:from-gray-800 dark:to-gray-700 rounded-lg p-4 border border-warm-200 dark:border-gray-700 transition-transform hover:scale-102 ${
                        scout.isCurrentUser ? 'ring-2 ring-amber-500' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        {/* Rank and Name */}
                        <div className="flex items-center gap-4 flex-1">
                          <div className="text-3xl font-bold text-amber-600 w-12 text-center">
                            {getMedalEmoji(scout.rank)}
                          </div>
                          <div>
                            <p className="text-warm-900 dark:text-warm-100 font-semibold text-lg">
                              {scout.displayName}
                              {scout.isCurrentUser && (
                                <span className="text-sm text-amber-600 font-normal ml-2">(You)</span>
                              )}
                            </p>
                            <p className="text-sm text-warm-600 dark:text-warm-400">Scout</p>
                          </div>
                        </div>

                        {/* Organizers Introduced */}
                        <div className="text-center">
                          <p className="text-2xl font-bold text-amber-600">{scout.count}</p>
                          <p className="text-xs text-warm-600 dark:text-warm-400">
                            organizer{scout.count !== 1 ? 's' : ''} introduced
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Resets Jan 1 · Top 10 scouts earn XP at season end · {scoutSeason ? `Season ${scoutSeason}` : ''}
                </p>
              </div>
            </div>
          )}

          {/* Footer Note */}
          <div className="mt-12 bg-sage-50 dark:bg-gray-800 border border-sage-200 dark:border-gray-700 rounded-lg p-6 text-center">
            <p className="text-warm-700 dark:text-warm-300">
              The leaderboard updates daily based on activity. Complete sales, earn badges, and climb the ranks!
            </p>
          </div>
        </div>
      </main>
    </>
  );
};

export const getStaticProps: GetStaticProps<LeaderboardPageProps> = async () => {
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

  const empty: LeaderboardPageProps = {
    initialShoppers: [],
    initialOrganizers: [],
    initialScouts: [],
    initialScoutSeason: '',
    initialScoutResetDate: '',
  };

  try {
    const [shoppersRes, organizersRes, scoutsRes] = await Promise.allSettled([
      fetch(`${apiBase}/leaderboard/shoppers`),
      fetch(`${apiBase}/leaderboard/organizers`),
      fetch(`${apiBase}/leaderboard/scouts`),
    ]);

    const shoppers: ShopperRank[] =
      shoppersRes.status === 'fulfilled' && shoppersRes.value.ok
        ? await shoppersRes.value.json()
        : [];

    const organizers: OrganizerRank[] =
      organizersRes.status === 'fulfilled' && organizersRes.value.ok
        ? await organizersRes.value.json()
        : [];

    let scouts: ScoutRank[] = [];
    let scoutSeason = '';
    let scoutResetDate = '';
    if (scoutsRes.status === 'fulfilled' && scoutsRes.value.ok) {
      const scoutData = await scoutsRes.value.json();
      scouts = scoutData.entries ?? [];
      scoutSeason = scoutData.season ?? '';
      scoutResetDate = scoutData.resetDate ?? '';
    }

    return {
      props: {
        initialShoppers: shoppers,
        initialOrganizers: organizers,
        initialScouts: scouts,
        initialScoutSeason: scoutSeason,
        initialScoutResetDate: scoutResetDate,
      },
      revalidate: 21600, // ISR: 6h (widened from 1h 2026-07-27 -- Fluid Active CPU reduction, Patrick-approved; gamification standings tolerate hours of staleness fine
    };
  } catch {
    return { props: empty, revalidate: 300 };
  }
};

export default Leaderboard;
