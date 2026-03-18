/**
 * useOfflineMode.ts — React Query hooks for Feature #69: Local-First Offline Mode
 *
 * Hooks:
 *   useOfflineStatus()  — Tracks navigator.onLine status + queue depth
 *   useSyncQueue()      — GET /api/offline-queue (fetch pending operations)
 *   useTriggerSync()    — POST /api/sync/batch (trigger batch sync)
 */

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export type SyncOperationType = 'CREATE_ITEM' | 'UPDATE_ITEM' | 'DELETE_ITEM' | 'UPLOAD_PHOTO';

export interface OfflineQueueItem {
  localId: string;
  itemId?: string;
  saleId: string;
  type: SyncOperationType;
  payload: Record<string, any>;
  timestamp: string;
  retryCount?: number;
}

export interface SyncResponse {
  synced: Array<{
    localId: string;
    itemId: string;
    status: 'SUCCESS' | 'CONFLICT';
    serverTimestamp: string;
    resolvedValues?: Record<string, any>;
  }>;
  failed: Array<{
    localId: string;
    error: string;
    retryable: boolean;
  }>;
  serverItems: Array<{
    itemId: string;
    updatedAt: string;
    reason: 'SOLD' | 'PRICE_DROPPED_BY_ORGANIZER' | 'OTHER';
  }>;
}

export interface OfflineStatus {
  isOnline: boolean;
  queueDepth: number;
  lastSyncedAt?: string;
}

// ─── useOfflineStatus ─────────────────────────────────────────────────────
/**
 * Tracks real-time online/offline status and queue depth.
 * Uses window online/offline events and localStorage queue.
 */
export function useOfflineStatus(): OfflineStatus {
  const [isOnline, setIsOnline] = useState(true);
  const [queueDepth, setQueueDepth] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | undefined>();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Set initial state
    setIsOnline(navigator.onLine);

    // Load queue depth from localStorage
    const updateQueueDepth = () => {
      try {
        const queueStr = localStorage.getItem('offlineQueue');
        const queue = queueStr ? JSON.parse(queueStr) : [];
        setQueueDepth(queue.length);

        const lastSync = localStorage.getItem('lastSyncedAt');
        if (lastSync) setLastSyncedAt(lastSync);
      } catch (err) {
        console.error('[useOfflineStatus] Error reading localStorage:', err);
      }
    };

    updateQueueDepth();

    // Listen for online/offline events
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('storage', updateQueueDepth);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('storage', updateQueueDepth);
    };
  }, []);

  return {
    isOnline,
    queueDepth,
    lastSyncedAt,
  };
}

// ─── useSyncQueue ─────────────────────────────────────────────────────────
/**
 * Get pending offline operations from localStorage.
 */
export function useSyncQueue() {
  const [queue, setQueue] = useState<OfflineQueueItem[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const loadQueue = () => {
      try {
        const queueStr = localStorage.getItem('offlineQueue');
        setQueue(queueStr ? JSON.parse(queueStr) : []);
      } catch (err) {
        console.error('[useSyncQueue] Error reading localStorage:', err);
        setQueue([]);
      }
    };

    loadQueue();

    // Listen for storage changes (updates from other tabs)
    window.addEventListener('storage', loadQueue);
    return () => window.removeEventListener('storage', loadQueue);
  }, []);

  return {
    data: {
      data: queue,
    },
  };
}

// ─── POST /api/sync/batch ─────────────────────────────────────────────────
/**
 * Trigger batch sync of all queued offline operations.
 * Returns success/conflict/failed operations.
 */
export function useTriggerSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (operations?: OfflineQueueItem[]) => {
      const res = await api.post('/sync/batch', {
        operations: operations || [],
        clientState: {
          timestamp: new Date().toISOString(),
        },
      });
      return res.data as SyncResponse;
    },
    onSuccess: (data) => {
      // Update lastSyncedAt in localStorage
      localStorage.setItem('lastSyncedAt', new Date().toISOString());

      // Remove successfully synced items from queue
      if (data.synced.length > 0) {
        try {
          const queueStr = localStorage.getItem('offlineQueue');
          let queue = queueStr ? JSON.parse(queueStr) : [];
          const syncedLocalIds = data.synced.map(s => s.localId);
          queue = queue.filter((item: OfflineQueueItem) => !syncedLocalIds.includes(item.localId));
          localStorage.setItem('offlineQueue', JSON.stringify(queue));
        } catch (err) {
          console.error('[useTriggerSync] Error updating localStorage:', err);
        }
      }

      // Update retry count for failed items
      if (data.failed.length > 0) {
        try {
          const queueStr = localStorage.getItem('offlineQueue');
          let queue = queueStr ? JSON.parse(queueStr) : [];
          queue = queue.map((item: OfflineQueueItem) => {
            const failed = data.failed.find(f => f.localId === item.localId);
            if (failed) {
              return { ...item, retryCount: (item.retryCount || 0) + 1 };
            }
            return item;
          });
          localStorage.setItem('offlineQueue', JSON.stringify(queue));
        } catch (err) {
          console.error('[useTriggerSync] Error updating retry count:', err);
        }
      }

      // Invalidate queries to refetch
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}
