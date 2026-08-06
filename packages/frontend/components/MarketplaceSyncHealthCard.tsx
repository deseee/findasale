import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import Skeleton from './Skeleton';

/**
 * Marketplace Sync Health card — embedded on pages/organizer/marketplace-extension.tsx,
 * below the existing install steps. Summarizes GET /api/extension/sync-health
 * (extensionController.ts) for the organizer: last post/remove activity + how many items
 * are currently live on Facebook, the manual-review dead-letter backlog (items the
 * extension gave up auto-removing after repeated failed attempts), and items that
 * recently sold NATIVELY on Facebook (detected by the sold-on-facebook cascade).
 *
 * Types below are copied locally, not imported from @findasale/shared (this project's
 * hard rule — a shared import breaks the Vercel build) — they mirror the response shape
 * built in packages/backend/src/controllers/extensionController.ts's getSyncHealth.
 */

interface SyncHealthResponse {
  lastSyncActivity: {
    lastPostAt: string | null;
    lastRemoveAt: string | null;
    activePostedCount: number;
  };
  manualReviewBacklog: Array<{
    itemId: string;
    title: string;
    saleTitle: string;
    skipCount: number;
    lastErrorMessage: string | null;
    lastAttemptAt: string | null;
  }>;
  recentFbNativeSold: Array<{
    itemId: string;
    title: string;
    saleTitle: string;
    soldAt: string;
  }>;
}

const formatDateTime = (iso: string | null): string => {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const SectionCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4 sm:p-6">
    {children}
  </div>
);

const MarketplaceSyncHealthCard: React.FC = () => {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<SyncHealthResponse>({
    queryKey: ['marketplace-sync-health'],
    queryFn: async () => (await api.get('/extension/sync-health')).data,
  });

  return (
    <div className="border-t border-warm-200 dark:border-gray-700 pt-6 mt-6">
      <h3 className="text-sm font-semibold text-warm-700 dark:text-gray-300 mb-3">
        Marketplace Sync Health
      </h3>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {!isLoading && isError && (
        <SectionCard>
          <p className="text-warm-900 dark:text-warm-100 font-medium mb-1">
            We could not load your Marketplace sync status.
          </p>
          <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
            The connection may have dropped. Your listings and sync history are safe.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-bold py-3 px-4 rounded-lg transition-colors"
          >
            {isFetching ? 'Retrying…' : 'Try again'}
          </button>
        </SectionCard>
      )}

      {!isLoading && !isError && data && (() => {
        const { lastSyncActivity, manualReviewBacklog, recentFbNativeSold } = data;
        const isEmpty =
          lastSyncActivity.activePostedCount === 0 &&
          !lastSyncActivity.lastPostAt &&
          !lastSyncActivity.lastRemoveAt &&
          manualReviewBacklog.length === 0 &&
          recentFbNativeSold.length === 0;

        if (isEmpty) {
          return (
            <SectionCard>
              <p className="text-warm-900 dark:text-warm-100 font-medium mb-1">
                No Marketplace activity yet
              </p>
              <p className="text-sm text-warm-600 dark:text-warm-400 mb-3">
                Once you list an item through the extension, activity shows up here.
              </p>
              <a href="#install-steps" className="text-amber-600 hover:underline text-sm font-medium">
                Back to install instructions
              </a>
            </SectionCard>
          );
        }

        return (
          <div className="space-y-4">
            {/* Last activity summary */}
            <SectionCard>
              <h4 className="font-semibold text-warm-900 dark:text-warm-100 mb-3">Last activity</h4>
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-warm-500 dark:text-gray-400">Last posted</dt>
                  <dd className="text-warm-900 dark:text-warm-100 font-medium">
                    {formatDateTime(lastSyncActivity.lastPostAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-warm-500 dark:text-gray-400">Last removed</dt>
                  <dd className="text-warm-900 dark:text-warm-100 font-medium">
                    {formatDateTime(lastSyncActivity.lastRemoveAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-warm-500 dark:text-gray-400">Currently live on Facebook</dt>
                  <dd className="text-warm-900 dark:text-warm-100 font-medium">
                    {lastSyncActivity.activePostedCount}
                  </dd>
                </div>
              </dl>
            </SectionCard>

            {/* Manual review backlog */}
            <SectionCard>
              <h4 className="font-semibold text-warm-900 dark:text-warm-100 mb-3">
                Needs manual review {manualReviewBacklog.length > 0 && `(${manualReviewBacklog.length})`}
              </h4>
              {manualReviewBacklog.length === 0 ? (
                <p className="text-sm text-warm-500 dark:text-gray-400">
                  Nothing needs your attention right now.
                </p>
              ) : (
                <ul className="space-y-3">
                  {manualReviewBacklog.map((it) => (
                    <li key={it.itemId} className="border-b border-warm-100 dark:border-gray-700 last:border-0 pb-3 last:pb-0">
                      <p className="font-medium text-warm-900 dark:text-warm-100">{it.title}</p>
                      <p className="text-xs text-warm-500 dark:text-gray-400">
                        {it.saleTitle} &middot; {it.skipCount} failed attempt{it.skipCount === 1 ? '' : 's'}
                        {it.lastAttemptAt && ` · last tried ${formatDateTime(it.lastAttemptAt)}`}
                      </p>
                      {it.lastErrorMessage && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{it.lastErrorMessage}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            {/* Recently sold natively on Facebook */}
            <SectionCard>
              <h4 className="font-semibold text-warm-900 dark:text-warm-100 mb-3">
                Recently sold on Facebook
              </h4>
              {recentFbNativeSold.length === 0 ? (
                <p className="text-sm text-warm-500 dark:text-gray-400">
                  Nothing sold directly on Facebook in the last 30 days.
                </p>
              ) : (
                <ul className="space-y-3">
                  {recentFbNativeSold.map((it) => (
                    <li key={it.itemId} className="border-b border-warm-100 dark:border-gray-700 last:border-0 pb-3 last:pb-0">
                      <p className="font-medium text-warm-900 dark:text-warm-100">{it.title}</p>
                      <p className="text-xs text-warm-500 dark:text-gray-400">
                        {it.saleTitle} &middot; sold {formatDateTime(it.soldAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        );
      })()}
    </div>
  );
};

export default MarketplaceSyncHealthCard;
