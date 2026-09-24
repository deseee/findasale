/**
 * Known-location gate for city-slug SEO routes (/city/:slug, /city/:slug/:category,
 * /this-weekend/:city and their internal-ssr siblings).
 *
 * Why this exists (2026-09-24): CITY_SLUG_PATTERN only checks shape, so a made-up
 * slug like "nowhere-zz" passed and rendered a 200 empty page (soft-404). A slug
 * is only a real location if its trailing 2-letter code is a real US state /
 * DC / territory or a Canadian province / territory -- the same region set the
 * backend geocoder recognizes (packages/backend/src/services/geocodingService.ts
 * US_STATE_NAMES + CA_PROVINCE_NAMES; AS and MP added as the remaining US
 * territories). Every city slug the backend emits comes from Sale.city/state
 * via canonicalCitySlug(), so real pages always end in one of these codes.
 *
 * Deliberately a static, deterministic check with NO backend dependency:
 *  - a real city with zero sales right now still passes (stays 200);
 *  - a backend timeout / 429 / 5xx can never turn a real page into a 404;
 *  - the 404 is safe to cache long (revalidate / s-maxage 86400), since the
 *    answer only changes with a code change.
 * It does NOT catch a fake city name inside a real state ("zzqqxx-mi"): the
 * backend currently cannot distinguish "geocoder found nothing" from
 * "geocoder failed", so doing that here would risk 404ing real pages.
 */
const KNOWN_REGION_CODES = new Set<string>([
  // US states + DC
  'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'dc', 'fl', 'ga', 'hi', 'id',
  'il', 'in', 'ia', 'ks', 'ky', 'la', 'me', 'md', 'ma', 'mi', 'mn', 'ms', 'mo',
  'mt', 'ne', 'nv', 'nh', 'nj', 'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa',
  'ri', 'sc', 'sd', 'tn', 'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy',
  // US territories
  'pr', 'vi', 'gu', 'as', 'mp',
  // Canadian provinces + territories (bc-/on- slugs are live today)
  'ab', 'bc', 'mb', 'nb', 'nl', 'ns', 'nt', 'nu', 'on', 'pe', 'qc', 'sk', 'yt',
]);

/** True when the slug's trailing region code (e.g. "mi" in "grand-rapids-mi") is a real state/province. */
export function hasKnownCityRegion(slug: string | null | undefined): boolean {
  if (!slug) return false;
  const idx = slug.lastIndexOf('-');
  if (idx <= 0) return false;
  return KNOWN_REGION_CODES.has(slug.slice(idx + 1).toLowerCase());
}
