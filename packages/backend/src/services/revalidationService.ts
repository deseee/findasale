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

/**
 * ADR (2026-07-23): Debounced ISR revalidation for per-field organizer
 * autosave. Vercel's ISR Writes billing metric was running 2-4x over the
 * sustainable free-tier budget; the dominant remaining cause was updateSale
 * firing an immediate, unconditional ISR write on every successful save —
 * so an autosave-per-blur UI pattern could trigger N writes for N rapid
 * consecutive edits to the same sale within a few seconds, when 1 write
 * would suffice. This coalesces rapid consecutive saves to the SAME saleId
 * into a single eventual triggerSaleAndCityRevalidation call, debounced by
 * DEBOUNCE_MS: each call for a saleId resets the timer (true debounce, not
 * throttle), so continuous edits keep deferring until the sale goes quiet.
 *
 * In-memory only — safe because the backend runs as a single persistent
 * Node.js process on Railway (not serverless), so this Map survives across
 * requests within that process for the life of the debounce window.
 *
 * Fire-and-forget / never throws, matching the rest of this file's style.
 */

const DEBOUNCE_MS = 8000;

type PendingRevalidation = {
  timer: ReturnType<typeof setTimeout>;
  citySlugs: Set<string>;
};

const pendingRevalidations = new Map<string, PendingRevalidation>();

export function debouncedTriggerSaleAndCityRevalidation(saleId: string, citySlug: string | null): void {
  const existing = pendingRevalidations.get(saleId);

  if (existing) {
    if (citySlug) existing.citySlugs.add(citySlug);
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => flushPendingRevalidation(saleId), DEBOUNCE_MS);
    return;
  }

  const citySlugs = new Set<string>();
  if (citySlug) citySlugs.add(citySlug);

  const timer = setTimeout(() => flushPendingRevalidation(saleId), DEBOUNCE_MS);
  pendingRevalidations.set(saleId, { timer, citySlugs });
}

function flushPendingRevalidation(saleId: string): void {
  const pending = pendingRevalidations.get(saleId);
  if (!pending) return;
  pendingRevalidations.delete(saleId);
  triggerSaleAndCityRevalidation([saleId], Array.from(pending.citySlugs)).catch(() => {});
}
