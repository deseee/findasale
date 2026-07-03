/**
 * Feature #69: Sync Queue Modal
 * Displays pending operations, manual sync, conflict resolution, and cache management
 */

import React, { useState, useEffect } from 'react';
import { X, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
import { getPendingSync, clearAllOfflineData, getLastSyncTime } from '../lib/offlineSync';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { useToast } from './ToastContext';
import AccessibleModal from './AccessibleModal';

interface SyncQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SyncQueueModal({ isOpen, onClose }: SyncQueueModalProps) {
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { triggerSync, isSyncing, isOffline } = useOfflineSync();
  const { showToast } = useToast();

  // Load queue items when modal opens
  useEffect(() => {
    if (isOpen) {
      loadQueueData();
    }
  }, [isOpen]);

  const loadQueueData = async () => {
    setIsLoading(true);
    try {
      const pending = await getPendingSync();
      setQueueItems(pending);
      const lastSync = await getLastSyncTime();
      setLastSyncTime(lastSync);
    } catch (error) {
      console.error('[Offline] Failed to load queue:', error);
      showToast('Failed to load sync queue', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSync = async () => {
    if (isOffline) {
      showToast('Cannot sync while offline', 'warning');
      return;
    }
    await triggerSync();
    setTimeout(() => loadQueueData(), 2000);
  };

  const handleClearCache = async () => {
    if (!confirm('Are you sure? This will delete all offline data and pending changes.')) {
      return;
    }

    try {
      await clearAllOfflineData();
      setQueueItems([]);
      showToast('Offline cache cleared', 'success');
      onClose();
    } catch (error) {
      console.error('[Offline] Failed to clear cache:', error);
      showToast('Failed to clear cache', 'error');
    }
  };

  if (!isOpen) return null;

  const pendingCount = queueItems.filter(q => q.status === 'PENDING').length;
  const confirmedCount = queueItems.filter(q => q.status === 'CONFIRMED').length;
  // #561: cash sales where a replay found the item already sold elsewhere while this
  // device was offline. Never auto-resolved — organizer reviews manually.
  const reconciliationCount = queueItems.filter(q => q.status === 'NEEDS_RECONCILIATION').length;

  // #561: flag (never reject) any CHECKOUT_CASH entry that's been unsynced 24h+, per
  // Patrick's decision — cash already collected in hand carries none of the card-auth
  // staleness risk that would justify a hard expiry.
  const isStaleCashEntry = (item: any) =>
    item.operation === 'CHECKOUT_CASH' &&
    (item.status === 'PENDING' || item.status === 'NEEDS_RECONCILIATION') &&
    Date.now() - new Date(item.timestamp).getTime() > 24 * 60 * 60 * 1000;

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="sync-queue-modal-title"
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 p-6 flex items-center justify-between">
          <div>
            <h2 id="sync-queue-modal-title" className="text-2xl font-bold text-gray-900">Offline Sync Queue</h2>
            <p className="text-sm text-gray-500 mt-1">
              {pendingCount} pending • {confirmedCount} confirmed
              {reconciliationCount > 0 && ` • ${reconciliationCount} need${reconciliationCount > 1 ? '' : 's'} reconciliation`}
              {lastSyncTime && ` • Last sync: ${new Date(lastSyncTime).toLocaleTimeString()}`}
            </p>
          </div>
          <button aria-label="Close" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin inline-block">
                <RefreshCw className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-gray-500 mt-2">Loading queue...</p>
            </div>
          ) : queueItems.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No pending operations</p>
            </div>
          ) : (
            <div className="space-y-4">
              {queueItems.map((item, idx) => {
                const needsReconciliation = item.status === 'NEEDS_RECONCILIATION';
                const stale = isStaleCashEntry(item);
                return (
                <div
                  key={idx}
                  className={`border rounded-lg p-4 ${
                    needsReconciliation
                      ? 'border-red-300 bg-red-50'
                      : item.status === 'PENDING'
                        ? 'border-yellow-300 bg-yellow-50'
                        : 'border-gray-300 bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{item.operation}</p>
                      <p className="text-sm text-gray-600 mt-1">
                        ID: <code className="bg-gray-200 px-2 py-1 rounded text-xs">{item.localId}</code>
                      </p>

                      {item.payload && (
                        <div className="mt-2 text-sm text-gray-700 space-y-1">
                          {item.payload.title && <p>Title: {item.payload.title}</p>}
                          {item.payload.price && <p>Price: ${(item.payload.price / 100).toFixed(2)}</p>}
                          {item.payload.category && <p>Category: {item.payload.category}</p>}
                          {item.operation === 'CHECKOUT_CASH' && (
                            <>
                              <p>Cash sale: ${(item.payload.items || []).reduce((sum: number, i: any) => sum + (i.amount || 0), 0).toFixed(2)}</p>
                              <p>Cash received: ${Number(item.payload.cashReceived || 0).toFixed(2)}</p>
                            </>
                          )}
                        </div>
                      )}

                      {needsReconciliation && (
                        <p className="mt-2 text-sm text-red-700 flex items-start gap-1">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          Needs reconciliation — one or more items in this sale were already sold elsewhere while this device was offline. This sale was NOT recorded; review manually before re-entering it.
                        </p>
                      )}

                      {stale && (
                        <p className="mt-2 text-xs font-medium text-amber-700 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Unsynced 24h+ — will keep retrying, will not expire
                        </p>
                      )}
                    </div>

                    <div className="ml-4 text-right">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          needsReconciliation
                            ? 'bg-red-200 text-red-800'
                            : item.status === 'PENDING'
                              ? 'bg-yellow-200 text-yellow-800'
                              : 'bg-green-200 text-green-800'
                        }`}
                      >
                        {needsReconciliation ? 'NEEDS REVIEW' : item.status}
                      </span>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 flex items-center justify-between gap-3 bg-gray-50">
          <button
            onClick={handleClearCache}
            className="flex items-center gap-2 px-4 py-2 rounded text-red-600 hover:bg-red-50 text-sm font-medium transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear Cache
          </button>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleManualSync}
              disabled={isOffline || isSyncing || pendingCount === 0}
              className="flex items-center gap-2 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        </div>
      </div>
    </AccessibleModal>
  );
}
