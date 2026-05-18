'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '../lib/api';

interface DemandSignal {
  query: string;
  searchCount: number;
  lastSearched: string;
}

interface DemandSignalsResponse {
  city: string | null;
  state: string | null;
  local: DemandSignal[];
  national: DemandSignal[];
}

export interface DemandSignalsCardProps {
  /** Optional override to limit how many local signals are displayed. Defaults to 10. */
  maxLocal?: number;
}

export default function DemandSignalsCard({ maxLocal = 10 }: DemandSignalsCardProps) {
  const [data, setData] = useState<DemandSignalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get<DemandSignalsResponse>('/organizer/demand-signals')
      .then((res) => {
        setData(res.data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700 rounded-lg p-5 animate-pulse">
        <div className="h-4 w-52 bg-violet-200 dark:bg-violet-700 rounded mb-3" />
        <div className="h-3 w-64 bg-violet-100 dark:bg-violet-800 rounded mb-4" />
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-7 w-24 bg-violet-200 dark:bg-violet-700 rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) return null;

  const localSignals = (data?.local ?? []).slice(0, maxLocal);
  const nationalSignals = data?.national ?? [];
  const hasLocal = localSignals.length > 0;
  const hasNational = nationalSignals.length > 0;
  const cityLabel = data?.city ? `${data.city}${data.state ? `, ${data.state}` : ''}` : null;

  return (
    <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700 rounded-lg p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-violet-600 dark:text-violet-400 text-lg" aria-hidden="true">🔎</span>
        <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-100 uppercase tracking-wide">
          What Shoppers Are Looking For
        </h3>
      </div>
      <p className="text-xs text-violet-600 dark:text-violet-400 mb-4 leading-relaxed">
        {cityLabel
          ? `Top searches in ${cityLabel} with no matching listings in the last 30 days`
          : 'Top searches with no matching listings in the last 30 days'}
      </p>

      {!hasLocal && !hasNational ? (
        /* Empty state */
        <p className="text-sm text-violet-700 dark:text-violet-300 leading-relaxed">
          Not enough search data yet — check back after your sale goes live.
        </p>
      ) : (
        <>
          {/* Local demand pills */}
          {hasLocal && (
            <div className="mb-4">
              {cityLabel && (
                <p className="text-xs font-medium text-violet-700 dark:text-violet-300 mb-2">
                  In your area
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {localSignals.map((signal) => (
                  <span
                    key={signal.query}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-100 dark:bg-violet-800/60 text-violet-800 dark:text-violet-200 text-xs font-medium"
                  >
                    {signal.query}
                    <span className="text-violet-500 dark:text-violet-400 tabular-nums">
                      {signal.searchCount}×
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* National demand pills — secondary context */}
          {hasNational && (
            <div className="mb-4">
              <p className="text-xs font-medium text-violet-700 dark:text-violet-300 mb-2">
                Trending nationally
              </p>
              <div className="flex flex-wrap gap-2">
                {nationalSignals.map((signal) => (
                  <span
                    key={signal.query}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-100/60 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-xs"
                  >
                    {signal.query}
                    <span className="text-violet-400 dark:text-violet-500 tabular-nums">
                      {signal.searchCount}×
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-violet-200 dark:border-violet-700">
            <p className="text-xs text-violet-500 dark:text-violet-400">Updated daily</p>
            <Link
              href="/organizer/add-items"
              className="text-xs font-medium text-violet-700 dark:text-violet-300 hover:text-violet-900 dark:hover:text-violet-100 underline underline-offset-2"
            >
              Add items matching these searches
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
