/**
 * Feature #69: Offline Indicator Banner
 * Shows when offline, displays pending item count, allows sync queue access
 */

import React, { useState } from 'react';
import { AlertCircle, Wifi, WifiOff, ChevronRight } from 'lucide-react';
import { useOfflineSync } from '../hooks/useOfflineSync';
import SyncQueueModal from './SyncQueueModal';

interface OfflineIndicatorProps {
  className?: string;
}

export default function OfflineIndicator({ className = '' }: OfflineIndicatorProps) {
  const { isOffline, isSyncing, pendingCount, syncError } = useOfflineSync();
  const [showSyncQueue, setShowSyncQueue] = useState(false);

  // Feature gate: only show if offline or has pending items
  if (!isOffline && pendingCount === 0) {
    return null;
  }

  const isError = syncError && !isSyncing;

  return (
    <>
      <div
        className={`fixed top-0 left-0 right-0 z-40 transition-all ${
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
              className="flex items-center gap-1 px-3 py-2 rounded bg-white/80 hover:bg-white text-gray-700 text-sm font-medium transition-colors"
            >
              {isError ? 'Review' : 'View Queue'}
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Padding to offset fixed banner */}
      {(isOffline || isSyncing || isError || pendingCount > 0) && <div className="h-[80px]" />}

      {/* Sync Queue Modal */}
      <SyncQueueModal isOpen={showSyncQueue} onClose={() => setShowSyncQueue(false)} />
    </>
  );
}
