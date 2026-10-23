// Auto queue settings (2026-10-21). An organizer can opt each content-script marketplace into the
// extension's auto queue: when an eligible item is published, GET /extension/autolist-queue returns it
// and the extension adds it to that marketplace's posting queue. These map the six public platform
// names to the Organizer boolean columns. There is no Vinted column, so Vinted has no auto queue.
// Pure helpers only, so they are unit-testable.

export const AUTO_QUEUE_PLATFORMS = [
  'CRAIGSLIST', 'FACEBOOK', 'GUMTREE_AU', 'GRAILED', 'POSHMARK', 'MERCARI',
] as const;
export type AutoQueuePlatform = (typeof AUTO_QUEUE_PLATFORMS)[number];

export const AUTO_QUEUE_FLAG_BY_PLATFORM: Record<AutoQueuePlatform, string> = {
  CRAIGSLIST: 'craigslistAutoListEnabled',
  FACEBOOK: 'facebookAutoListEnabled',
  GUMTREE_AU: 'gumtreeAuAutoListEnabled',
  GRAILED: 'grailedAutoListEnabled',
  POSHMARK: 'poshmarkAutoListEnabled',
  MERCARI: 'mercariAutoListEnabled',
};

/** Prisma select object for every auto queue flag. */
export const AUTO_QUEUE_FLAG_SELECT: Record<string, true> = Object.fromEntries(
  Object.values(AUTO_QUEUE_FLAG_BY_PLATFORM).map((f) => [f, true as const]),
);

/** Organizer row (any subset of the flag columns) -> { PLATFORM: boolean } for all six platforms. Missing = false. */
export function toAutoQueueSettings(organizer: Record<string, unknown> | null | undefined): Record<AutoQueuePlatform, boolean> {
  const out = {} as Record<AutoQueuePlatform, boolean>;
  for (const p of AUTO_QUEUE_PLATFORMS) out[p] = !!organizer && organizer[AUTO_QUEUE_FLAG_BY_PLATFORM[p]] === true;
  return out;
}

export type AutoQueueParse =
  | { ok: true; data: Record<string, boolean> }
  | { ok: false; message: string };

/**
 * Validate a PATCH body of the form { settings: { MERCARI: true, ... } }. Only provided keys are returned
 * (as Organizer column -> boolean). Unknown platforms and non-boolean values are rejected, never coerced.
 */
export function parseAutoQueuePatch(body: unknown): AutoQueueParse {
  const settings = (body as { settings?: unknown } | null | undefined)?.settings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return { ok: false, message: 'settings must be an object of platform name to true or false' };
  }
  const data: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(settings as Record<string, unknown>)) {
    const platform = key.trim().toUpperCase() as AutoQueuePlatform;
    if (!(AUTO_QUEUE_PLATFORMS as readonly string[]).includes(platform)) {
      return { ok: false, message: 'Unknown marketplace: ' + key };
    }
    if (typeof value !== 'boolean') return { ok: false, message: key + ' must be true or false' };
    data[AUTO_QUEUE_FLAG_BY_PLATFORM[platform]] = value;
  }
  if (Object.keys(data).length === 0) return { ok: false, message: 'No settings provided' };
  return { ok: true, data };
}

// Marketplaces with no local pickup option. Mirrors popup.js PICKUP_INCOMPATIBLE_PLATFORMS (VINTED is not an
// auto queue platform, so only MERCARI and POSHMARK matter here). The popup hides these items client-side;
// the auto queue has no popup in the loop, so the server must hold them back itself.
export const PICKUP_INCOMPATIBLE_AUTO_QUEUE_PLATFORMS: readonly string[] = ['MERCARI', 'POSHMARK'];

export function isPickupOnlyBlockedForAutoQueue(platform: string, localPickupOnly: boolean): boolean {
  return localPickupOnly === true && PICKUP_INCOMPATIBLE_AUTO_QUEUE_PLATFORMS.includes(platform);
}

// ---- Auto queue test limits (2026-10-23) ------------------------------------------------------------------------
// Optional, per organizer, default off (no OrganizerAutoQueueLimit row, or both fields empty). Lets the organizer run a
// supervised few-item live test of the auto queue:
//   maxNewPerRun -- at most this many new listings (item x marketplace) in one GET /extension/autolist-queue response;
//   onlyItemIds  -- only these of the organizer's own items are ever auto queued (ownership is still enforced by the
//                   queue query itself, so a foreign id here can never surface anything).
// The extension applies the same limits again to what it merges (defense in depth, background.js checkAutoListQueue).

export const AUTO_QUEUE_MAX_PER_RUN_CEILING = 500;
export const AUTO_QUEUE_ONLY_ITEM_IDS_MAX = 50;
const ITEM_ID_RE = /^[A-Za-z0-9_-]{8,40}$/;

export type AutoQueueLimits = { maxNewPerRun: number | null; onlyItemIds: string[] };
export const NO_AUTO_QUEUE_LIMITS: AutoQueueLimits = { maxNewPerRun: null, onlyItemIds: [] };

/** DB row (or null) -> normalized limits. Anything malformed is treated as "no limit" for that field. */
export function toAutoQueueLimits(row: { maxNewPerRun?: unknown; onlyItemIds?: unknown } | null | undefined): AutoQueueLimits {
  if (!row) return { ...NO_AUTO_QUEUE_LIMITS, onlyItemIds: [] };
  const n = row.maxNewPerRun;
  const maxNewPerRun = typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= AUTO_QUEUE_MAX_PER_RUN_CEILING ? n : null;
  const onlyItemIds = Array.isArray(row.onlyItemIds)
    ? Array.from(new Set(row.onlyItemIds.filter((v): v is string => typeof v === 'string' && ITEM_ID_RE.test(v)))).slice(0, AUTO_QUEUE_ONLY_ITEM_IDS_MAX)
    : [];
  return { maxNewPerRun, onlyItemIds };
}

export type AutoQueueLimitsParse =
  | { ok: true; data: Partial<AutoQueueLimits> }
  | { ok: false; message: string };

/**
 * Validate the `limits` part of a PATCH body: { limits: { maxNewPerRun?: number | null, onlyItemIds?: string[] } }.
 * Only those two keys are accepted (anything else is rejected, never ignored), so no other column can be written.
 * maxNewPerRun: whole number 1..500, or null to turn the cap off. onlyItemIds: up to 50 item ids, [] to turn it off.
 */
export function parseAutoQueueLimitsPatch(limits: unknown): AutoQueueLimitsParse {
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) return { ok: false, message: 'limits must be an object' };
  const data: Partial<AutoQueueLimits> = {};
  for (const [key, value] of Object.entries(limits as Record<string, unknown>)) {
    if (key === 'maxNewPerRun') {
      if (value === null) { data.maxNewPerRun = null; continue; }
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > AUTO_QUEUE_MAX_PER_RUN_CEILING) {
        return { ok: false, message: 'maxNewPerRun must be a whole number from 1 to ' + AUTO_QUEUE_MAX_PER_RUN_CEILING + ', or null for no limit' };
      }
      data.maxNewPerRun = value;
    } else if (key === 'onlyItemIds') {
      if (!Array.isArray(value)) return { ok: false, message: 'onlyItemIds must be a list of item ids' };
      const ids: string[] = [];
      for (const v of value) {
        const id = typeof v === 'string' ? v.trim() : '';
        if (!ITEM_ID_RE.test(id)) return { ok: false, message: 'Not a valid item id: ' + String(v).slice(0, 60) };
        if (!ids.includes(id)) ids.push(id);
      }
      if (ids.length > AUTO_QUEUE_ONLY_ITEM_IDS_MAX) return { ok: false, message: 'At most ' + AUTO_QUEUE_ONLY_ITEM_IDS_MAX + ' item ids' };
      data.onlyItemIds = ids;
    } else {
      return { ok: false, message: 'Unknown limit: ' + key };
    }
  }
  if (Object.keys(data).length === 0) return { ok: false, message: 'No limits provided' };
  return { ok: true, data };
}

/** True when either limit is on. */
export function hasAutoQueueLimits(l: AutoQueueLimits | null | undefined): boolean {
  return !!l && (l.maxNewPerRun != null || l.onlyItemIds.length > 0);
}

/**
 * Apply the limits to per-platform queues. onlyItemIds filters every queue; maxNewPerRun caps the TOTAL number of
 * entries (one entry = one new listing on one marketplace) across all platforms, filled in `platformOrder`.
 * Returns new arrays; the input is not mutated.
 */
export function applyAutoQueueLimits<T extends { id: string }>(
  queues: Record<string, T[]>,
  limits: AutoQueueLimits | null | undefined,
  platformOrder: readonly string[] = Object.keys(queues),
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const k of Object.keys(queues)) out[k] = [...(queues[k] || [])];
  if (!hasAutoQueueLimits(limits)) return out;
  const allow = limits!.onlyItemIds.length ? new Set(limits!.onlyItemIds) : null;
  if (allow) for (const k of Object.keys(out)) out[k] = out[k].filter((e) => allow.has(e.id));
  if (limits!.maxNewPerRun != null) {
    let left = limits!.maxNewPerRun;
    const order = [...platformOrder, ...Object.keys(out).filter((k) => !platformOrder.includes(k))];
    for (const k of order) {
      if (!out[k]) continue;
      out[k] = out[k].slice(0, Math.max(0, left));
      left -= out[k].length;
    }
  }
  return out;
}

/** True for Prisma's "table does not exist" error (P2021), i.e. the OrganizerAutoQueueLimit migration is not applied yet. */
export function isMissingTableError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return !!e && (e.code === 'P2021' || /does not exist/i.test(String(e.message || '')) && /OrganizerAutoQueueLimit/.test(String(e.message || '')));
}
