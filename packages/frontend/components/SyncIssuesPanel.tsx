/**
 * SyncIssuesPanel — slide-in side panel showing items whose markdown price cut
 * hasn't confirmed on eBay yet.
 *
 * ebay-markdown-budget-warnings-ux-spec-2026-09-15.md, Piece 2, Recommended
 * Design point 3 / Dev Handoff Note #5: reuses PlatformGapPanel's exact
 * click-to-expand slide-in pattern (backdrop + right-side panel) rather than
 * inventing a new one. The sync cron still retries automatically every 4h.
 *
 * Sentry FINDASALE-NODEJS-88 follow-up: a "Check eBay now" button calls
 * POST /organizers/me/ebay-sync-issues/retry, which now answers 202 right away
 * and runs the sync in the background (it can take minutes). The panel shows a
 * status message and re-fetches the issue list a few times on a short schedule
 * so results appear here without a manual reload.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import api from '../lib/api';
import Skeleton from './Skeleton';

export interface SyncIssueItem {
  id: string;
  title: string;
  primaryPhotoUrl: string | null;
  price: number | null;
  platforms: string[];
  priceUpdatedAt: string;
}

export interface EbaySyncIssuesResponse {
  totalSyncIssues: number;
  items: SyncIssueItem[];
}

export interface EbaySyncRetryResponse {
  started: boolean;
  alreadyRunning?: boolean;
  message?: string;
}

// Re-fetch schedule after a retry starts (ms after the 202). The background
// sync walks every eBay listing, so results trickle in over a few minutes.
const RETRY_REFETCH_DELAYS_MS = [15_000, 45_000, 90_000, 180_000, 300_000];

export interface SyncIssuesPanelProps {
  onClose: () => void;
}

export default function SyncIssuesPanel({ onClose }: SyncIssuesPanelProps) {
  const { isLoading, data } = useQuery<EbaySyncIssuesResponse>({
    queryKey: ['ebay-sync-issues'],
    queryFn: async () => {
      const res = await api.get('/organizers/me/ebay-sync-issues');
      return res.data as EbaySyncIssuesResponse;
    },
    staleTime: 30_000,
  });

  const queryClient = useQueryClient();
  const [retryStatus, setRetryStatus] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const refetchTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearRefetchTimers = () => {
    refetchTimers.current.forEach((t) => clearTimeout(t));
    refetchTimers.current = [];
  };

  // Stop any scheduled re-fetches when the panel closes.
  useEffect(() => clearRefetchTimers, []);

  const retryMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/organizers/me/ebay-sync-issues/retry');
      return res.data as EbaySyncRetryResponse;
    },
    onSuccess: (result) => {
      setRetryStatus({
        kind: 'info',
        text: result.alreadyRunning
          ? 'A sync is already running for your account. Results will update here when it finishes.'
          : 'Sync started. This can take a few minutes; results will update here.',
      });
      clearRefetchTimers();
      refetchTimers.current = RETRY_REFETCH_DELAYS_MS.map((delay) =>
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['ebay-sync-issues'] });
        }, delay),
      );
    },
    onError: () => {
      setRetryStatus({
        kind: 'error',
        text: "We couldn't start the eBay sync. Please try again in a moment.",
      });
    },
  });

  const items = data?.items ?? [];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full sm:w-[480px] bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-warm-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-warm-900 dark:text-warm-100">
              eBay Sync Issues
            </h2>
            {data && (
              <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-warm-100 dark:bg-gray-700 text-warm-700 dark:text-warm-300">
                {data.totalSyncIssues} item{data.totalSyncIssues === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="p-2 rounded-lg hover:bg-warm-100 dark:hover:bg-gray-700 text-warm-500 dark:text-warm-400 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Retry action + status */}
        {items.length > 0 && (
          <div className="px-5 pt-4">
            <button
              type="button"
              onClick={() => retryMutation.mutate()}
              disabled={retryMutation.isPending}
              className="text-sm px-3 py-1.5 rounded-lg bg-[#87A878] hover:bg-[#6b8f5e] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium transition-colors"
            >
              {retryMutation.isPending ? 'Starting sync...' : 'Check eBay now'}
            </button>
          </div>
        )}
        {retryStatus && (
          <div className="px-5 pt-3">
            <p
              role="status"
              className={
                retryStatus.kind === 'error'
                  ? 'text-sm rounded-lg px-3 py-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                  : 'text-sm rounded-lg px-3 py-2 bg-warm-50 dark:bg-gray-800 text-warm-700 dark:text-warm-300'
              }
            >
              {retryStatus.text}
            </p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="w-14 h-14 flex-shrink-0 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="text-5xl mb-4">&#x2705;</div>
              <p className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-2">
                Everything&apos;s synced
              </p>
              <p className="text-sm text-warm-500 dark:text-warm-400">
                No pending price changes waiting to confirm on eBay.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-3 p-3 rounded-lg bg-warm-50 dark:bg-gray-800 border border-warm-100 dark:border-gray-700"
                >
                  {/* Thumbnail */}
                  <div className="w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-warm-200 dark:bg-gray-700">
                    {item.primaryPhotoUrl ? (
                      <img
                        src={item.primaryPhotoUrl}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-warm-400 dark:text-warm-500 text-xs">
                        No photo
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-warm-900 dark:text-warm-100 truncate">
                      {item.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {item.price != null && (
                        <span className="text-xs text-warm-600 dark:text-warm-400">
                          ${item.price.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                      Not confirmed on eBay since{' '}
                      {new Date(item.priceUpdatedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                    <div className="mt-2">
                      <Link
                        href={`/organizer/edit-item/${item.id}`}
                        className="text-xs px-2 py-1 rounded bg-[#87A878] hover:bg-[#6b8f5e] text-white font-medium transition-colors inline-block"
                      >
                        View item
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
