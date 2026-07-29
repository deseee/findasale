/**
 * Canonical city-slug generation — single source of truth (backend).
 *
 * WHY THIS EXISTS (2026-07-28):
 * Three generators had independently drifted and were emitting DIFFERENT slugs
 * for the same city, producing duplicate indexed URLs that could never render:
 *
 *   1. routes/sales.ts  /city-slugs   SQL `LOWER(REPLACE(city,' ','-'))` + a JS
 *                                     `.replace(/\./g,'')` dot-strip  -> "st-louis-mo"
 *   2. controllers/indexController.ts makeSlug(), NO dot-strip        -> "st.-louis-mo"
 *   3. services/revalidationService.ts citySlugFromCityState(), same  -> "st.-louis-mo"
 *
 * The backend slug validator (`CITY_SLUG_PATTERN`, enforced by
 * /sales/by-city/:citySlug and /companies/by-city/:citySlug) rejects `.` and
 * `'`, so variants 2 and 3 returned HTTP 400. getStaticProps swallows the
 * non-ok response and renders an empty page, so Google indexed real URLs that
 * were structurally incapable of showing content ("st.-louis-mo" was taking
 * live impressions).
 *
 * EVERY city slug in the backend MUST come from this module. Do not hand-roll
 * another `toLowerCase().replace(...)` chain.
 *
 * NOTE ON PLACEMENT: this lives in the backend package, not `packages/shared`.
 * `@findasale/shared` does not resolve in the Railway Docker build (S574 —
 * see the comments in controllers/watermarkController.ts and
 * utils/watermarkPolicy.ts, both of which deliberately inline shared logic for
 * this reason), and packages/frontend must never import it at all (breaks the
 * Vercel build, CLAUDE.md §8). The frontend keeps a byte-for-byte copy of the
 * normalization logic at packages/frontend/lib/seo/citySlug.ts — keep the two
 * in sync if this ever changes.
 */

/**
 * The contract every emitted city slug must satisfy. This is the exact regex
 * already enforced by /sales/by-city/:citySlug and /companies/by-city/:citySlug.
 */
export const CITY_SLUG_PATTERN = /^[a-z0-9-]+-[a-z]{2}$/;

/**
 * Normalize one free-text fragment (a city name, a state, or a whole slug)
 * into slug-safe characters.
 *
 * Rules, in order:
 *  - lowercase
 *  - Unicode NFD + strip combining marks, so accented Latin transliterates
 *    rather than being destroyed ("Albarracin", "Carinena", "Dona Godina" —
 *    all three are real values in the production Sale.city column).
 *  - DELETE dots and the apostrophe family outright (no hyphen). This is the
 *    behavior the sitemap/getStaticPaths canonical form already had for dots,
 *    and it is what keeps "St. Louis" -> "st-louis" (not "st--louis") and
 *    "Coeur d'Alene" -> "coeur-dalene" (not "coeur-d-alene"). Deleting rather
 *    than hyphenating also means the state "D.C." collapses to "dc" and still
 *    satisfies the two-letter state requirement.
 *  - every OTHER non-alphanumeric run (spaces, commas, slashes, parens,
 *    newlines, CJK, "~", "#", existing hyphens) collapses to a single hyphen
 *  - trim leading/trailing hyphens
 */
function normalizeSlugPart(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')          // strip combining marks (accents)
    .replace(/['\u2018\u2019\u02bc\u0060.]/g, '') // DELETE dots + apostrophes (no hyphen)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Build the canonical slug for a city + state pair.
 *
 * Returns null when a valid slug cannot be produced — e.g. a non-Latin city
 * name that normalizes away entirely (the production Sale table contains
 * "里士满"/BC and "미시사가"/ON), or a state that is not two letters after
 * normalization. Callers MUST handle null rather than emitting a broken URL.
 */
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
 * Normalize an already-formed slug string (as it arrives in a URL) to its
 * canonical form. Used to 301 legacy indexed URLs such as "st.-louis-mo" or
 * "coeur-d'alene-id" onto the form the API can actually serve.
 *
 * Guaranteed idempotent: normalizeCitySlug(canonicalCitySlug(c, s)) === the
 * same value, so a caller can safely compare input vs output to decide whether
 * a redirect is needed without ever creating a loop.
 *
 * Returns null if the input cannot be normalized into a valid slug.
 */
export function normalizeCitySlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const normalized = normalizeSlugPart(slug);
  return CITY_SLUG_PATTERN.test(normalized) ? normalized : null;
}
