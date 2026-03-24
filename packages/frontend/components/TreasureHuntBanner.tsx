/**
 * TreasureHuntBanner.tsx — CD2 Phase 2
 * 
 * Daily treasure hunt discovery banner.
 * Shows today's clue, point reward, and whether the user has found an item.
 */

import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from './AuthContext';

interface TodayHunt {
  id: number;
  clue: string;
  category: string;
  pointReward: number;
  alreadyFound: boolean;
}

const TreasureHuntBanner: React.FC = () => {
  const { user } = useAuth();
  const [isDismissed, setIsDismissed] = useState(false);

  // Check localStorage on mount
  useEffect(() => {
    const dismissed = typeof window !== 'undefined' && localStorage.getItem('treasureHuntBannerDismissed');
    if (dismissed) {
      setIsDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem('treasureHuntBannerDismissed', 'true');
  };

  const { data: hunt, isLoading, isError } = useQuery({
    queryKey: ['treasureHunt', 'today'],
    queryFn: async () => {
      const response = await api.get('/treasure-hunt/today');
      return response.data as TodayHunt;
    },
    retry: 1,
  });

  // Graceful degradation: if load fails or no hunt data, render nothing
  if (isError || !hunt || isDismissed) return null;

  return (
    <div className="mb-8">
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-l-4 border-amber-600 dark:border-amber-500 rounded-lg p-6 shadow-sm dark:shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🗺️</span>
            <h2 className="text-xl font-bold text-amber-900 dark:text-amber-200">Today's Treasure Hunt</h2>
          </div>
          <button
            onClick={handleDismiss}
            className="text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 p-1 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded transition-colors"
            aria-label="Close treasure hunt banner"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Clue */}
        <p className="text-warm-800 dark:text-warm-200 italic mb-4 text-sm">
          "{hunt.clue}"
        </p>

        {/* Category hint and reward */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2 items-center">
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 px-2 py-1 rounded">
              {hunt.category.toUpperCase()}
            </span>
            <span className="text-sm text-amber-800 dark:text-amber-200">
              <span className="font-semibold">+{hunt.pointReward}</span> Hunt Pass points
            </span>
          </div>

          {/* Status: found or CTA */}
          <div>
            {hunt.alreadyFound ? (
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300 font-semibold text-sm">
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                Found!
              </div>
            ) : user ? (
              <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                Find it to earn points!
              </p>
            ) : (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                <a href="/login" className="font-semibold hover:underline">
                  Sign in
                </a>
                {' '}to earn points
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TreasureHuntBanner;
