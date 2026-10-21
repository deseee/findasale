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
