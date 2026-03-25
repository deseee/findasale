/**
 * Hunt Pass Feature: Collector's League Leaderboard
 * Pages: /shopper/league
 * - Display top 50 Hunt Pass holders
 * - Order by guildXp descending
 * - Highlight current user's position
 */

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '@/components/AuthContext';
import { useToast } from '@/components/ToastContext';
import { RankBadge, ExplorerRank } from '@/components/RankBadge';
import api from '@/lib/api';

interface LeaderboardUser {
  position: number;
  id: string;
  name: string;
  explorerRank: string;
  guildXp: number;
  isCurrentUser: boolean;
}

function LeaguePage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [userPosition, setUserPosition] = useState<LeaderboardUser | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || authLoading || !user) return;

    const fetchLeague = async () => {
      try {
        setLoading(true);
        const response = await api.get('/loyalty/collector-league');
        const data: LeaderboardUser[] = response.data;
        setLeaderboard(data);

        // Find current user's position
        const currentUserEntry = data.find((u) => u.isCurrentUser);
        if (currentUserEntry) {
          setUserPosition(currentUserEntry);
        }

        setError(null);
      } catch (err) {
        console.error('Error fetching collector league:', err);
        setError('Unable to load leaderboard');
        showToast('Error loading leaderboard', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchLeague();
  }, [mounted, authLoading, user, router, showToast]);

  // Redirect if not authenticated
  if (mounted && !authLoading && !user) {
    router.push('/login');
    return null;
  }

  if (!mounted || authLoading || loading) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">Loading leaderboard...</p>
        </div>
      </div>
    );
  }

  const hasHuntPass = user?.huntPassActive && user?.huntPassExpiry && new Date(user.huntPassExpiry) > new Date();

  return (
    <>
      <Head>
        <title>Collector's League - FindA.Sale</title>
        <meta name="description" content="Collector's League Leaderboard - Hunt Pass holders ranked by XP" />
      </Head>

      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Collector's League</h1>
          <p className="text-gray-600 dark:text-gray-400">Top Hunt Pass holders ranked by Explorer's Guild XP</p>
        </div>

        {!hasHuntPass && (
          <div className="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-6 dark:bg-blue-900 dark:border-blue-700">
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">Join the Hunt Pass</h3>
            <p className="text-blue-800 dark:text-blue-200 mb-4">Upgrade to Hunt Pass to join the Collector's League and compete for the top ranks.</p>
            <Link
              href="/shopper/hunt-pass"
              className="inline-block px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Get Hunt Pass
            </Link>
          </div>
        )}

        {error && (
          <div className="mb-8 bg-red-50 border border-red-200 rounded-lg p-6 dark:bg-red-900 dark:border-red-700">
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Current User Position Highlight */}
        {userPosition && (
          <div className="mb-8 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-lg p-6 dark:from-amber-900 dark:to-orange-900 dark:border-amber-600">
            <p className="text-sm text-amber-700 dark:text-amber-200 font-semibold mb-2">YOUR POSITION</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-amber-900 dark:text-amber-100">#{userPosition.position}</p>
                <p className="text-amber-800 dark:text-amber-200">{userPosition.guildXp.toLocaleString()} XP</p>
              </div>
              <div className="text-right">
                <RankBadge rank={userPosition.explorerRank as ExplorerRank} />
              </div>
            </div>
          </div>
        )}

        {leaderboard.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-600 dark:text-gray-400">No Hunt Pass holders yet. Be the first!</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">Rank</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">Name</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">Level</th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900 dark:text-white">XP</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry) => (
                    <tr
                      key={entry.id}
                      className={`border-b border-gray-200 dark:border-gray-700 transition-colors ${
                        entry.isCurrentUser
                          ? 'bg-amber-50 dark:bg-amber-900/20'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      <td className="px-6 py-4 text-lg font-bold text-gray-900 dark:text-white">
                        {entry.position === 1 && '🥇'}
                        {entry.position === 2 && '🥈'}
                        {entry.position === 3 && '🥉'}
                        {entry.position > 3 && entry.position}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">{entry.name}</span>
                          {entry.isCurrentUser && (
                            <span className="inline-block px-2 py-1 bg-amber-200 dark:bg-amber-700 text-amber-900 dark:text-amber-100 text-xs font-bold rounded">
                              YOU
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <RankBadge rank={entry.explorerRank as ExplorerRank} />
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-gray-900 dark:text-white">
                        {entry.guildXp.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Back to Loyalty */}
        <div className="mt-12 text-center">
          <Link
            href="/shopper/loyalty"
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
          >
            ← Back to Loyalty Passport
          </Link>
        </div>
      </div>
    </>
  );
}

export default LeaguePage;
