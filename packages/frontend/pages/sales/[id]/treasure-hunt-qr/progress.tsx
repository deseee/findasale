import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import api from '../../../../lib/api';
import { useAuth } from '../../../../components/AuthContext';
import { useToast } from '../../../../components/ToastContext';
import Skeleton from '../../../../components/Skeleton';
import Head from 'next/head';

interface Clue {
  id: string;
  category?: string;
  createdAt: string;
}

interface ProgressData {
  cluesFound: number;
  totalClues: number;
  progress: string;
  completionBonus: boolean;
}

const ProgressPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  // Fetch all clues for this sale (no auth required — public list)
  const { data: cluesData, isLoading: cluesLoading } = useQuery({
    queryKey: ['treasureHuntQRClues', id],
    queryFn: async () => {
      const response = await api.get(`/sales/${id}/treasure-hunt-qr`);
      return response.data;
    },
    enabled: !!id,
  });

  // Fetch user's progress (auth required)
  const { data: progressData, isLoading: progressLoading } = useQuery({
    queryKey: ['treasureHuntQRProgress', id],
    queryFn: async () => {
      const response = await api.get(`/sales/${id}/treasure-hunt-qr/progress`);
      return response.data as ProgressData;
    },
    enabled: !!id && !!user,
  });

  const isLoading = authLoading || cluesLoading || (!!user && progressLoading);
  const clues: Clue[] = cluesData?.clues || [];
  const progress = progressData || { cluesFound: 0, totalClues: clues.length, progress: '0/0', completionBonus: false };

  // Determine which clues the user has found (mock for now — server doesn't provide per-clue found status)
  // For a real implementation, we'd fetch the scan records or add an endpoint
  const userFoundClues = new Set<string>();

  return (
    <>
      <Head>
        <title>Treasure Hunt Progress | FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-warm-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="max-w-md mx-auto px-4 py-8">
          {/* Back Link */}
          <Link href={`/sales/${id}`}>
            <a className="inline-flex items-center text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 mb-4">
              ← Back to Sale
            </a>
          </Link>

          {/* Main Card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-6 text-white">
              <h1 className="text-2xl font-bold mb-2">🎯 Treasure Hunt Progress</h1>
              <p className="text-amber-100 text-sm">Track your clue discoveries</p>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {isLoading ? (
                <>
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-32 w-full" />
                </>
              ) : (
                <>
                  {/* Progress Summary */}
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                    <div className="text-center">
                      <p className="text-sm text-amber-900 dark:text-amber-100 font-semibold mb-2">
                        YOUR PROGRESS
                      </p>
                      <div className="text-4xl font-bold text-amber-700 dark:text-amber-300">
                        {progress.cluesFound}/{progress.totalClues}
                      </div>
                      <p className="text-xs text-amber-800 dark:text-amber-200 mt-2">
                        {progress.totalClues === 0
                          ? 'No clues yet'
                          : progress.completionBonus
                          ? '🎉 All clues found!'
                          : `${progress.totalClues - progress.cluesFound} clue${progress.totalClues - progress.cluesFound === 1 ? '' : 's'} remaining`}
                      </p>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-4 w-full bg-amber-200 dark:bg-amber-900/50 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-amber-500 to-orange-500 h-full transition-all duration-300"
                        style={{
                          width: progress.totalClues > 0 ? `${(progress.cluesFound / progress.totalClues) * 100}%` : '0%',
                        }}
                      />
                    </div>
                  </div>

                  {/* Clues List */}
                  {progress.totalClues > 0 ? (
                    <div>
                      <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-3">
                        Clues to Find
                      </h2>
                      <div className="space-y-2">
                        {clues.map((clue) => {
                          const isFound = userFoundClues.has(clue.id);
                          return (
                            <Link key={clue.id} href={`/sales/${id}/treasure-hunt-qr/${clue.id}`}>
                              <a
                                className={`block p-3 rounded-lg border-l-4 transition ${
                                  isFound
                                    ? 'bg-green-50 dark:bg-green-900/20 border-l-green-500 text-green-900 dark:text-green-100'
                                    : 'bg-warm-50 dark:bg-gray-700/50 border-l-amber-500 text-warm-900 dark:text-warm-100 hover:bg-warm-100 dark:hover:bg-gray-600/50'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <span className="text-lg">
                                      {isFound ? '✅' : '🔍'}
                                    </span>
                                    <div>
                                      <p className="font-semibold text-sm">
                                        {isFound ? 'Clue Found' : 'Clue'}
                                      </p>
                                      {clue.category && (
                                        <p className="text-xs opacity-75">{clue.category}</p>
                                      )}
                                    </div>
                                  </div>
                                  <span className="text-xl">→</span>
                                </div>
                              </a>
                            </Link>
                          );
                        })}
                      </div>

                      {/* Instructions */}
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 rounded-lg mt-4">
                        <p className="text-sm text-blue-900 dark:text-blue-200">
                          💡 <strong>Hint:</strong> Scan the QR code at the sale venue to claim clues. Or tap a clue above to preview it.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-warm-600 dark:text-gray-400">
                        No treasure hunt clues yet. Check back later!
                      </p>
                    </div>
                  )}

                  {/* Cross-promo to Photo Station */}
                  {progress.totalClues > 0 && (
                    <Link href={`/sales/${id}/photo-station`} className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400 hover:underline">
                      📸 Visit the Photo Station for bonus XP →
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Footer Help */}
          <div className="mt-6 text-center text-sm text-warm-600 dark:text-gray-400">
            <p>🏆 Earn XP by finding treasure hunt items!</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default ProgressPage;
