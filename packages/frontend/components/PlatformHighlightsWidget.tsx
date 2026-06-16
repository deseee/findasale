/**
 * PlatformHighlightsWidget — compact dashboard card showing headline platform stats.
 * Fetches GET /api/organizers/me/platform-stats every 60 seconds.
 * Place on the organizer dashboard after the main sale widget.
 */

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import Skeleton from './Skeleton';

interface EbayStats {
  connected: boolean;
  listed: number;
  warningLevel: 'ok' | 'warning' | 'critical' | 'over';
  queueMode: boolean;
  queued: number;
}

interface PlatformStatsResponse {
  coverageScore: number;
  ebay: EbayStats;
  googleMerchant: { connected: boolean; listed: number };
  totals: { totalUnlisted: number };
}

export default function PlatformHighlightsWidget() {
  const { data, isLoading, isError } = useQuery<PlatformStatsResponse>({
    queryKey: ['platform-stats'],
    queryFn: async () => {
      const res = await api.get('/organizers/me/platform-stats');
      return res.data as PlatformStatsResponse;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const coverageColor =
    !data ? 'text-warm-400'
    : data.coverageScore >= 80 ? 'text-green-600 dark:text-green-400'
    : data.coverageScore >= 50 ? 'text-yellow-600 dark:text-yellow-400'
    : 'text-orange-600 dark:text-orange-400';

  const coverageBg =
    !data ? 'bg-warm-100 dark:bg-gray-700'
    : data.coverageScore >= 80 ? 'bg-green-100 dark:bg-green-900/40'
    : data.coverageScore >= 50 ? 'bg-yellow-100 dark:bg-yellow-900/40'
    : 'bg-orange-100 dark:bg-orange-900/40';

  const ebayWarning = data && (data.ebay.warningLevel === 'warning' || data.ebay.warningLevel === 'critical' || data.ebay.warningLevel === 'over');

  return (
    <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-warm-900 dark:text-warm-100">
          Platform Reach
        </h3>
        <Link
          href="/organizer/platforms"
          className="text-xs font-medium text-[#6b8f5e] dark:text-[#a8c49a] hover:text-[#87A878] transition-colors"
        >
          View Details &rarr;
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="w-12 h-12 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex gap-4">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      ) : isError || !data ? (
        <p className="text-sm text-warm-400 dark:text-warm-500">Platform data unavailable</p>
      ) : (
        <div className="space-y-4">
          {/* Coverage score + headline stats row */}
          <div className="flex items-center gap-4">
            {/* Coverage badge */}
            <div className={`flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center ${coverageBg}`}>
              <span className={`text-lg font-bold ${coverageColor}`}>
                {data.coverageScore}%
              </span>
            </div>

            {/* Stats */}
            <div className="flex gap-5 flex-wrap">
              {/* eBay */}
              <div className="flex flex-col">
                <span className="text-xs text-warm-500 dark:text-warm-400">eBay</span>
                <div className="flex items-center gap-1">
                  <span className="text-base font-bold text-warm-900 dark:text-warm-100">
                    {data.ebay.connected ? data.ebay.listed : '—'}
                  </span>
                  {ebayWarning && (
                    <span className="text-orange-500" title="eBay listing limit warning">
                      &#9888;
                    </span>
                  )}
                </div>
              </div>

              {/* Google */}
              <div className="flex flex-col">
                <span className="text-xs text-warm-500 dark:text-warm-400">Google</span>
                <span className="text-base font-bold text-warm-900 dark:text-warm-100">
                  {data.googleMerchant.listed}
                </span>
              </div>

              {/* Unlisted */}
              <div className="flex flex-col">
                <span className="text-xs text-warm-500 dark:text-warm-400">Unlisted</span>
                <span className={`text-base font-bold ${data.totals.totalUnlisted > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-warm-900 dark:text-warm-100'}`}>
                  {data.totals.totalUnlisted}
                </span>
              </div>
            </div>
          </div>

          {/* Queue Mode chip */}
          {data.ebay.queueMode && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#87A878]/10 text-[#6b8f5e] dark:text-[#a8c49a] border border-[#87A878]/30">
                <span className="w-1.5 h-1.5 rounded-full bg-[#87A878]" />
                Queue Mode &middot; {data.ebay.queued} waiting
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
