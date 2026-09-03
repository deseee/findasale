/**
 * vercelGlobalConfig.ts — thin client for Vercel's Global Config (formerly "Edge
 * Config") REST API.
 *
 * ADR: claude_docs/feature-notes/ADR-2026-09-02-automated-410-tombstones-and-cost-snapshots.md
 *
 * Used by pruneScrapedSales.ts to keep a bounded, rolling window of recently-
 * pruned Sale IDs synced to an edge-readable store, so
 * packages/frontend/middleware.ts can return HTTP 410 for those IDs without a
 * per-request backend call (Edge Middleware cannot reach Railway Postgres
 * directly — this is the edge-reachable substitute).
 *
 * Endpoint/body shape confirmed via Vercel's own docs this session (not
 * assumed): `PATCH https://api.vercel.com/v1/global-config/{id}/items`,
 * `Authorization: Bearer <token>`, body `{ items: [{ operation, key, value }] }`,
 * success response `{ status: 'ok' }`. Item keys: alphanumeric + "_"/"-", up to
 * 256 chars — Sale cuids satisfy this with no transformation needed.
 *
 * Fails open, never throws into the caller: a Global Config outage must never
 * break the daily prune job. Callers should treat every export here as
 * fire-and-forget / best-effort and log failures themselves if they care.
 */

const API_BASE = 'https://api.vercel.com/v1/global-config';
// Vercel's batch endpoint has no publicly documented per-request item cap;
// chunk defensively so one oversized request can't fail the whole sync.
const CHUNK_SIZE = 500;

type GlobalConfigOperation = 'upsert' | 'delete';

interface GlobalConfigItemOp {
  operation: GlobalConfigOperation;
  key: string;
  value?: unknown;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function getConfig(): { id: string; token: string } | null {
  const id = process.env.VERCEL_GLOBAL_CONFIG_ID;
  const token = process.env.VERCEL_GLOBAL_CONFIG_WRITE_TOKEN;
  if (!id || !token) return null;
  return { id, token };
}

/**
 * Returns the set of keys currently present in the Global Config, or null if
 * the config isn't set up yet or the read failed (caller should treat null as
 * "skip sync this run", not "config is empty").
 */
export async function readGlobalConfigKeys(): Promise<Set<string> | null> {
  const config = getConfig();
  if (!config) return null;
  try {
    const res = await fetch(`${API_BASE}/${config.id}/items`, {
      headers: { Authorization: `Bearer ${config.token}` },
    });
    if (!res.ok) {
      console.error(`[vercel-global-config] read failed: HTTP ${res.status}`);
      return null;
    }
    const items = (await res.json()) as Array<{ key: string }>;
    return new Set(items.map((i) => i.key));
  } catch (err) {
    console.error('[vercel-global-config] read failed:', err);
    return null;
  }
}

/**
 * Applies a batch of upsert/delete operations, chunked to CHUNK_SIZE items
 * per request. Best-effort — logs and continues past a failed chunk rather
 * than throwing, so a partial sync failure never blocks the caller.
 */
export async function applyGlobalConfigOps(ops: GlobalConfigItemOp[]): Promise<{ succeeded: number; failed: number }> {
  const config = getConfig();
  if (!config || ops.length === 0) return { succeeded: 0, failed: 0 };

  let succeeded = 0;
  let failed = 0;
  for (const batch of chunk(ops, CHUNK_SIZE)) {
    try {
      const res = await fetch(`${API_BASE}/${config.id}/items`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items: batch }),
      });
      if (res.ok) {
        succeeded += batch.length;
      } else {
        failed += batch.length;
        console.error(`[vercel-global-config] PATCH failed: HTTP ${res.status} (batch of ${batch.length})`);
      }
    } catch (err) {
      failed += batch.length;
      console.error('[vercel-global-config] PATCH failed:', err);
    }
  }
  return { succeeded, failed };
}

/**
 * Syncs Global Config so it holds exactly `desiredKeys` (adds missing ones as
 * `value: true`, removes anything present that isn't in the desired set).
 * Used to keep the rolling tombstone window exact without drift. No-op
 * (returns immediately) if VERCEL_GLOBAL_CONFIG_ID/WRITE_TOKEN aren't set —
 * callers should treat that as "feature not provisioned yet", not an error.
 */
export async function syncGlobalConfigExactSet(desiredKeys: string[]): Promise<void> {
  const config = getConfig();
  if (!config) {
    console.log('[vercel-global-config] VERCEL_GLOBAL_CONFIG_ID/WRITE_TOKEN not set — skipping sync.');
    return;
  }

  const currentKeys = await readGlobalConfigKeys();
  if (currentKeys === null) {
    console.error('[vercel-global-config] could not read current state — skipping sync this run to avoid a bad diff.');
    return;
  }

  const desired = new Set(desiredKeys);
  const toAdd: GlobalConfigItemOp[] = desiredKeys
    .filter((k) => !currentKeys.has(k))
    .map((key) => ({ operation: 'upsert', key, value: true }));
  const toRemove: GlobalConfigItemOp[] = Array.from(currentKeys)
    .filter((k) => !desired.has(k))
    .map((key) => ({ operation: 'delete', key }));

  const ops = [...toAdd, ...toRemove];
  if (ops.length === 0) {
    console.log('[vercel-global-config] already in sync — nothing to do.');
    return;
  }

  const { succeeded, failed } = await applyGlobalConfigOps(ops);
  console.log(
    `[vercel-global-config] sync complete: added=${toAdd.length} removed=${toRemove.length} succeeded=${succeeded} failed=${failed}`
  );
}
