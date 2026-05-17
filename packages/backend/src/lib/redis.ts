/**
 * Redis client with graceful in-memory fallback.
 * Real Redis is used when REDIS_URL is set (Railway production).
 * Falls back to in-memory TTL cache when REDIS_URL is absent (local dev).
 * Exports identical interface in both modes — all callers are unchanged.
 */

import { createClient, RedisClientType } from 'redis';

// ---------------------------------------------------------------------------
// In-memory fallback (used when REDIS_URL is not set)
// ---------------------------------------------------------------------------

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

// Purge expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}, 60_000);

const inMemoryFallback = {
  async get(key: string): Promise<string | null> {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      store.delete(key);
      return null;
    }
    return entry.value;
  },

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  },

  async del(key: string): Promise<void> {
    store.delete(key);
  },

  async getDel(key: string): Promise<string | null> {
    const entry = store.get(key);
    store.delete(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) return null;
    return entry.value;
  },
};

// ---------------------------------------------------------------------------
// Real Redis client (used when REDIS_URL is set)
// ---------------------------------------------------------------------------

let realClient: RedisClientType | null = null;
let usingRealRedis = false;

if (process.env.REDIS_URL) {
  try {
    realClient = createClient({ url: process.env.REDIS_URL }) as RedisClientType;

    realClient.on('error', (err: Error) => {
      // Log once; subsequent errors are suppressed to avoid log spam
      if (usingRealRedis) {
        console.error('[Redis] Connection error — falling back to in-memory cache:', err.message);
        usingRealRedis = false;
      }
    });

    realClient.on('ready', () => {
      usingRealRedis = true;
      console.log('[Redis] Connected to real Redis');
    });

    // Connect is async; errors are caught on the error event above
    realClient.connect().catch((err: Error) => {
      console.error('[Redis] Initial connect failed — using in-memory fallback:', err.message);
    });
  } catch (err: any) {
    console.error('[Redis] Client creation failed — using in-memory fallback:', err.message);
    realClient = null;
  }
}

// ---------------------------------------------------------------------------
// Exported redis interface — identical surface to the previous in-memory stub
// ---------------------------------------------------------------------------

export const redis = {
  async get(key: string): Promise<string | null> {
    if (realClient && usingRealRedis) {
      try {
        return await realClient.get(key);
      } catch (err: any) {
        console.error('[Redis] get error, falling back:', err.message);
      }
    }
    return inMemoryFallback.get(key);
  },

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    if (realClient && usingRealRedis) {
      try {
        await realClient.setEx(key, ttlSeconds, value);
        return;
      } catch (err: any) {
        console.error('[Redis] setex error, falling back:', err.message);
      }
    }
    return inMemoryFallback.setex(key, ttlSeconds, value);
  },

  async del(key: string): Promise<void> {
    if (realClient && usingRealRedis) {
      try {
        await realClient.del(key);
        return;
      } catch (err: any) {
        console.error('[Redis] del error, falling back:', err.message);
      }
    }
    return inMemoryFallback.del(key);
  },

  async getDel(key: string): Promise<string | null> {
    if (realClient && usingRealRedis) {
      try {
        const value = await realClient.getDel(key);
        return value ?? null;
      } catch (err: any) {
        console.error('[Redis] getDel error, falling back:', err.message);
      }
    }
    return inMemoryFallback.getDel(key);
  },
};
