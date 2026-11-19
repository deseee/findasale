/**
 * Deploy-order guard for PrunedSaleTombstone.citySlug (2026-11-19).
 *
 * Railway runs no migrations on deploy, so this code can go live before
 * migration z20261119120000_pruned_sale_tombstone_city_slug adds the column. Every query that reads or
 * writes citySlug goes through withCitySlugFallback: when the column is missing (Prisma P2022, or the raw
 * Postgres 42703 "column ... does not exist") it runs the slug-free version instead, and remembers that for
 * CITY_SLUG_RECHECK_MS so it does not fail once per request. After that it tries the column again, so the
 * migration is picked up without a restart.
 */
export const CITY_SLUG_RECHECK_MS = 5 * 60 * 1000;

let missingUntil = 0;

export function isMissingCitySlugColumnError(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown; meta?: { column?: unknown } } | null;
  if (!e) return false;
  // P2022 meta.column is "PrunedSaleTombstone.citySlug" or "citySlug" (seen live against Postgres 16, Prisma 5.22).
  if (e.code === 'P2022') return e.meta?.column == null || /citySlug/.test(String(e.meta.column));
  const text = String(e.message ?? '');
  return (e.code === '42703' || /does not exist/i.test(text)) && /citySlug/.test(text);
}

export async function withCitySlugFallback<T>(
  withSlug: () => Promise<T>,
  withoutSlug: () => Promise<T>
): Promise<T> {
  if (Date.now() < missingUntil) return withoutSlug();
  try {
    return await withSlug();
  } catch (err) {
    if (!isMissingCitySlugColumnError(err)) throw err;
    missingUntil = Date.now() + CITY_SLUG_RECHECK_MS;
    console.warn('[tombstone] PrunedSaleTombstone.citySlug is missing (migration not applied yet); using the slug-free query');
    return withoutSlug();
  }
}

/** Tests only. */
export function resetCitySlugColumnCache(): void {
  missingUntil = 0;
}
