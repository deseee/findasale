/**
 * notificationPrefsMerge.ts (2026-09-29) -- server-side shallow merge for PATCH /users/me.
 *
 * notificationPrefs used to be replaced wholesale, so a stale client (an old tab, or a screen that only
 * knows about some of the keys) that PATCHed { emailWeeklyDigest: false } silently wiped every other
 * preference the user had set, including opt-outs. The merge keeps every existing key and applies only
 * the keys the client actually sent. An explicit null deletes that key (the way to "unset" a preference);
 * anything else, including false and 0, is stored. The merge is shallow: a nested object value replaces
 * the existing value for that key.
 */

export type NotificationPrefs = Record<string, unknown>;

/** Cap on the stored document so this endpoint cannot be used to park arbitrary blobs. */
export const MAX_NOTIFICATION_PREFS_BYTES = 20 * 1024;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function mergeNotificationPrefs(existing: unknown, incoming: Record<string, unknown>): NotificationPrefs {
  const merged: NotificationPrefs = {};
  if (isPlainObject(existing)) {
    for (const [k, v] of Object.entries(existing)) {
      if (!FORBIDDEN_KEYS.has(k)) merged[k] = v;
    }
  }
  for (const [k, v] of Object.entries(incoming)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    if (v === null) {
      delete merged[k];
    } else if (v !== undefined) {
      merged[k] = v;
    }
  }
  return merged;
}

/** Null when acceptable, otherwise a user-safe error message. */
export function validateIncomingNotificationPrefs(incoming: unknown): string | null {
  if (!isPlainObject(incoming)) return 'notificationPrefs must be an object';
  let size = 0;
  try {
    size = JSON.stringify(incoming).length;
  } catch {
    return 'notificationPrefs must be valid JSON';
  }
  if (size > MAX_NOTIFICATION_PREFS_BYTES) return 'notificationPrefs is too large';
  return null;
}

/**
 * Null when the MERGED document (existing keys plus the incoming change) is within the cap, otherwise a
 * user-safe message. validateIncomingNotificationPrefs only bounds one request; without this check,
 * repeated small PATCHes could grow the stored document past MAX_NOTIFICATION_PREFS_BYTES.
 */
export function validateMergedNotificationPrefs(merged: unknown): string | null {
  let size = 0;
  try {
    size = JSON.stringify(merged ?? {}).length;
  } catch {
    return 'notificationPrefs must be valid JSON';
  }
  if (size > MAX_NOTIFICATION_PREFS_BYTES) return 'notificationPrefs is too large';
  return null;
}
