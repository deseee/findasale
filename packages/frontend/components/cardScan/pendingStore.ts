/**
 * pendingStore (ADR-138 batch B7): where pictures that are not sent yet are kept so a reload does not lose them.
 *
 * IndexedDB can hold the picture itself (a Blob). Every storage call is wrapped, and when IndexedDB is missing, blocked (private
 * windows) or fails, the store quietly keeps the list in memory for this page only. A store that fails never stops sending:
 * lib/cardScanQueue.ts ignores errors from save() and load().
 */
import type { PendingStore, PersistedUpload } from '../../lib/cardScanQueue';

const DB_NAME = 'findasale-card-scan';
const STORE_NAME = 'pending-frames';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    try {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB could not be opened'));
      req.onblocked = () => reject(new Error('IndexedDB is blocked'));
    } catch (err) {
      reject(err);
    }
  });
}

async function idbRead(key: string): Promise<unknown> {
  const db = await openDb();
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Read failed'));
    });
  } finally {
    db.close();
  }
}

async function idbWrite(key: string, value: unknown | null): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      if (value === null) store.delete(key);
      else store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Write failed'));
      tx.onabort = () => reject(tx.error || new Error('Write was stopped'));
    });
  } finally {
    db.close();
  }
}

function isPersisted(v: unknown): v is PersistedUpload<Blob> {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.clientEntryId === 'string' && r.clientEntryId !== '' && typeof r.seq === 'number' && typeof Blob !== 'undefined' && r.frame instanceof Blob;
}

/** One store per scan. The key is the session id, so pictures from another scan are never sent into this one. */
export function createPendingStore(sessionId: string): PendingStore<Blob> {
  let memory: PersistedUpload<Blob>[] = [];
  return {
    async load() {
      try {
        const saved = await idbRead(sessionId);
        if (Array.isArray(saved)) return saved.filter(isPersisted);
      } catch {
        /* fall back to the list kept in memory */
      }
      return memory.slice();
    },
    async save(items) {
      memory = items.slice();
      try {
        await idbWrite(sessionId, items.length === 0 ? null : items);
      } catch {
        /* memory only */
      }
    },
  };
}
