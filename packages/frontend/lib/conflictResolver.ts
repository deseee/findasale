/**
 * Feature #69: Conflict Resolution for Offline Sync
 * Implements last-write-wins for scalar fields, merge strategy for arrays
 */

export interface ItemConflict {
  localItem: any;
  serverItem: any;
  conflictingFields: string[];
  resolution: 'KEEP_LOCAL' | 'KEEP_SERVER' | 'MERGE';
  resolvedItem: any;
}

/**
 * Resolve conflict between local and server item
 * Strategy: last-write-wins for scalar fields based on updatedAt timestamp
 * Arrays (photos, tags): union with deduplication
 */
export function resolveItemConflict(
  localItem: any,
  serverItem: any,
  resolution: 'KEEP_LOCAL' | 'KEEP_SERVER' | 'MERGE' = 'MERGE'
): ItemConflict {
  const conflictingFields: string[] = [];
  const resolvedItem = { ...serverItem }; // Start with server as baseline

  const scalarFields = ['title', 'description', 'price', 'category', 'condition', 'sku'];
  const arrayFields = ['photoUrls', 'tags'];

  // Determine which item is newer (last-write-wins)
  const localTime = new Date(localItem.updatedAt || localItem.timestamp).getTime();
  const serverTime = new Date(serverItem.updatedAt).getTime();
  const isLocalNewer = localTime > serverTime;

  for (const field of scalarFields) {
    const localValue = localItem[field];
    const serverValue = serverItem[field];

    if (localValue !== serverValue) {
      conflictingFields.push(field);

      if (resolution === 'KEEP_LOCAL') {
        resolvedItem[field] = localValue;
      } else if (resolution === 'KEEP_SERVER') {
        resolvedItem[field] = serverValue;
      } else {
        // MERGE: last-write-wins
        resolvedItem[field] = isLocalNewer ? localValue : serverValue;
      }
    }
  }

  // Merge arrays (photos, tags) — union without duplicates
  for (const field of arrayFields) {
    const localArray = Array.isArray(localItem[field]) ? localItem[field] : [];
    const serverArray = Array.isArray(serverItem[field]) ? serverItem[field] : [];

    if (JSON.stringify(localArray) !== JSON.stringify(serverArray)) {
      conflictingFields.push(field);

      if (resolution === 'KEEP_LOCAL') {
        resolvedItem[field] = localArray;
      } else if (resolution === 'KEEP_SERVER') {
        resolvedItem[field] = serverArray;
      } else {
        // MERGE: union of both arrays
        const merged = [...serverArray];
        for (const item of localArray) {
          if (!merged.includes(item)) {
            merged.push(item);
          }
        }
        resolvedItem[field] = merged;
      }
    }
  }

  // Preserve server IDs and timestamps
  resolvedItem.id = serverItem.id;
  resolvedItem.updatedAt = serverItem.updatedAt;

  return {
    localItem,
    serverItem,
    conflictingFields,
    resolution,
    resolvedItem,
  };
}

/**
 * Check if two items have conflicts (used for conflict detection UI)
 */
export function hasConflict(localItem: any, serverItem: any): boolean {
  const scalarFields = ['title', 'description', 'price', 'category', 'condition'];
  const arrayFields = ['photoUrls', 'tags'];

  for (const field of scalarFields) {
    if (localItem[field] !== serverItem[field]) {
      return true;
    }
  }

  for (const field of arrayFields) {
    const localArray = Array.isArray(localItem[field]) ? localItem[field] : [];
    const serverArray = Array.isArray(serverItem[field]) ? serverItem[field] : [];
    if (JSON.stringify(localArray) !== JSON.stringify(serverArray)) {
      return true;
    }
  }

  return false;
}

/**
 * Extract conflicting fields for UI display
 */
export function getConflictingFields(localItem: any, serverItem: any): Array<{ field: string; local: any; server: any }> {
  const conflicts: Array<{ field: string; local: any; server: any }> = [];

  const scalarFields = ['title', 'description', 'price', 'category', 'condition'];
  const arrayFields = ['photoUrls', 'tags'];

  for (const field of scalarFields) {
    if (localItem[field] !== serverItem[field]) {
      conflicts.push({
        field,
        local: localItem[field],
        server: serverItem[field],
      });
    }
  }

  for (const field of arrayFields) {
    const localArray = Array.isArray(localItem[field]) ? localItem[field] : [];
    const serverArray = Array.isArray(serverItem[field]) ? serverItem[field] : [];
    if (JSON.stringify(localArray) !== JSON.stringify(serverArray)) {
      conflicts.push({
        field,
        local: localArray,
        server: serverArray,
      });
    }
  }

  return conflicts;
}
