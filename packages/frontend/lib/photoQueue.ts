/**
 * Feature #69: Photo Queue for Deferred Offline Upload
 * Queues photos for upload when online, persists in IndexedDB
 */

import { recordOfflinePhoto, getAllOfflineItems, recordOfflineItemUpdate } from './offlineSync';

const DB_NAME = 'findASaleOffline';
const PHOTO_QUEUE_STORE = 'offlinePhotos';

let dbInstance: IDBDatabase | null = null;

/**
 * Initialize photo queue (reuses offlineSync DB)
 */
export async function initPhotoQueue(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
  });
}

/**
 * Queue a photo for deferred upload
 * Accepts File, Blob, or Data URI
 */
export async function queuePhotoForUpload(
  localItemId: string,
  photoFile: File | Blob | string
): Promise<string> {
  // Convert to Data URI if needed
  let photoUri: string;

  if (typeof photoFile === 'string') {
    photoUri = photoFile; // Already a Data URI or URL
  } else {
    photoUri = await fileToDataUri(photoFile);
  }

  // Record in IndexedDB photo queue
  const offlinePhoto = await recordOfflinePhoto(localItemId, photoUri);

  // Add to item's photoUrls array
  const items = await getAllOfflineItems();
  const item = items.find(i => i.localId === localItemId);
  if (item) {
    await recordOfflineItemUpdate(item.itemId || item.localId, item.saleId, {
      photoUrls: [...(item.photoUrls || []), photoUri],
    });
  }

  return offlinePhoto.localPhotoId;
}

/**
 * Get all queued photos
 */
export async function getQueuedPhotos(): Promise<Array<{ localPhotoId: string; localItemId: string; url: string }>> {
  const db = await initPhotoQueue();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PHOTO_QUEUE_STORE], 'readonly');
    const store = transaction.objectStore(PHOTO_QUEUE_STORE);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

/**
 * Get queued photos for a specific item
 */
export async function getQueuedPhotosForItem(localItemId: string): Promise<Array<{ localPhotoId: string; url: string }>> {
  const db = await initPhotoQueue();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PHOTO_QUEUE_STORE], 'readonly');
    const store = transaction.objectStore(PHOTO_QUEUE_STORE);
    const index = store.index('byItemId');
    const request = index.getAll(localItemId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const results = request.result || [];
      resolve(results.map(r => ({ localPhotoId: r.localPhotoId, url: r.url })));
    };
  });
}

/**
 * Remove photo from queue (after successful upload)
 */
export async function removeQueuedPhoto(localPhotoId: string): Promise<void> {
  const db = await initPhotoQueue();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PHOTO_QUEUE_STORE], 'readwrite');
    const store = transaction.objectStore(PHOTO_QUEUE_STORE);
    const request = store.delete(localPhotoId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Clear all queued photos (destructive)
 */
export async function clearPhotoQueue(): Promise<void> {
  const db = await initPhotoQueue();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PHOTO_QUEUE_STORE], 'readwrite');
    const store = transaction.objectStore(PHOTO_QUEUE_STORE);
    const request = store.clear();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Convert File/Blob to Data URI
 * MVP: Store as Data URI (simpler than blob storage)
 */
function fileToDataUri(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
