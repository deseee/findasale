import React, { createContext, useContext } from 'react';
import { useOfflineSync } from '../hooks/useOfflineSync';

/**
 * Offline Sync Context — single shared instance of useOfflineSync().
 *
 * Root-cause fix for the offline POS reconnect-sync / "View Queue" bug
 * (STATE.md Blocked Queue, S1068/advanced S1098, re-confirmed broken after the
 * S1111/S1112 attempts). Confirmed by reading the code (not assumed): useOfflineSync()
 * was being instantiated independently in THREE separate places —
 * `OfflineSyncInitializer` in pages/_app.tsx, `OfflineIndicator.tsx`, and
 * `SyncQueueModal.tsx` — each one a fully separate hook call with its own
 * isOffline/pendingCount/isSyncing state, its own `online`/`offline` window
 * listeners, and its own `syncInProgressRef` in-flight guard. Consequences:
 *   (a) up to 3 redundant, simultaneous `POST /sync/batch` calls fire on a single
 *       reconnect event, risking duplicate CREATE_ITEM/UPDATE_ITEM writes server-side
 *       (those op types have no idempotency key, unlike CHECKOUT_CASH's
 *       clientTransactionId dedup — see syncController.ts handleCreateItem).
 *   (b) the banner/modal's own pendingCount/isSyncing state was never guaranteed to
 *       reflect what the OTHER instances were doing to the same underlying IndexedDB
 *       queue, so the UI could show stale/inconsistent state relative to reality.
 * Fix: ONE useOfflineSync() instance lives here, mounted once via OfflineSyncProvider
 * at the app root (pages/_app.tsx), and every consumer reads/dispatches through
 * useOfflineSyncContext() instead of calling the hook itself.
 */
type OfflineSyncContextValue = ReturnType<typeof useOfflineSync>;

const OfflineSyncContext = createContext<OfflineSyncContextValue | undefined>(undefined);

export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const value = useOfflineSync();
  return (
    <OfflineSyncContext.Provider value={value}>
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSyncContext(): OfflineSyncContextValue {
  const context = useContext(OfflineSyncContext);
  if (!context) {
    throw new Error('useOfflineSyncContext must be used within OfflineSyncProvider');
  }
  return context;
}
