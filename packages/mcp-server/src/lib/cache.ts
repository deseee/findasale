/**
 * Small in-memory TTL cache for backend GET responses.
 *
 * Public discovery data changes slowly and the same questions repeat
 * (e.g. "sales in Chicago this weekend"), so short-lived caching keeps load off
 * api.finda.sale. Only successful responses are cached. Entries are evicted
 * oldest-first once MAX_ENTRIES is reached.
 */

const MAX_ENTRIES = 300;

interface Entry {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, Entry>();

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheSize(): number {
  return store.size;
}

/** Stable key for a GET path + params. */
export function cacheKey(path: string, params?: Record<string, unknown>): string {
  if (!params) return path;
  const sorted = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join('&');
  return `${path}?${sorted}`;
}
