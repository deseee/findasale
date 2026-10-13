/**
 * marketplaceStockSyncService.ts — ADR-087 Phase 4 "Revise-on-Partial"
 *
 * 2026-10-13 (single inventory number): this file is now a THIN DELEGATE. The quantity logic (every market, hold gates, rate
 * limiter, lot guards, stale-overwrite guard, zero-stock end, restock relist) lives in services/inventoryStockSync.ts
 * (syncItemStock). The caller-supplied remainingStock is ignored except for logging: the number is always re-read from the
 * database, and the old floor-at-1 behavior is gone (a 0 ends the listing instead). The text below is the historical design
 * record for the conditions that syncItemStock now carries.
 *
 * Fire-and-forget helper that revises a LIVE eBay listing's remaining quantity
 * immediately after a PARTIAL sale on any FindA.Sale channel (POS, terminal,
 * Stripe checkout, reservations, vendor-booth, auction). This is the
 * complement to the existing P3 `endEbayListingIfExists` withdraw-on-sellout
 * hook: that one fires when an item becomes FULLY sold out; this one fires
 * when it does NOT (stock remains, but the count buyers see on eBay needs to
 * shrink so eBay doesn't oversell the remaining units).
 *
 * Design authority (read in full before modifying this file):
 *  - claude_docs/feature-notes/hacker-review-adr087-p4-revise-on-partial-2026-07-19.md
 *    (APPROVE-WITH-CONDITIONS — 7 conditions, all satisfied below, mapped inline)
 *  - claude_docs/feature-notes/architect-design-adr087-p4-revise-on-partial-2026-07-19.md
 *    (D4 architecture — per-caller integration, NOT a choke point inside
 *    itemStockService.sellItemUnits())
 *
 * Condition-to-code map (hacker review verdict, 2026-07-19):
 *  1. Absolute-quantity PUT, FindA.Sale-sourced only — `remainingStock` is taken
 *     directly from the caller's `sellItemUnits()` result; this function NEVER
 *     issues an eBay GET to derive the quantity value itself. The GET below
 *     exists only to preserve the OTHER inventory_item fields (product,
 *     condition, packaging) on eBay's full-replace PUT — see the section-3
 *     note further down.
 *  2. Log-don't-swallow on stale-overwrite risk — see STALE_SYNC_THRESHOLD_MS
 *     check below, compared against EbayConnection.lastEbaySoldSyncAt (NOT
 *     Item.updatedAt — see note at that check for why).
 *  3. Fire-and-forget, never blocks checkout — this function is always called
 *     as `syncMarketplaceStock(...).catch(...)` without `await` blocking the
 *     buyer's response, identical to `endEbayListingIfExists`. It also never
 *     throws internally (top-level try/catch, matching that function's shape).
 *  4. Tenant isolation via itemId-only re-derivation — the only parameter is
 *     `itemId`; sale -> organizer -> ebayConnection is re-derived server-side
 *     exactly as `endEbayListingIfExists` (ebayController.ts) does today.
 *  5. Explicit isEbayRateLimited() gate — checked before ANY eBay fetch call
 *     (the existing endEbayListingIfExists withdraw hook does NOT do this;
 *     per the hacker review, that gap is not copied forward here).
 *  6. Floor quantity at 1, never 0 — `Math.max(remainingStock, 1)`, identical
 *     to the publish-time payload floor at ebayController.ts:2400.
 *  7. Throwaway-item QA only — process condition, enforced at QA dispatch time,
 *     not in this file. NOT verified via a live eBay call in this dev pass —
 *     flagged as the required next step before shipping (see final report).
 *
 * Open-question resolution (architect flagged, not assumed): eBay's
 * inventory_item PUT is a full-replace (confirmed via the existing publish-time
 * call at ebayController.ts:2289-2462, which always sends the complete body).
 * Rather than reconstructing that entire payload from scratch on every partial
 * sale (expensive — requires the Taxonomy API aspect-fill pass, photo URLs,
 * etc.), this function reuses the GET-merge-PUT pattern this codebase ALREADY
 * uses for the sibling `offer` endpoint (`applyFulfillmentPolicyToOffer`,
 * ebayController.ts:3867): GET the current inventory_item, merge in only the
 * new `availability.shipToLocationAvailability.quantity`, PUT the merged
 * object back. This never derives the QUANTITY VALUE from eBay's GET (that
 * would violate condition 1) — it only preserves fields FindA.Sale isn't
 * trying to change. A live throwaway-item test (condition 7) is still required
 * to confirm eBay's inventory_item GET response round-trips cleanly through
 * PUT with no other read-only-field surprises; this could not be verified in
 * this dev pass (no live eBay call performed — out of scope per dispatch).
 */

export interface MarketplaceSaleOutcome {
  fullySoldOut: boolean;
  remainingStock: number;
}

/** Reason string passed to syncItemStock (also the reason bulk-lot reconciliation is logged with). */
const PARTIAL_SALE_REASON = 'partial sale on another channel';

/**
 * Bring every market in line with the item's one in-stock number after a PARTIAL sale on any FindA.Sale channel.
 *
 * Callers keep the same shape as before: call in the branch where `fullySoldOut === false`, fire-and-forget. A fully sold out
 * item takes the withdraw path (soldFanOutService), so this no-ops defensively when `fullySoldOut` is true.
 *
 * Do NOT call this from ebaySoldSyncCron.ts's own sellItemUnits() call (that absorbs an eBay sale INTO the pool).
 *
 * Never throws. Never awaited by a caller's response path.
 */
export async function syncMarketplaceStock(
  itemId: string,
  saleOutcome: MarketplaceSaleOutcome
): Promise<void> {
  try {
    if (saleOutcome.fullySoldOut) {
      return;
    }
    // Lazy import: inventoryStockSync pulls in the eBay controller, which must not be loaded at this module's import time.
    const { syncItemStock } = await import('./inventoryStockSync');
    const result = await syncItemStock(itemId, PARTIAL_SALE_REASON);
    if (result.inStock >= 0 && result.inStock !== saleOutcome.remainingStock) {
      console.log(
        `[Stock Sync] item ${itemId}: caller reported ${saleOutcome.remainingStock} remaining, database says ${result.inStock} (database number used)`
      );
    }
  } catch (err) {
    console.error(`[Stock Sync] unexpected error for item ${itemId}:`, err);
  }
}
