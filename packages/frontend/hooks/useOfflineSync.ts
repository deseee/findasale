/**
 * Feature #69: useOfflineSync Hook
 * Manages offline state, auto-sync on reconnect, pending item count
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { getPendingSync, getPendingSyncCount, initOfflineDB, markSyncConfirmed, mapLocalToServerId, clearSyncedOperations, setLastSyncTime } from '../lib/offlineSync';
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
    updatePendingCount();

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

    const pending = await getPendingSync();
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

      const response = await axios.post('/api/sync/batch', {
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
        const failureMsg = failed.map((f: any) => `${f.localId}: ${f.error}`).join(', ');
        setSyncError(`Failed to sync: ${failureMsg}`);
        showToast(`Sync error: ${failureMsg}`, 'error');
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
