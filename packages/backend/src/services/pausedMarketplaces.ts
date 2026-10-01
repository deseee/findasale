// Per-marketplace pause (2026-09-30). An organizer can pause ONE marketplace (e.g. FACEBOOK after an
// account suspension) without turning off the extension's global automation for every other channel.
// Stored on Organizer.pausedMarketplaces (String[]). Pure helpers only, so they are unit-testable.

export const PAUSABLE_PLATFORMS = [
  'FACEBOOK', 'CRAIGSLIST', 'GUMTREE_AU', 'POSHMARK', 'MERCARI', 'VINTED', 'GRAILED',
] as const;
export type PausablePlatform = (typeof PAUSABLE_PLATFORMS)[number];

/** Validate/normalize untrusted input: uppercase, drop unknown values and duplicates, keep canonical order. */
export function sanitizePausedPlatforms(input: unknown): PausablePlatform[] {
  if (!Array.isArray(input)) return [];
  const wanted = new Set<string>();
  for (const v of input) {
    if (typeof v === 'string') wanted.add(v.trim().toUpperCase());
  }
  return PAUSABLE_PLATFORMS.filter((p) => wanted.has(p));
}

/** True when `platform` is in the paused list. Unknown/empty inputs are "not paused". */
export function isPlatformPaused(paused: readonly string[] | null | undefined, platform: string | null | undefined): boolean {
  if (!paused || !platform) return false;
  return paused.includes(platform);
}

/** Keep only the platforms that are NOT paused. */
export function filterPausedPlatforms<T extends string>(platforms: readonly T[], paused: readonly string[] | null | undefined): T[] {
  if (!paused || paused.length === 0) return [...platforms];
  return platforms.filter((p) => !paused.includes(p));
}

/**
 * Apply the pause to a getPendingRemovals-shaped list: strip paused platforms from each entry (and from
 * listingRefs when present) and drop entries left with no platform. Returns the kept entries plus how many
 * entries were held back (reported to the client; held-back entries are never counted as skips, since no
 * attempt is made and no REMOVE/SKIPPED row is written).
 */
export function applyPauseToRemovalEntries<T extends { platforms: string[]; listingRefs?: Record<string, string> }>(
  entries: readonly T[],
  paused: readonly string[] | null | undefined,
): { kept: T[]; heldBack: number } {
  if (!paused || paused.length === 0) return { kept: [...entries], heldBack: 0 };
  const kept: T[] = [];
  let heldBack = 0;
  for (const e of entries) {
    const platforms = e.platforms.filter((p) => !paused.includes(p));
    if (platforms.length === 0) { heldBack++; continue; }
    if (platforms.length === e.platforms.length) { kept.push(e); continue; }
    const next: T = { ...e, platforms };
    if (e.listingRefs) {
      const src = e.listingRefs;
      const refs: Record<string, string> = {};
      for (const p of platforms) if (src[p]) refs[p] = src[p];
      (next as { listingRefs?: Record<string, string> }).listingRefs = refs;
    }
    kept.push(next);
  }
  return { kept, heldBack };
}
