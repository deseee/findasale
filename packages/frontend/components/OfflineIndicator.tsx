/**
 * Feature #69: Offline Indicator Banner
 * Shows when offline, displays pending item count, allows sync queue access
 */

import React, { useState } from 'react';
import { AlertCircle, Wifi, WifiOff, ChevronRight } from 'lucide-react';
import { useOfflineSyncContext } from '../contexts/OfflineSyncContext';
import SyncQueueModal from './SyncQueueModal';

interface OfflineIndicatorProps {
  className?: string;
}

export default function OfflineIndicator({ className = '' }: OfflineIndicatorProps) {
  const { isOffline, isSyncing, pendingCount, syncError } = useOfflineSyncContext();
  const [showSyncQueue, setShowSyncQueue] = useState(false);

  // Feature gate: only show the banner if offline or has pending items. Root-cause fix
  // (View Queue bug, STATE.md S1068/S1098/S1112): this used to be an unconditional early
  // `return null`, which also unmounts <SyncQueueModal> below it. If a background sync
  // (now a single shared instance via OfflineSyncContext, but the race existed regardless)
  // clears pendingCount to 0 right as/after the organizer opens the modal, the whole
  // component -- including the just-opened modal -- disappeared with it. Once opened, the
  // modal must stay mounted until the organizer explicitly closes it, independent of
  // whether the banner condition still holds.
  const shouldShowBanner = isOffline || pendingCount > 0;
  if (!shouldShowBanner && !showSyncQueue) {
    return null;
  }

  const isError = syncError && !isSyncing;

  return (
    <>
      {shouldShowBanner && (
      <div
        className={`fixed top-[92px] md:top-16 left-0 right-0 z-40 transition-all ${
          isError ? 'bg-red-100 border-b border-red-300' : isOffline ? 'bg-yellow-100 border-b border-yellow-300' : 'bg-blue-100 border-b border-blue-300'
        } ${className}`}
      >
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isError ? (
              <AlertCircle className="w-5 h-5 text-red-600" />
            ) : isSyncing ? (
              <div className="animate-spin">
                <Wifi className="w-5 h-5 text-blue-600" />
              </div>
            ) : isOffline ? (
              <WifiOff className="w-5 h-5 text-yellow-600" />
            ) : (
              <Wifi className="w-5 h-5 text-blue-600" />
            )}

            <div>
              <p className={`font-semibold ${isError ? 'text-red-800' : isOffline ? 'text-yellow-800' : 'text-blue-800'}`}>
                {isError ? 'Sync Error' : isSyncing ? 'Syncing...' : isOffline ? "You're Offline" : 'Offline Changes Pending'}
              </p>
              {(isOffline || isSyncing || isError) && (
                <p className={`text-sm ${isError ? 'text-red-700' : isOffline ? 'text-yellow-700' : 'text-blue-700'}`}>
                  {isError ? syncError : isSyncing ? `Syncing ${pendingCount} item${pendingCount !== 1 ? 's' : ''}...` : isOffline ? 'Changes will sync when reconnected' : `${pendingCount} pending change${pendingCount !== 1 ? 's' : ''}`}
                </p>
              )}
            </div>
          </div>

          {(pendingCount > 0 || isError) && (
            <button
              onClick={() => setShowSyncQueue(true)}
              className="flex items-center gap-1 px-3 py-2 rounded bg-white/80 dark:bg-warm-700/80 hover:bg-white dark:hover:bg-warm-700 text-gray-700 dark:text-warm-200 text-sm font-medium transition-colors"
            >
              {isError ? 'Review' : 'View Queue'}
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      )}

      {/* Padding to offset fixed banner */}
      {shouldShowBanner && <div className="h-[80px]" />}

      {/* Sync Queue Modal -- stays mounted independent of shouldShowBanner, see guard above */}
      <SyncQueueModal isOpen={showSyncQueue} onClose={() => setShowSyncQueue(false)} />
    </>
  );
}
