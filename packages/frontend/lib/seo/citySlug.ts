/**
 * Canonical city-slug generation — FRONTEND COPY.
 *
 * This is a deliberate local copy of packages/backend/src/utils/citySlug.ts.
 * packages/frontend must never import from `@findasale/shared` (breaks the
 * Vercel build — CLAUDE.md §8), and it cannot import from the backend package
 * either, so the logic is duplicated here rather than shared. If you change
 * one, change the other; the two must stay byte-for-byte equivalent in
 * behavior or the duplicate-URL bug this fixes will come straight back.
 *
 * See the backend file for the full root-cause writeup (2026-07-28).
 *
 * Edge-runtime safe: used by middleware.ts. No Node-only APIs.
 */

/** The contract every emitted city slug must satisfy (mirrors the backend validator). */
export const CITY_SLUG_PATTERN = /^[a-z0-9-]+-[a-z]{2}$/;

/**
 * Cheap pre-filter: true when a slug is already made only of slug-safe
 * characters, so callers on a hot path (middleware runs on every /city/,
 * /sales/, /this-weekend/, /companies/ and /organizers/ request) can skip the
 * full normalization for the overwhelming majority of URLs that need nothing.
 */
export function isCitySlugSafe(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug);
}

function normalizeSlugPart(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')          // strip combining marks (accents)
    .replace(/['\u2018\u2019\u02bc\u0060.]/g, '') // DELETE dots + apostrophes (no hyphen)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Build the canonical slug for a city + state pair. Null when impossible. */
export function canonicalCitySlug(
  city: string | null | undefined,
  state: string | null | undefined
): string | null {
  if (!city || !state) return null;

  const citySlug = normalizeSlugPart(city);
  const stateSlug = normalizeSlugPart(state);

  if (!citySlug) return null;
  if (!/^[a-z]{2}$/.test(stateSlug)) return null;

  const slug = `${citySlug}-${stateSlug}`;
  return CITY_SLUG_PATTERN.test(slug) ? slug : null;
}

/**
 * Normalize an already-formed slug string from a URL to its canonical form.
 * Idempotent, so input !== output is a safe redirect trigger with no loop risk.
 * Returns null if no valid slug can be produced.
 */
export function normalizeCitySlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const normalized = normalizeSlugPart(slug);
  return CITY_SLUG_PATTERN.test(normalized) ? normalized : null;
}
