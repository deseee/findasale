/**
 * Feature #69: Local-First Offline Mode
 * IndexedDB wrapper for managing offline operations and syncing
 */

export interface OfflineItem {
  localId: string;
  itemId?: string; // Server ID once synced
  syncStatus: 'PENDING_CREATE' | 'PENDING_UPDATE' | 'SYNCED';
  saleId: string;
  title: string;
  description?: string;
  price?: number;
  category?: string;
  condition?: string;
  photoUrls: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  timestamp: string; // Client timestamp for conflict detection
}

export interface OfflinePhoto {
  localPhotoId: string;
  localItemId: string;
  url: string; // Data URI or blob URL
  createdAt: string;
}

export interface SyncQueueEntry {
  seq: number;
  localId: string;
  itemId?: string;
  operation: 'CREATE_ITEM' | 'UPDATE_ITEM' | 'DELETE_ITEM' | 'UPLOAD_PHOTO';
  status: 'PENDING' | 'SENT' | 'CONFIRMED';
  payload: any;
  saleId: string;
  timestamp: string;
  retryCount: number;
}

const DB_NAME = 'findASaleOffline';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

/**
 * Initialize IndexedDB database with object stores
 */
export async function initOfflineDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create offlineItems store
      if (!db.objectStoreNames.contains('offlineItems')) {
        const itemStore = db.createObjectStore('offlineItems', { keyPath: 'localId' });
        itemStore.createIndex('byItemId', 'itemId', { unique: false });
        itemStore.createIndex('byStatus', 'syncStatus', { unique: false });
        itemStore.createIndex('bySaleId', 'saleId', { unique: false });
      }

      // Create offlinePhotos store
      if (!db.objectStoreNames.contains('offlinePhotos')) {
        const photoStore = db.createObjectStore('offlinePhotos', { keyPath: 'localPhotoId' });
        photoStore.createIndex('byItemId', 'localItemId', { unique: false });
        photoStore.createIndex('byUrl', 'url', { unique: false });
      }

      // Create syncQueue store
      if (!db.objectStoreNames.contains('syncQueue')) {
        const queueStore = db.createObjectStore('syncQueue', { keyPath: 'seq', autoIncrement: true });
        queueStore.createIndex('byStatus', 'status', { unique: false });
        queueStore.createIndex('byItemId', 'localId', { unique: false });
      }

      // Create metadata store for last sync time
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' });
      }
    };
  });
}

/**
 * Record a new offline item (CREATE)
 */
export async function recordOfflineItem(saleId: string, item: Omit<OfflineItem, 'localId' | 'syncStatus'>): Promise<OfflineItem> {
  const db = await initOfflineDB();
  const localId = generateLocalId();
  const now = new Date().toISOString();

  const offlineItem: OfflineItem = {
    localId,
    syncStatus: 'PENDING_CREATE',
    saleId,
    title: item.title,
    description: item.description,
    price: item.price,
    category: item.category,
    condition: item.condition,
    photoUrls: item.photoUrls || [],
    tags: item.tags || [],
    createdAt: now,
    updatedAt: now,
    timestamp: now,
  };

  // Save item
  await saveToStore(db, 'offlineItems', offlineItem);

  // Add to sync queue
  await saveToStore(db, 'syncQueue', {
    localId,
    operation: 'CREATE_ITEM' as const,
    status: 'PENDING' as const,
    saleId,
    payload: offlineItem,
    timestamp: now,
    retryCount: 0,
  });

  return offlineItem;
}

/**
 * Record an offline item update
 */
export async function recordOfflineItemUpdate(itemId: string, saleId: string, updates: Partial<OfflineItem>): Promise<void> {
  const db = await initOfflineDB();
  const now = new Date().toISOString();

  // Find existing item by itemId
  const item = await getFromIndex(db, 'offlineItems', 'byItemId', itemId);
  if (!item) {
    console.warn(`[Offline] Item ${itemId} not found in offline store`);
    return;
  }

  // Update the item
  const updated = { ...item, ...updates, updatedAt: now, syncStatus: 'PENDING_UPDATE' as const };
  await saveToStore(db, 'offlineItems', updated);

  // Add to sync queue
  await saveToStore(db, 'syncQueue', {
    localId: item.localId,
    itemId,
    operation: 'UPDATE_ITEM' as const,
    status: 'PENDING' as const,
    saleId,
    payload: updated,
    timestamp: now,
    retryCount: 0,
  });
}

/**
 * Record an offline item deletion (soft delete)
 */
export async function recordOfflineItemDelete(itemId: string, saleId: string): Promise<void> {
  const db = await initOfflineDB();
  const now = new Date().toISOString();

  // Add delete operation to sync queue
  await saveToStore(db, 'syncQueue', {
    localId: itemId,
    itemId,
    operation: 'DELETE_ITEM' as const,
    status: 'PENDING' as const,
    saleId,
    payload: { itemId },
    timestamp: now,
    retryCount: 0,
  });
}

/**
 * Record an offline photo for deferred upload
 */
export async function recordOfflinePhoto(localItemId: string, photoUrl: string): Promise<OfflinePhoto> {
  const db = await initOfflineDB();
  const localPhotoId = generateLocalId();
  const now = new Date().toISOString();

  const offlinePhoto: OfflinePhoto = {
    localPhotoId,
    localItemId,
    url: photoUrl,
    createdAt: now,
  };

  await saveToStore(db, 'offlinePhotos', offlinePhoto);

  // Add to sync queue
  await saveToStore(db, 'syncQueue', {
    localId: localPhotoId,
    operation: 'UPLOAD_PHOTO' as const,
    status: 'PENDING' as const,
    saleId: '', // Will be filled by sync
    payload: offlinePhoto,
    timestamp: now,
    retryCount: 0,
  });

  return offlinePhoto;
}

/**
 * Get all pending sync operations
 */
export async function getPendingSync(): Promise<SyncQueueEntry[]> {
  const db = await initOfflineDB();
  return getAllFromStore(db, 'syncQueue');
}

/**
 * Get pending sync count
 */
export async function getPendingSyncCount(): Promise<number> {
  const db = await initOfflineDB();
  const entries = await getAllFromStore(db, 'syncQueue');
  return entries.filter(e => e.status === 'PENDING').length;
}

/**
 * Get all offline items
 */
export async function getAllOfflineItems(): Promise<OfflineItem[]> {
  const db = await initOfflineDB();
  return getAllFromStore(db, 'offlineItems');
}

/**
 * Get offline item by localId
 */
export async function getOfflineItem(localId: string): Promise<OfflineItem | null> {
  const db = await initOfflineDB();
  return getFromStore(db, 'offlineItems', localId);
}

/**
 * Get offline item by saleId
 */
export async function getOfflineItemsBySale(saleId: string): Promise<OfflineItem[]> {
  const db = await initOfflineDB();
  return getAllFromIndex(db, 'offlineItems', 'bySaleId', saleId);
}

/**
 * Mark sync entries as confirmed (after successful sync)
 */
export async function markSyncConfirmed(localIds: string[]): Promise<void> {
  const db = await initOfflineDB();
  const entries = await getAllFromStore(db, 'syncQueue');
  const now = new Date().toISOString();

  for (const entry of entries) {
    if (localIds.includes(entry.localId)) {
      await saveToStore(db, 'syncQueue', {
        ...entry,
        status: 'CONFIRMED',
        timestamp: now,
      });
    }
  }
}

/**
 * Update localId → itemId mapping after server-side create
 */
export async function mapLocalToServerId(localId: string, serverId: string): Promise<void> {
  const db = await initOfflineDB();
  const item = await getFromStore(db, 'offlineItems', localId);
  if (item) {
    await saveToStore(db, 'offlineItems', {
      ...item,
      itemId: serverId,
      syncStatus: 'SYNCED',
    });
  }
}

/**
 * Clear synced operations from queue (cleanup)
 */
export async function clearSyncedOperations(): Promise<void> {
  const db = await initOfflineDB();
  const entries = await getAllFromStore(db, 'syncQueue');

  for (const entry of entries) {
    if (entry.status === 'CONFIRMED') {
      await deleteFromStore(db, 'syncQueue', entry.seq);
    }
  }
}

/**
 * Clear all offline data (destructive)
 */
export async function clearAllOfflineData(): Promise<void> {
  const db = await initOfflineDB();
  await clearStore(db, 'offlineItems');
  await clearStore(db, 'offlinePhotos');
  await clearStore(db, 'syncQueue');
  await saveMetadata(db, 'lastSyncAt', new Date().toISOString());
}

/**
 * Get last sync timestamp
 */
export async function getLastSyncTime(): Promise<string | null> {
  const db = await initOfflineDB();
  return getMetadata(db, 'lastSyncAt');
}

/**
 * Update last sync time
 */
export async function setLastSyncTime(timestamp: string): Promise<void> {
  const db = await initOfflineDB();
  await saveMetadata(db, 'lastSyncAt', timestamp);
}

/**
 * Internal: Generate UUID for offline IDs
 */
function generateLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Internal: Get single item from store
 */
function getFromStore(db: IDBDatabase, storeName: string, key: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

/**
 * Internal: Get all items from store
 */
function getAllFromStore(db: IDBDatabase, storeName: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

/**
 * Internal: Get all items from an index
 */
function getAllFromIndex(db: IDBDatabase, storeName: string, indexName: string, key: any): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

/**
 * Internal: Get single item from index
 */
function getFromIndex(db: IDBDatabase, storeName: string, indexName: string, key: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.get(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

/**
 * Internal: Save item to store
 */
function saveToStore(db: IDBDatabase, storeName: string, item: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(item);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Internal: Delete item from store
 */
function deleteFromStore(db: IDBDatabase, storeName: string, key: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Internal: Clear entire store
 */
function clearStore(db: IDBDatabase, storeName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Internal: Metadata helpers
 */
function getMetadata(db: IDBDatabase, key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['metadata'], 'readonly');
    const store = transaction.objectStore('metadata');
    const request = store.get(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result?.value || null);
  });
}

function saveMetadata(db: IDBDatabase, key: string, value: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['metadata'], 'readwrite');
    const store = transaction.objectStore('metadata');
    const request = store.put({ key, value });

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}
