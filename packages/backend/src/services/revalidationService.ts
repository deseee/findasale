/**
 * ADR (2026-07-11): On-demand ISR revalidation trigger.
 *
 * Shared helper that POSTs a batch of paths to the frontend's
 * /api/revalidate endpoint whenever a real backend event changes data shown
 * on /sales/[id] or /city/[slug] — scraper ingestion, prune batches, and
 * organizer sale publish/update/cancel/delete (see ADR 2 in
 * claude_docs/feature-notes/stripe-migration-reconciliation-and-isr-revalidation-adr-2026-07-11.md).
 *
 * Fire-and-forget by design: revalidation failing must never break the
 * caller's main flow (a scrape run, a prune run, or an organizer's sale
 * save). Failures are logged, never thrown.
 */

const REVALIDATE_TIMEOUT_MS = 10000;

/**
 * Build a city page slug from a Sale's city + state, matching the canonical
 * formula used by /api/sales/city-slugs (packages/backend/src/routes/sales.ts):
 *   LOWER(REPLACE(city, ' ', '-')) || '-' || LOWER(state)
 */
export function citySlugFromCityState(city: string | null | undefined, state: string | null | undefined): string | null {
  if (!city || !state) return null;
  const citySlug = city.trim().toLowerCase().replace(/\s+/g, '-');
  const stateSlug = state.trim().toLowerCase();
  if (!citySlug || !stateSlug) return null;
  return `${citySlug}-${stateSlug}`;
}

/**
 * Fire an on-demand revalidation request for a batch of paths. Never throws —
 * logs and returns on any failure so callers can call this without wrapping
 * every call site in its own try/catch.
 */
export async function triggerRevalidation(paths: string[]): Promise<void> {
  const uniquePaths = Array.from(new Set(paths.filter((p) => typeof p === 'string' && p.startsWith('/'))));
  if (uniquePaths.length === 0) return;

  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    console.warn('[revalidationService] REVALIDATE_SECRET not set — skipping on-demand revalidation for', uniquePaths);
    return;
  }

  // Matches the FRONTEND_URL fallback pattern already used in stripeConnectController.ts.
  const frontendBaseUrl = process.env.FRONTEND_URL || 'https://finda.sale';
  const url = `${frontendBaseUrl}/api/revalidate?secret=${encodeURIComponent(secret)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REVALIDATE_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: uniquePaths }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`[revalidationService] Revalidation request failed (${response.status}) for`, uniquePaths, body);
      return;
    }

    console.log(`[revalidationService] Revalidated ${uniquePaths.length} path(s):`, uniquePaths);
  } catch (err) {
    console.error('[revalidationService] Revalidation request errored for', uniquePaths, err instanceof Error ? err.message : err);
  }
}

/**
 * Convenience wrapper: revalidate a set of sale detail pages plus the set of
 * city pages they belong to, deduped. Callers pass whatever they have —
 * either or both arrays may be empty.
 */
export async function triggerSaleAndCityRevalidation(
  saleIds: string[],
  citySlugs: string[]
): Promise<void> {
  const paths = [
    ...saleIds.filter(Boolean).map((id) => `/sales/${id}`),
    ...Array.from(new Set(citySlugs.filter(Boolean))).map((slug) => `/city/${slug}`),
  ];
  await triggerRevalidation(paths);
}
