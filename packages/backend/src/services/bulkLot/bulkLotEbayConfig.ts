/**
 * Feature flag for eBay bundles of bulk lots (ADR-136 Addendum C, roadmap #659).
 *
 * CARD_BULK_EBAY_ENABLED defaults to false. Bulk lots can be listed on eBay as fixed-size bundles only when BOTH
 * CARD_BULK_LOTS_ENABLED (ADR-136) and CARD_BULK_EBAY_ENABLED are on: the second flag is meaningless without the
 * first, so isBulkEbayEnabled checks both. Read when a function is CALLED, never at import time, so tests can pass
 * their own env object and importing this module has no side effects.
 *
 * With the flag off nothing changes from ADR-136 as first shipped: a lot is refused by every eBay path with the
 * "cannot be listed on eBay yet" message, and the sold sync treats a lot like any other item (it can never match a
 * lot that was never listed).
 */
import { isBulkLotsEnabled, type EnvLike } from './bulkLotConfig';

export function isBulkEbayFlagOn(env: EnvLike = process.env): boolean {
  const raw = (env.CARD_BULK_EBAY_ENABLED ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

/** True only when bulk lots AND eBay bundles are both switched on. */
export function isBulkEbayEnabled(env: EnvLike = process.env): boolean {
  return isBulkLotsEnabled(env) && isBulkEbayFlagOn(env);
}
