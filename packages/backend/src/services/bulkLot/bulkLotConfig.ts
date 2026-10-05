/**
 * Feature flag for bulk lots (ADR-136, roadmap #659).
 *
 * CARD_BULK_LOTS_ENABLED defaults to false. It is read when a function is CALLED, never at import time, so
 * importing this module has no side effects and tests can pass their own env object.
 *
 * Why a flag of its own and not CARD_CATALOG_ENABLED: that flag only gates the Scryfall catalog (lookup and the
 * daily refresh) and is already true in production (2026-10-04). Bulk lots change the register and the sale
 * recording path, so they get their own switch, default off.
 */
export type EnvLike = Record<string, string | undefined>;

export function isBulkLotsEnabled(env: EnvLike = process.env): boolean {
  const raw = (env.CARD_BULK_LOTS_ENABLED ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}
