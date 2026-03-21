/**
 * Offline Mode Dashboard — Feature #69: Local-First Offline Mode
 *
 * Organizer views and manages the offline sync queue.
 * Shows pending operations, sync status, and queue depth.
 * Allows manual sync trigger.
 *
 * Route: /organizer/offline
 * Tier: PRO minimum
 */

import React, { useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import { useToast } from '../../components/ToastContext';
import {
  useOfflineStatus,
  useSyncQueue,
  useTriggerSync,
  type SyncOperationType,
  type OfflineQueueItem,
} from '../../hooks/useOfflineMode';
import Skeleton from '../../components/Skeleton';
import TierGate from '../../components/TierGate';

const operationTypeLabels: Record<SyncOperationType, string> = {
  CREATE_ITEM: 'Create Item',
  UPDATE_ITEM: 'Update Item',
  DELETE_ITEM: 'Delete Item',
  UPLOAD_PHOTO: 'Upload Photo',
};

const operationTypeColors: Record<SyncOperationType, string> = {
  CREATE_ITEM: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100',
  UPDATE_ITEM: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100',
  DELETE_ITEM: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100',
  UPLOAD_PHOTO: 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-100',
};

const OfflinePage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { canAccess } = useOrganizerTier();
  const { showToast } = useToast();
  const offlineStatus = useOfflineStatus();
  const { data: queueData } = useSyncQueue();
  const queueLoading = false;
  const syncMutation = useTriggerSync();

  // Show loading spinner during auth check
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
          <p className="text-warm-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect if not authenticated or not organizer
  if (!user || !user.roles?.includes('ORGANIZER')) {
    router.push('/login');
    return null;
  }

  // Redirect if PRO tier not available
  // TierGate handles PRO access check in the JSX below

  const handleSync = async () => {
    try {
      const operations = queueData?.data || [];
      if (operations.length === 0) {
        showToast('No pending operations to sync', 'info');
        return;
      }
      await syncMutation.mutateAsync(operations);
      showToast(`Synced ${operations.length} operation(s)`, 'success');
    } catch (err) {
      showToast('Sync failed — check your connection', 'error');
    }
  };

  const queueItems = queueData?.data || [];

  return (
    <>
      <Head>
        <title>Offline Mode - FindA.Sale</title>
      </Head>

      <TierGate requiredTier="PRO" featureName="Offline Mode" description="Run your sale without internet. Sync inventory, process sales, and manage holds offline with automatic background sync.">
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        {/* Breadcrumb */}
        <div className="bg-white dark:bg-gray-800 border-b border-warm-200 dark:border-gray-700 px-4 py-4 mb-8">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <Link href="/organizer/dashboard" className="text-warm-400 hover:text-warm-600 dark:text-gray-400 dark:hover:text-gray-300 text-sm">
              ← Dashboard
            </Link>
            <span className="text-warm-300 dark:text-gray-600">/</span>
            <h1 className="text-lg font-semibold text-warm-900 dark:text-gray-100">Offline Mode</h1>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-warm-900 dark:text-gray-100 mb-2">Offline Sync Manager</h2>
            <p className="text-warm-600 dark:text-gray-400">
              Manage offline operations. Changes made without internet will be queued and synced when you reconnect.
            </p>
          </div>

          {/* Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {/* Online/Offline Status */}
            <div className={`rounded-lg shadow-md dark:shadow-gray-900/50 p-6 flex items-center gap-4 border-l-4 ${
              offlineStatus.isOnline
                ? 'bg-green-50 dark:bg-green-900/20 border-l-green-500'
                : 'bg-amber-50 dark:bg-amber-900/20 border-l-amber-500'
            }`}>
              <div className={`w-4 h-4 rounded-full ${offlineStatus.isOnline ? 'bg-green-500' : 'bg-amber-500'} animate-pulse`}></div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-warm-600 dark:text-gray-400">Status</p>
                <p className={`text-2xl font-bold ${
                  offlineStatus.isOnline
                    ? 'text-green-700 dark:text-green-200'
                    : 'text-amber-700 dark:text-amber-200'
                }`}>
                  {offlineStatus.isOnline ? 'Online' : 'Offline'}
                </p>
              </div>
            </div>

            {/* Queue Depth */}
            <div className={`rounded-lg shadow-md dark:shadow-gray-900/50 p-6 border-l-4 ${
              offlineStatus.queueDepth > 0
                ? 'bg-blue-50 dark:bg-blue-900/20 border-l-blue-500'
                : 'bg-white dark:bg-gray-800 border-l-gray-300 dark:border-l-gray-600'
            }`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-warm-600 dark:text-gray-400">Pending Ops</p>
              <p className={`text-2xl font-bold ${
                offlineStatus.queueDepth > 0
                  ? 'text-blue-700 dark:text-blue-200'
                  : 'text-green-700 dark:text-green-200'
              }`}>
                {offlineStatus.queueDepth}
              </p>
            </div>

            {/* Last Synced */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 p-6 border-l-4 border-l-gray-300 dark:border-l-gray-600">
              <p className="text-xs font-semibold uppercase tracking-wide text-warm-600 dark:text-gray-400">Last Synced</p>
              <p className="text-lg font-semibold text-warm-900 dark:text-gray-100 mt-1">
                {offlineStatus.lastSyncedAt
                  ? new Date(offlineStatus.lastSyncedAt).toLocaleTimeString()
                  : 'Never'}
              </p>
            </div>
          </div>

          {/* Sync Button */}
          <div className="mb-8 flex gap-4">
            <button
              onClick={handleSync}
              disabled={syncMutation.isPending || offlineStatus.queueDepth === 0}
              className="px-6 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              {syncMutation.isPending ? (
                <>
                  <svg className="inline-block w-5 h-5 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Syncing…
                </>
              ) : (
                <>
                  <svg className="inline-block w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sync Now
                </>
              )}
            </button>
            {!offlineStatus.isOnline && (
              <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <svg className="w-5 h-5 text-amber-600 dark:text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-amber-700 dark:text-amber-200">
                  You&apos;re offline. Changes will sync automatically when reconnected.
                </p>
              </div>
            )}
          </div>

          {/* Queue List */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-warm-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-warm-900 dark:text-gray-100">
                Sync Queue ({offlineStatus.queueDepth} item{offlineStatus.queueDepth !== 1 ? 's' : ''})
              </h3>
            </div>

            {queueLoading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : queueItems.length > 0 ? (
              <div className="divide-y divide-warm-200 dark:divide-gray-700">
                {queueItems.map((item: OfflineQueueItem, idx: number) => (
                  <div key={idx} className="px-6 py-4 hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${operationTypeColors[item.type]}`}>
                            {operationTypeLabels[item.type]}
                          </span>
                          <span className="text-xs text-warm-500 dark:text-gray-400">
                            {item.retryCount ? `Retry ${item.retryCount}` : 'First attempt'}
                          </span>
                        </div>
                        <p className="text-sm text-warm-600 dark:text-gray-300 mb-1">
                          Sale: <span className="font-mono text-xs">{item.saleId.slice(0, 8)}</span>
                        </p>
                        {item.itemId && (
                          <p className="text-sm text-warm-600 dark:text-gray-300 mb-1">
                            Item: <span className="font-mono text-xs">{item.itemId.slice(0, 8)}</span>
                          </p>
                        )}
                        {item.payload.title && (
                          <p className="text-sm text-warm-600 dark:text-gray-300 truncate">
                            Title: {item.payload.title}
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs text-warm-500 dark:text-gray-400">
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-12 text-center">
                <svg className="w-16 h-16 mx-auto mb-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m10.5-2.5a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-warm-600 dark:text-gray-400 text-lg font-semibold mb-2">All changes synced</p>
                <p className="text-warm-500 dark:text-gray-500">No pending operations. Your data is up to date.</p>
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">How offline mode works</h4>
            <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
              <li>• Your changes are saved locally when you work offline</li>
              <li>• Pending operations appear in this queue</li>
              <li>• Sync automatically triggers when you reconnect</li>
              <li>• Manual sync button available if needed</li>
              <li>• Conflicts detected during sync are flagged for review</li>
            </ul>
          </div>
        </div>
      </div>
      </TierGate>
    </>
  );
};

export default OfflinePage;
