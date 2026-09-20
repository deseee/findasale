/**
 * EbayMonthlyQuotaCounter: compact "X of Y free eBay insertions used this
 * month" counter for the edit-item eBay publish flow (2026-09-20, Patrick-
 * requested: the edit-item page showed a live per-item fee check
 * (EbayFeeCheckBadge) but no monthly-quota context at all, while the
 * platforms page showed one -- this closes that gap using the SAME data,
 * not a second estimate).
 *
 * Reuses the exact same GET /organizers/me/ebay-insertions-forecast
 * endpoint and queryKey ('ebay-insertions-forecast') that
 * pages/organizer/platforms.tsx already uses for its EbayForecastBlock --
 * react-query shares the cached result across pages in the same session
 * (staleTime matches platforms.tsx's default), so this doesn't add a second
 * live lookup, just a second place to render the one real number.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

interface EbayInsertionsForecast {
  usedThisMonth: number;
  freeInsertionsCap: number;
  capSource: 'CACHED' | 'ESTIMATED';
  projectedRenewalsBeforeReset: number;
  projectedTotalUsage: number;
  resetAt: string;
  status: 'ok' | 'approaching' | 'over';
  degraded?: boolean;
}

export const EbayMonthlyQuotaCounter: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ebay-insertions-forecast'],
    queryFn: async () => {
      const res = await api.get('/organizers/me/ebay-insertions-forecast');
      return res.data as EbayInsertionsForecast;
    },
    enabled,
    staleTime: 60_000,
  });

  if (!enabled) return null;
  if (isLoading) return null; // EbayFeeCheckBadge already shows a "checking" line next to this -- avoid two loading messages
  if (isError || !data) return null; // non-critical context -- fail silently rather than crowd the publish button with a second error line

  const { usedThisMonth, freeInsertionsCap, projectedRenewalsBeforeReset, projectedTotalUsage, status, capSource } = data;

  const color =
    status === 'over' ? 'text-red-700 dark:text-red-400'
    : status === 'approaching' ? 'text-amber-700 dark:text-amber-400'
    : 'text-warm-500 dark:text-warm-400';

  return (
    <p className={`text-[11px] ${color} mt-1`}>
      {usedThisMonth} used + ~{projectedRenewalsBeforeReset} projected renewals = ~{projectedTotalUsage} of {freeInsertionsCap} free eBay insertions this month
      {capSource === 'ESTIMATED' && ' (estimated)'}
    </p>
  );
};
