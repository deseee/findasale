/**
 * Hall of Fame Page — Phase 2b
 * Displays all-time Grandmasters and seasonal top 100 Sage+ leaders
 * Public page — no authentication required
 */

import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import api from '../../lib/api';

interface GrandmasterEntry {
  rank: number;
  userId: string;
  name: string;
  profileSlug: string;
  guildXp: number;
  explorerRank: 'GRANDMASTER';
  achievedAt: string;
}

interface SeasonalEntry {
  rank: number;
  userId: string;
  name: string;
  profileSlug: string;
  guildXp: number;
  explorerRank: 'SAGE' | 'GRANDMASTER';
}

interface HallOfFameData {
  allTimeGrandmasters: GrandmasterEntry[];
  seasonalTop100: SeasonalEntry[];
}

const RANK_COLORS: Record<string, string> = {
  SAGE: '#F59E0B', // Amber
  GRANDMASTER: '#8B5CF6', // Purple
};

const RANK_NAMES: Record<string, string> = {
  SAGE: 'Sage',
  GRANDMASTER: 'Grandmaster',
};

export default function HallOfFame() {
  const [data, setData] = useState<HallOfFameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHallOfFame = async () => {
      try {
        const response = await api.get('/guild/hall-of-fame');
        setData(response.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchHallOfFame();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 p-6">
        <Head>
          <title>Hall of Fame — Explorer's Guild</title>
        </Head>
        <div className="max-w-4xl mx-auto text-center py-20">
          <p className="text-gray-600 dark:text-gray-400">Loading Hall of Fame...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 p-6">
        <Head>
          <title>Hall of Fame — Explorer's Guild</title>
        </Head>
        <div className="max-w-4xl mx-auto text-center py-20">
          <p className="text-red-600 dark:text-red-400">Error: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <Head>
        <title>Hall of Fame — Explorer's Guild</title>
        <meta name="description" content="Celebrate the most accomplished treasure hunters in the Explorer's Guild." />
      </Head>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-2">
            Hall of Fame
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Celebrate the most accomplished treasure hunters in the Explorer's Guild
          </p>
        </div>

        {/* All-Time Grandmasters */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
            <span>👑</span> Permanent Members
          </h2>

          {data?.allTimeGrandmasters && data.allTimeGrandmasters.length > 0 ? (
            <div className="space-y-3">
              {data.allTimeGrandmasters.map((member) => (
                <div
                  key={member.userId}
                  className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950 dark:to-yellow-950 rounded-lg p-4 border-l-4"
                  style={{ borderLeftColor: '#8B5CF6' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="text-center min-w-12">
                        <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                          {member.rank}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Place</p>
                      </div>
                      <div>
                        <Link href={`/shopper/profile/${member.profileSlug}`}>
                          <p className="font-semibold text-gray-900 dark:text-white hover:underline">
                            {member.name}
                          </p>
                        </Link>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Grandmaster since{' '}
                          {new Date(member.achievedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {member.guildXp.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Total XP</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-gray-50 dark:bg-slate-900 rounded-lg">
              <p className="text-gray-600 dark:text-gray-400">
                No Grandmasters yet — be the first!
              </p>
            </div>
          )}
        </div>

        {/* Seasonal Top 100 */}
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
            <span>🏆</span> This Season's Top 100
          </h2>

          {data?.seasonalTop100 && data.seasonalTop100.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200 dark:border-gray-800">
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">
                      Rank
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white">
                      Name
                    </th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-900 dark:text-white">
                      Rank
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-900 dark:text-white">
                      XP
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.seasonalTop100.map((entry) => (
                    <tr
                      key={entry.userId}
                      className="border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-slate-900 transition"
                    >
                      <td className="py-3 px-4 text-lg font-bold text-gray-900 dark:text-white">
                        {entry.rank}
                      </td>
                      <td className="py-3 px-4">
                        <Link href={`/shopper/profile/${entry.profileSlug}`}>
                          <p className="font-semibold text-gray-900 dark:text-white hover:underline">
                            {entry.name}
                          </p>
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className="inline-block px-3 py-1 rounded-full text-sm font-semibold text-white"
                          style={{
                            backgroundColor:
                              RANK_COLORS[entry.explorerRank] || '#6B7280',
                          }}
                        >
                          {RANK_NAMES[entry.explorerRank] || entry.explorerRank}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-900 dark:text-white">
                        {entry.guildXp.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 bg-gray-50 dark:bg-slate-900 rounded-lg">
              <p className="text-gray-600 dark:text-gray-400">
                No seasonal leaders yet. Keep earning XP!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
