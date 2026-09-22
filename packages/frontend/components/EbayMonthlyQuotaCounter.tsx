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
 *
 * FRESHNESS NOTE (2026-09-21, claude_docs/ux-spotchecks/ebay-insertions-
 * freshness-note-2026-09-21.md): appended to this same line, not a new
 * section. Reflects whether usedThisMonth has ever been confirmed against
 * eBay's own account data (ebayInsertionsReconciledAt) -- see
 * claude_docs/audits/ebay-insertions-forecast-undercounting-2026-09-21.md
 * for why this matters (the pre-reconciliation number was confirmed to
 * undercount real usage 6.5x for the one real connected organizer).
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
  ebayInsertionsReconciledAt: string | null;
}

// Relative-time phrasing for the freshness note -- mirrors this codebase's
// existing local timeAgo() pattern (e.g. NotificationBell.tsx) rather than
// pulling in a date library (none installed in packages/frontend).
function relativeTimeSince(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return 'moments ago';
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays === 1) return 'yesterday';
  return `${diffDays} days ago`;
}

// STALE_HOURS: reconciliation is throttled to run at most once per 24h per
// organizer (ebayInsertionsQuotaTracker.ts), so anywhere up to ~30h old is
// normal cron cadence, not a problem. 48h+ means the reconciliation job
// itself is stuck, not just between runs -- worth a mild visual flag.
const STALE_HOURS = 48;

function freshnessNote(reconciledAt: string | null): { text: string; stale: boolean } {
  if (!reconciledAt) {
    return { text: 'not yet checked against eBay directly', stale: false };
  }
  const hoursOld = (Date.now() - new Date(reconciledAt).getTime()) / (1000 * 60 * 60);
  const rel = relativeTimeSince(reconciledAt);
  if (hoursOld >= STALE_HOURS) {
    return { text: `last checked against eBay ${rel}, may be out of date`, stale: true };
  }
  return { text: `checked against eBay ${rel}`, stale: false };
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

  const { usedThisMonth, freeInsertionsCap, projectedRenewalsBeforeReset, projectedTotalUsage, status, capSource, ebayInsertionsReconciledAt } = data;

  const color =
    status === 'over' ? 'text-red-700 dark:text-red-400'
    : status === 'approaching' ? 'text-amber-700 dark:text-amber-400'
    : 'text-warm-500 dark:text-warm-400';

  const freshness = freshnessNote(ebayInsertionsReconciledAt);
  const freshnessColor = freshness.stale ? 'text-amber-700 dark:text-amber-400' : color;

  return (
    <p className={`text-[11px] ${color} mt-1`}>
      {usedThisMonth} used + ~{projectedRenewalsBeforeReset} projected renewals = ~{projectedTotalUsage} of {freeInsertionsCap} free eBay insertions this month
      {capSource === 'ESTIMATED' && ' (estimated)'}
      {' -- '}
      <span className={freshnessColor}>{freshness.text}</span>
    </p>
  );
};
