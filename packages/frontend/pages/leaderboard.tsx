import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Layout from '../components/Layout';
import { useAuth } from '../components/AuthContext';

interface ShopperRank {
  rank: number;
  userId: string;
  name: string;
  city: string | null;
  score: number;
  badges: Array<{
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

const Leaderboard = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'shoppers' | 'organizers'>('shoppers');
  const [shoppers, setShoppers] = useState<ShopperRank[]>([]);
  const [organizers, setOrganizers] = useState<OrganizerRank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLeaderboards();
  }, []);

  const fetchLeaderboards = async () => {
    try {
      setLoading(true);
      setError(null);

      const [shoppersRes, organizersRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/leaderboard/shoppers`),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/leaderboard/organizers`),
      ]);

      if (!shoppersRes.ok || !organizersRes.ok) {
        throw new Error('Failed to fetch leaderboard data');
      }

      const shoppersData = await shoppersRes.json();
      const organizersData = await organizersRes.json();

      setShoppers(shoppersData);
      setOrganizers(organizersData);
    } catch (err) {
      console.error('Error fetching leaderboards:', err);
      setError('Failed to load leaderboard data');
    } finally {
      setLoading(false);
    }
  };

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
    <Layout>
      <Head>
        <title>City Leaderboards - FindA.Sale</title>
        <meta name="description" content="Top shoppers and organizers in Grand Rapids" />
      </Head>

      <main id="main-content" className="min-h-screen bg-gradient-to-b from-warm-50 to-white py-8">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-warm-900 mb-2">City Leaderboards</h1>
            <p className="text-lg text-warm-600">
              Celebrating the top shoppers and organizers in Grand Rapids
            </p>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-4 mb-8 border-b border-warm-300">
            <button
              onClick={() => setActiveTab('shoppers')}
              className={`px-6 py-3 font-semibold transition-colors ${
                activeTab === 'shoppers'
                  ? 'text-amber-600 border-b-2 border-amber-600'
                  : 'text-warm-600 hover:text-warm-900'
              }`}
            >
              Top Shoppers
            </button>
            <button
              onClick={() => setActiveTab('organizers')}
              className={`px-6 py-3 font-semibold transition-colors ${
                activeTab === 'organizers'
                  ? 'text-amber-600 border-b-2 border-amber-600'
                  : 'text-warm-600 hover:text-warm-900'
              }`}
            >
              Top Organizers
            </button>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="text-center py-12">
              <p className="text-warm-600">Loading leaderboard data...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {/* Shoppers Tab */}
          {!loading && activeTab === 'shoppers' && (
            <div className="space-y-3">
              {shoppers.length === 0 ? (
                <div className="text-center py-12 bg-warm-50 rounded-lg">
                  <p className="text-warm-600">No shoppers yet. Be the first to earn badges!</p>
                </div>
              ) : (
                shoppers.map((shopper) => (
                  <div
                    key={shopper.userId}
                    className={`bg-gradient-to-r ${getRankColor(shopper.rank)} rounded-lg p-4 border border-warm-200 transition-transform hover:scale-102`}
                  >
                    <div className="flex items-center justify-between">
                      {/* Rank and Name */}
                      <div className="flex items-center gap-4 flex-1">
                        <div className="text-3xl font-bold text-amber-600 w-12 text-center">
                          {getMedalEmoji(shopper.rank)}
                        </div>
                        <div>
                          <p className="text-warm-900 font-semibold text-lg">{shopper.name}</p>
                          {shopper.city && (
                            <p className="text-sm text-warm-600">{shopper.city}</p>
                          )}
                        </div>
                      </div>

                      {/* Score */}
                      <div className="text-center mr-6">
                        <p className="text-2xl font-bold text-amber-600">{shopper.score}</p>
                        <p className="text-xs text-warm-600">points</p>
                      </div>

                      {/* Badges */}
                      <div className="flex gap-2">
                        {shopper.badges.length > 0 ? (
                          shopper.badges.slice(0, 3).map((badge) => (
                            <div
                              key={badge.id}
                              title={badge.name}
                              className="flex items-center justify-center w-10 h-10 rounded-full bg-warm-200 border border-warm-300 text-lg"
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
                          <p className="text-xs text-warm-500">No badges yet</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Organizers Tab */}
          {!loading && activeTab === 'organizers' && (
            <div className="space-y-3">
              {organizers.length === 0 ? (
                <div className="text-center py-12 bg-warm-50 rounded-lg">
                  <p className="text-warm-600">No organizers yet.</p>
                </div>
              ) : (
                organizers.map((org) => (
                  <div
                    key={org.organizerId}
                    className={`bg-gradient-to-r ${getRankColor(org.rank)} rounded-lg p-4 border border-warm-200 transition-transform hover:scale-102`}
                  >
                    <div className="flex items-center justify-between">
                      {/* Rank and Name */}
                      <div className="flex items-center gap-4 flex-1">
                        <div className="text-3xl font-bold text-amber-600 w-12 text-center">
                          {getMedalEmoji(org.rank)}
                        </div>
                        <div>
                          <p className="text-warm-900 font-semibold text-lg">{org.organizerName}</p>
                          <p className="text-sm text-warm-600">
                            {org.completedSales} sale{org.completedSales !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>

                      {/* Items Sold */}
                      <div className="text-center">
                        <p className="text-2xl font-bold text-amber-600">{org.totalItemsSold}</p>
                        <p className="text-xs text-warm-600">items sold</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Footer Note */}
          <div className="mt-12 bg-sage-50 border border-sage-200 rounded-lg p-6 text-center">
            <p className="text-warm-700">
              The leaderboard updates daily based on activity. Complete sales, earn badges, and climb the ranks!
            </p>
          </div>
        </div>
      </main>
    </Layout>
  );
};

export default Leaderboard;
