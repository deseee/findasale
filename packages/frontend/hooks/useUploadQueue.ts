/**
 * useUploadQueue
 *
 * Manages client-side Cloudinary upload queue with:
 * - Max 3 concurrent uploads (per UX spec)
 * - IndexedDB persistence (key: `rapidfire-batch-${saleId}`)
 * - Queue items: { id, blob, saleId, status: 'pending' | 'uploading' | 'done' | 'error' }
 * - Auto-starts uploads when slots free up
 * - Exports: { queue, enqueue, cancel, clearCompleted, uploadingCount }
 *
 * Endpoint: POST /api/upload/sale-photos (multipart/form-data)
 * Storage cleanup: removes blob from IndexedDB after successful upload
 */

import { useState, useCallback, useEffect, useRef } from 'react';

const MAX_CONCURRENT = 3;
const DB_NAME = 'FindASale';
const STORE_NAME = 'RapidFireUploads';

type QueueStatus = 'pending' | 'uploading' | 'done' | 'error';

export interface QueueItem {
  id: string;
  blob: Blob;
  saleId: string;
  status: QueueStatus;
  error?: string;
  cloudinaryUrl?: string;
}

interface UseUploadQueueReturn {
  queue: QueueItem[];
  enqueue: (blob: Blob, saleId: string) => { id: string; queued: boolean };
  cancel: (id: string) => void;
  clearCompleted: () => void;
  uploadingCount: number;
}

// ─────────────────────────────────────────────────────────────────────────
// IndexedDB Helpers
// ─────────────────────────────────────────────────────────────────────────

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });

const saveToIndexedDB = async (item: QueueItem): Promise<void> => {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(item);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

const deleteFromIndexedDB = async (id: string): Promise<void> => {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

const loadFromIndexedDB = async (saleId: string): Promise<QueueItem[]> => {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const items = (request.result as QueueItem[]).filter(
          (item) => item.saleId === saleId
        );
        resolve(items);
      };
    });
  } catch {
    return [];
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────

export const useUploadQueue = (saleId: string): UseUploadQueueReturn => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const uploadingRef = useRef<Set<string>>(new Set());

  // Load queue from IndexedDB on mount
  useEffect(() => {
    loadFromIndexedDB(saleId).then((items) => {
      setQueue(items);
      const uploadingIds = items
        .filter((item) => item.status === 'uploading')
        .map((item) => item.id);
      uploadingRef.current = new Set(uploadingIds);
      setUploadingCount(uploadingIds.length);
    });
  }, [saleId]);

  // Process queue: auto-start uploads when slots available
  useEffect(() => {
    const processQueue = async () => {
      const pendingItems = queue.filter((item) => item.status === 'pending');
      const availableSlots = MAX_CONCURRENT - uploadingRef.current.size;

      if (pendingItems.length === 0 || availableSlots <= 0) return;

      const itemsToUpload = pendingItems.slice(0, availableSlots);

      for (const item of itemsToUpload) {
        uploadingRef.current.add(item.id);
        setUploadingCount(uploadingRef.current.size);

        // Update local state
        setQueue((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, status: 'uploading' as QueueStatus } : it
          )
        );

        // Persist to IndexedDB
        await saveToIndexedDB({ ...item, status: 'uploading' });

        // Start async upload
        uploadToCloudinary(item.blob, item.id, saleId).catch(() => {
          // Error handled in uploadToCloudinary
        });
      }
    };

    processQueue();
  }, [queue, saleId]);

  const uploadToCloudinary = useCallback(
    async (blob: Blob, itemId: string, currentSaleId: string) => {
      try {
        const formData = new FormData();
        formData.append('photos', blob, `rapid-${itemId}.jpg`);

        const response = await fetch('/api/upload/sale-photos', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) throw new Error('Upload failed');

        const data = await response.json();
        const cloudinaryUrl = (data.urls && data.urls[0]) || data.url;

        // Update state to 'done'
        setQueue((prev) =>
          prev.map((it) =>
            it.id === itemId
              ? {
                  ...it,
                  status: 'done' as QueueStatus,
                  cloudinaryUrl,
                }
              : it
          )
        );

        // Update IndexedDB
        const updatedItem: QueueItem = {
          id: itemId,
          blob,
          saleId: currentSaleId,
          status: 'done',
          cloudinaryUrl,
        };
        await saveToIndexedDB(updatedItem);

        // Clean up blob from storage (storage hygiene per ADR B3)
        await deleteFromIndexedDB(itemId);
      } catch (error) {
        // Mark as error
        const errorMsg = error instanceof Error ? error.message : 'Upload failed';
        setQueue((prev) =>
          prev.map((it) =>
            it.id === itemId
              ? { ...it, status: 'error' as QueueStatus, error: errorMsg }
              : it
          )
        );

        // Persist error state
        const item = queue.find((it) => it.id === itemId);
        if (item) {
          await saveToIndexedDB({ ...item, status: 'error', error: errorMsg });
        }
      } finally {
        // Free up the slot
        uploadingRef.current.delete(itemId);
        setUploadingCount(uploadingRef.current.size);
      }
    },
    [queue]
  );

  const enqueue = useCallback(
    (blob: Blob, currentSaleId: string): { id: string; queued: boolean } => {
      const id = `rapid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const newItem: QueueItem = {
        id,
        blob,
        saleId: currentSaleId,
        status: 'pending',
      };

      setQueue((prev) => [...prev, newItem]);
      saveToIndexedDB(newItem).catch(() => {
        // Silently fail if IndexedDB is not available
      });

      const queued = uploadingRef.current.size >= MAX_CONCURRENT;
      return { id, queued };
    },
    []
  );

  const cancel = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
    deleteFromIndexedDB(id).catch(() => {
      // Silently fail
    });
  }, []);

  const clearCompleted = useCallback(() => {
    const completedIds = queue
      .filter((item) => item.status === 'done' || item.status === 'error')
      .map((item) => item.id);

    setQueue((prev) =>
      prev.filter((item) => !completedIds.includes(item.id))
    );

    completedIds.forEach((id) => {
      deleteFromIndexedDB(id).catch(() => {
        // Silently fail
      });
    });
  }, [queue]);

  return {
    queue,
    enqueue,
    cancel,
    clearCompleted,
    uploadingCount,
  };
};

export default useUploadQueue;
