/**
 * marketplaceStockSyncService.ts — ADR-087 Phase 4 "Revise-on-Partial"
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

import { prisma } from '../lib/prisma';
import { ebayProxyUrl, ebayProxyHeaders, ebayUserHeaders, refreshEbayAccessToken } from './ebayHttp';
import { isEbayRateLimited, trackEbayCall } from '../lib/ebayRateLimiter';
import { buildCustomLabel } from '../controllers/ebayController';

/** How stale EbayConnection.lastEbaySoldSyncAt can be before we log a
 * potential-stale-overwrite warning (condition 2). 15 minutes matches
 * ebaySoldSyncCron's poll cadence (the mechanism that would otherwise have
 * absorbed a very recent eBay-side sale into stockSold before we compute
 * remainingStock). Log-only — never blocks the PUT (hacker review: "this must
 * be logged, not swallowed", not "this must be blocked").
 */
const STALE_SYNC_THRESHOLD_MS = 15 * 60 * 1000;

export interface MarketplaceSaleOutcome {
  fullySoldOut: boolean;
  remainingStock: number;
}

/**
 * Revise a live eBay listing's remaining quantity after a PARTIAL sale.
 *
 * Callers: every `sellItemUnits()` call site on a checkout-completion path
 * (POS, terminal, Stripe x6, reservations, vendor-booth, auction) should call
 * this in the branch where `fullySoldOut === false`, fire-and-forget, exactly
 * like the existing `endEbayListingIfExists(...).catch(...)` call in the
 * `fullySoldOut === true` branch. Do NOT call this for a fully-sold-out sale —
 * that item takes the withdraw path instead (this function also no-ops
 * defensively if `fullySoldOut` is somehow true, as a second guard).
 *
 * Do NOT call this from ebaySoldSyncCron.ts's own sellItemUnits() call — that
 * absorbs an eBay-side sale INTO FindA.Sale's pool (the opposite direction).
 * Firing a revise PUT immediately after would either no-op (eBay's quantity
 * already reflects the sale it just told us about) or race the same 15-minute
 * reconciliation window this function's own staleness check exists to flag.
 *
 * Never throws. Never awaited by a caller's response path.
 */
export async function syncMarketplaceStock(
  itemId: string,
  saleOutcome: MarketplaceSaleOutcome
): Promise<void> {
  try {
    // Defensive second guard (condition 3 / D4): this function is only for the
    // partial-sale branch. A fully-sold-out item is handled by the existing
    // endEbayListingIfExists withdraw hook — never both.
    if (saleOutcome.fullySoldOut) {
      return;
    }

    // Condition 5: check the rate limiter BEFORE any eBay fetch call. Log and
    // skip — never queue, never retry inline, never block the caller.
    if (isEbayRateLimited()) {
      console.warn(`[eBay ReviseQty] Rate-limited — skipping quantity revise for item ${itemId}`);
      return;
    }

    // Condition 4: itemId-only re-derivation, mirroring endEbayListingIfExists's
    // exact lookup chain (item -> sale -> organizer -> ebayConnection). Never
    // accept organizerId/ebayOfferId/quantity from any caller.
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        ebayOfferId: true,
        saleId: true,
        createdAt: true,
        costBasis: true,
        roomTag: true,
      },
    });

    if (!item) {
      console.warn(`[eBay ReviseQty] Item ${itemId} not found`);
      return;
    }

    // Not eBay-published — nothing to revise. This is the common case (most
    // partial sales are not eBay-linked items), so this early-return is the
    // hot path for every non-eBay checkout.
    if (!item.ebayOfferId) {
      return;
    }

    if (!item.saleId) {
      console.warn(`[eBay ReviseQty] Item ${itemId} has no saleId — skipping`);
      return;
    }

    const sale = await prisma.sale.findUnique({
      where: { id: item.saleId },
      select: { organizerId: true },
    });

    if (!sale) {
      console.warn(`[eBay ReviseQty] Sale ${item.saleId} not found for item ${itemId}`);
      return;
    }

    const organizer = await prisma.organizer.findUnique({
      where: { id: sale.organizerId },
      select: {
        id: true,
        skuAppendDate: true,
        skuAppendCost: true,
        skuAppendLocation: true,
        ebayConnection: { select: { lastEbaySoldSyncAt: true } },
      },
    });

    if (!organizer?.ebayConnection) {
      console.warn(`[eBay ReviseQty] No eBay connection for organizer of item ${itemId}`);
      return;
    }

    // Condition 2: stale-overwrite risk. Compare against EbayConnection's own
    // lastEbaySoldSyncAt (the cron's reconciliation timestamp for THIS
    // organizer), not Item.updatedAt — the caller's own sellItemUnits() call
    // just touched Item.updatedAt moments ago (it increments stockSold), so
    // updatedAt would always read "fresh" and this check would never fire.
    // lastEbaySoldSyncAt actually reflects when eBay-side orders for this
    // organizer were last polled, which is the real race window the hacker
    // review flagged.
    const lastSync = organizer.ebayConnection.lastEbaySoldSyncAt;
    const staleMs = lastSync ? Date.now() - lastSync.getTime() : Infinity;
    if (staleMs > STALE_SYNC_THRESHOLD_MS) {
      console.warn(
        `[eBay ReviseQty] potential-stale-overwrite — item ${itemId} organizer ${organizer.id} ` +
          `lastEbaySoldSyncAt=${lastSync ? lastSync.toISOString() : 'never'} ` +
          `(${lastSync ? Math.round(staleMs / 60000) : 'n/a'} min ago). Proceeding with PUT ` +
          `per hacker-review condition 2 (log, don't block).`
      );
    }

    const accessToken = await refreshEbayAccessToken(organizer.id);
    if (!accessToken) {
      console.error(`[eBay ReviseQty] Could not refresh token for item ${itemId}`);
      return;
    }

    // Condition 6: floor at 1, never 0 — identical to the publish-time payload
    // floor (ebayController.ts:2397-2400). sellItemUnits() can legitimately
    // return 0 for a fully-sold-out sale, but that branch is excluded above
    // (fullySoldOut guard), so this floor only ever matters for the
    // theoretical edge case of remainingStock arriving as 0 for a partial sale.
    const quantity = Math.max(saleOutcome.remainingStock, 1);

    const sku = buildCustomLabel(itemId, organizer, item);
    const headers = { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() };
    const inventoryPath = `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`;
    const inventoryUrl = ebayProxyUrl(encodeURIComponent(inventoryPath));

    // GET current inventory_item — full-replace API (see header note), so we
    // preserve the existing product/condition/packaging fields and merge in
    // only the new quantity, mirroring the established GET-merge-PUT pattern
    // used for the sibling `offer` endpoint (applyFulfillmentPolicyToOffer).
    const getRes = await fetch(inventoryUrl, { method: 'GET', headers });
    if (!getRes.ok) {
      const errText = await getRes.text();
      console.warn(
        `[eBay ReviseQty] inventory_item GET failed for item ${itemId} sku=${sku}: ${getRes.status} ${errText.slice(0, 300)}`
      );
      return; // Fail-safe: never guess a payload, never PUT on a failed GET.
    }
    trackEbayCall();

    const inventoryItem = (await getRes.json()) as Record<string, any>;
    const existingAvailability = (inventoryItem.availability as Record<string, unknown> | undefined) ?? {};
    const existingShipToLocation =
      (existingAvailability.shipToLocationAvailability as Record<string, unknown> | undefined) ?? {};
    inventoryItem.availability = {
      ...existingAvailability,
      shipToLocationAvailability: {
        ...existingShipToLocation,
        quantity,
      },
    };

    const putRes = await fetch(inventoryUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(inventoryItem),
    });

    if (!putRes.ok && putRes.status !== 204) {
      const errText = await putRes.text();
      console.error(
        `[eBay ReviseQty] inventory_item PUT failed for item ${itemId} sku=${sku}: ${putRes.status} ${errText.slice(0, 300)}`
      );
      return;
    }
    trackEbayCall();

    console.log(`[eBay ReviseQty] Revised quantity to ${quantity} for item ${itemId} sku=${sku}`);
  } catch (error) {
    console.error(`[eBay ReviseQty] Error revising eBay quantity for item ${itemId}:`, error);
    // Fire-and-forget: never throw back to the caller's checkout path.
  }
}
