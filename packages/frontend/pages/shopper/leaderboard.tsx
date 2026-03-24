/**
 * Feature: Leaderboard Page
 *
 * Page: /shopper/leaderboard
 * - Display top 50 explorers by guild XP
 * - Show rank badge and user name
 * - Responsive layout with mobile support
 * - Loading skeleton and empty state
 */

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { RankBadge } from '@/components/RankBadge';
import { useAuth } from '@/components/AuthContext';
import { ExplorerRank } from '@/components/RankBadge';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  guildXp: number;
  explorerRank: ExplorerRank;
}

interface LeaderboardData {
  entries: LeaderboardEntry[];
  lastUpdated: string;
}

const LeaderboardSkeleton = () => (
  <>
    {Array.from({ length: 10 }).map((_, i) => (
      <div
        key={i}
        className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 animate-pulse"
      >
        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="flex-1">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2" />
          <div className="h-3 bg-gray-100 dark:bg-gray-600 rounded w-20" />
        </div>
        <div className="w-24 h-8 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    ))}
  </>
);

function LeaderboardPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect if not authenticated
  if (mounted && !authLoading && !user) {
    router.push('/login');
    return null;
  }

  const { data: leaderboardData, isLoading, error } = useQuery<LeaderboardData>({
    queryKey: ['leaderboard'],
    queryFn: async () => {
      const response = await api.get('/api/xp/leaderboard');
      return response.data as LeaderboardData;
    },
    enabled: !!user && mounted,
    staleTime: 300_000, // 5 minutes
  });

  if (authLoading || !mounted) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 dark:text-gray-400">Loading leaderboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-6 text-center">
          <p className="text-red-700 dark:text-red-300">Unable to load the leaderboard. Please try again.</p>
        </div>
      </div>
    );
  }

  const entries = leaderboardData?.entries || [];

  return (
    <>
      <Head>
        <title>Explorer Leaderboard - FindA.Sale</title>
      </Head>

      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-warm-100 mb-2">Explorer Leaderboard 🏆</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Top 50 explorers ranked by guild XP earned
          </p>
          {leaderboardData?.lastUpdated && (
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
              Last updated: {new Date(leaderboardData.lastUpdated).toLocaleString()}
            </p>
          )}
        </div>

        {/* Leaderboard Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden border border-gray-200 dark:border-gray-700">
          {isLoading ? (
            <LeaderboardSkeleton />
          ) : entries.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Rank</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Explorer</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">Rank</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">Guild XP</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr
                      key={entry.userId}
                      className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center">
                          {entry.rank === 1 ? (
                            <span className="text-2xl">🥇</span>
                          ) : entry.rank === 2 ? (
                            <span className="text-2xl">🥈</span>
                          ) : entry.rank === 3 ? (
                            <span className="text-2xl">🥉</span>
                          ) : (
                            <span className="text-sm font-bold text-gray-700 dark:text-gray-300 w-8 text-center">
                              {entry.rank}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900 dark:text-warm-100">
                          {entry.userName}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <RankBadge rank={entry.explorerRank} size="sm" />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <p className="font-semibold text-indigo-700 dark:text-indigo-400">
                          {entry.guildXp.toLocaleString()}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 px-4">
              <p className="text-gray-600 dark:text-gray-400">No explorers on the leaderboard yet.</p>
            </div>
          )}
        </div>

        {/* Info Card */}
        <div className="mt-8 bg-blue-50 dark:bg-blue-900 rounded-lg p-6 border border-blue-200 dark:border-blue-700">
          <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">How to earn Guild XP</h3>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
            <li className="flex items-start gap-2">
              <span>✓</span>
              <span>Browse and save sales</span>
            </li>
            <li className="flex items-start gap-2">
              <span>✓</span>
              <span>Explore detailed item listings</span>
            </li>
            <li className="flex items-start gap-2">
              <span>✓</span>
              <span>Earn loyalty stamps and badges</span>
            </li>
            <li className="flex items-start gap-2">
              <span>✓</span>
              <span>Participate in community activities</span>
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}

export default LeaderboardPage;
