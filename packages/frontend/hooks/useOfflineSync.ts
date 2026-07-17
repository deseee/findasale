/**
 * Feature #69: useOfflineSync Hook
 * Manages offline state, auto-sync on reconnect, pending item count
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../lib/api';
import { getPendingSync, getPendingSyncCount, initOfflineDB, markSyncConfirmed, markNeedsReconciliation, mapLocalToServerId, clearSyncedOperations, setLastSyncTime } from '../lib/offlineSync';
import { useToast } from '../components/ToastContext';

export interface OfflineSyncState {
  isOffline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: string | null;
  syncError: string | null;
}

const SYNC_RETRY_DELAY = 30000; // 30 seconds
const MAX_RETRY_ATTEMPTS = 3;

export function useOfflineSync() {
  const [isOffline, setIsOffline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTimeState] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncInProgressRef = useRef(false);
  const syncRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { showToast } = useToast();

  // Initialize offline DB on mount
  useEffect(() => {
    initOfflineDB().catch((err: any) => console.error('[Offline] DB init failed:', err));
  }, []);

  // Update pending count periodically
  const updatePendingCount = useCallback(async () => {
    const count = await getPendingSyncCount();
    setPendingCount(count);
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = async () => {
      setIsOffline(false);
      setSyncError(null);
      await updatePendingCount();
      // Auto-trigger sync after short delay to allow full network restoration
      setTimeout(() => triggerSync(), 1000);
    };

    const handleOffline = () => {
      setIsOffline(true);
      setSyncError(null);
      if (syncRetryTimeoutRef.current) {
        clearTimeout(syncRetryTimeoutRef.current);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial state check
    setIsOffline(!navigator.onLine);
    updatePendingCount().catch(() => {});

    // Mount-time sync check: the 'online' event only fires on an actual offline->online
    // transition. If the browser is ALREADY online on mount (e.g. organizer queued a sale
    // offline, closed the tab, reopened later with wifi already back), no 'online' event
    // ever fires and queued items sit stuck forever. Check for leftover pending items on
    // mount and trigger sync using the same debounce timing as handleOnline.
    if (navigator.onLine) {
      getPendingSync().then((pending: any) => {
        if (pending.length > 0) {
          setTimeout(() => triggerSync(), 1000);
        }
      }).catch(() => {});
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (syncRetryTimeoutRef.current) {
        clearTimeout(syncRetryTimeoutRef.current);
      }
    };
  }, [updatePendingCount]);

  /**
   * Trigger sync of all pending operations
   */
  const triggerSync = useCallback(async () => {
    if (syncInProgressRef.current) return;
    if (isOffline) return;

    // #561: only resend entries actually awaiting sync. NEEDS_RECONCILIATION entries
    // (a CHECKOUT_CASH replay hit an already-sold item) must NOT be resent every retry —
    // they wait for the organizer to review in SyncQueueModal.
    const pending = (await getPendingSync()).filter((entry: any) => entry.status === 'PENDING');
    if (pending.length === 0) return;

    syncInProgressRef.current = true;
    setIsSyncing(true);
    setSyncError(null);

    try {
      const operations = pending.map((entry: any) => ({
        type: entry.operation,
        localId: entry.localId,
        itemId: entry.itemId,
        saleId: entry.saleId,
        payload: entry.payload,
        timestamp: entry.timestamp,
      }));

      const response = await api.post('/sync/batch', {
        operations,
        clientState: {
          lastSyncAt: lastSyncTime,
          offlineItemCount: pending.length,
        },
      });

      const { synced, failed, serverItems } = response.data;

      // Process successful syncs
      if (synced && synced.length > 0) {
        for (const syncedItem of synced) {
          if (syncedItem.itemId && syncedItem.localId !== syncedItem.itemId) {
            // Map local ID to server ID for creates
            await mapLocalToServerId(syncedItem.localId, syncedItem.itemId);
          }
        }
        await markSyncConfirmed(synced.map((s: any) => s.localId));
      }

      // Handle failures
      if (failed && failed.length > 0) {
        // #561: a CHECKOUT_CASH replay that hit an already-sold item is a genuine double-sell
        // conflict, not a transient sync error. Route it to "needs reconciliation" (stops the
        // endless-retry loop non-retryable failures would otherwise cause) instead of lumping
        // it into the generic failure toast.
        const reconciliationNeeded = failed.filter(
          (f: any) => f.operationType === 'CHECKOUT_CASH' && f.code === 'ITEM_UNAVAILABLE'
        );
        const otherFailures = failed.filter(
          (f: any) => !(f.operationType === 'CHECKOUT_CASH' && f.code === 'ITEM_UNAVAILABLE')
        );

        if (reconciliationNeeded.length > 0) {
          await markNeedsReconciliation(reconciliationNeeded.map((f: any) => f.localId));
          showToast(
            `${reconciliationNeeded.length} cash sale${reconciliationNeeded.length > 1 ? 's' : ''} need${reconciliationNeeded.length > 1 ? '' : 's'} reconciliation — item sold elsewhere while offline. Review in Offline Sync Queue.`,
            'warning'
          );
        }

        if (otherFailures.length > 0) {
          const failureMsg = otherFailures.map((f: any) => `${f.localId}: ${f.error}`).join(', ');
          setSyncError(`Failed to sync: ${failureMsg}`);
          showToast(`Sync error: ${failureMsg}`, 'error');
        }
      }

      // Notify user of conflicts or server-side changes
      if (serverItems && serverItems.length > 0) {
        const msg = `${serverItems.length} items were modified on server`;
        showToast(msg, 'info');
      }

      await clearSyncedOperations();
      await setLastSyncTime(new Date().toISOString());
      setLastSyncTimeState(new Date().toISOString());

      if (synced && synced.length > 0) {
        showToast(`Synced ${synced.length} items`, 'success');
      }

      await updatePendingCount();
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message || 'Unknown sync error';

      if (error.response?.status === 409) {
        // Conflict — show conflict resolution UI
        setSyncError(`Conflict: ${errorMsg}`);
        showToast('Sync conflict — please review', 'warning');
      } else if (error.response?.status >= 400 && error.response?.status < 500) {
        // Permanent error
        setSyncError(errorMsg);
        showToast(`Sync failed: ${errorMsg}`, 'error');
      } else {
        // Transient error — retry
        setSyncError(errorMsg);
        showToast(`Sync error (retrying): ${errorMsg}`, 'warning');

        if (syncRetryTimeoutRef.current) {
          clearTimeout(syncRetryTimeoutRef.current);
        }
        syncRetryTimeoutRef.current = setTimeout(() => {
          if (navigator.onLine) {
            triggerSync();
          }
        }, SYNC_RETRY_DELAY);
      }
    } finally {
      syncInProgressRef.current = false;
      setIsSyncing(false);
    }
  }, [isOffline, lastSyncTime, updatePendingCount, showToast]);

  return {
    isOffline,
    isSyncing,
    pendingCount,
    lastSyncTime,
    syncError,
    triggerSync,
    updatePendingCount,
  };
}
