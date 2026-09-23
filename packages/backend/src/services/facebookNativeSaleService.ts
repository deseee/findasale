/**
 * facebookNativeSaleService.ts — shared "commit a Facebook-detected sale" cascade.
 *
 * Extracted from extensionController.ts's markItemSoldOnFacebook (2026-09-20, ADR-131)
 * so the same commit-and-cascade logic can be called from more than one signal source
 * without copy-pasting it a third time. This is now the SECOND real call site of the
 * "caller-supplied soldVia" shape routes/internal.ts's `/mark-item-sold-elsewhere` route
 * already established (see that route's own comment, ~internal.ts:1171) — this helper
 * generalizes that same shape into a reusable function rather than route-only logic.
 *
 * Call sites (as of ADR-131):
 *  - extensionController.ts markItemSoldOnFacebook -- soldVia='FB_NATIVE' (DOM-scan
 *    detection: the content script matched a "Sold"/"View Order" card on Facebook's own
 *    selling page).
 *  - services/facebookMarketplaceEmailSoldDetection.ts processFacebookMarketplaceOrderEmail
 *    -- soldVia='FB_EMAIL_ORDER' (order-confirmation email detection, ADR-131). New as of
 *    this change; see that file for the vendor-agnostic parsing/matching core.
 *  - routes/internal.ts /mark-item-sold-elsewhere -- caller-supplied soldVia (2026-09-23: its
 *    inline copy of this cascade was replaced by a call to this helper).
 *  - services/vintedSoldDetectionService.ts processVintedSoldReport -- soldVia='VINTED'
 *    (2026-09-23, extension wardrobe sold-detection; closes the item's VINTED listing record
 *    itself before calling this, since this helper touches no MarketplaceListingJob rows).
 *
 * Deliberately does NOT call notifyFacebookExportedItemSold for either call site: that
 * hook's job is telling the extension to go remove the matching Facebook listing, which
 * is meaningless here -- the sale happened ON Facebook, so there's nothing left to remove
 * there (see markItemSoldOnFacebook's original header comment, preserved at its call site).
 *
 * SECURITY: this function does NOT check item ownership. Callers are responsible for
 * authorization before calling this (markItemSoldOnFacebook verifies assertItemOwned;
 * the future email job resolves itemId server-side from a matched MarketplaceListingJob
 * row, not from any user-supplied input, same trust model as /mark-item-sold-elsewhere).
 */

import { prisma } from '../lib/prisma';
import { commitItemSale, ItemAlreadyCommittedError } from './itemSaleGuard';
import { endEbayListingIfExists } from '../controllers/ebayController';
import { markShopifyItemSold } from './shopifyService';
import { withdrawDiscogsListingIfExists } from './marketplace/discogsListingConnector';

export interface CommitFacebookNativeSaleResult {
  ok: true;
  /** true when the item was already SOLD (this call, a prior poll cycle, or any other
   * channel) -- an idempotent no-op, never an error. false on a genuine fresh transition. */
  alreadyCommitted: boolean;
}

/**
 * Atomically transitions `itemId` to SOLD (via the ADR-098 commitItemSale guard,
 * AVAILABLE -> SOLD only) and, on a genuine fresh transition, tags it with `soldVia`
 * and fires the same cross-channel withdrawal calls every other SOLD-transition call
 * site uses (eBay, Shopify, Discogs -- fire-and-forget, never blocking the caller).
 *
 * Idempotent: a repeat call for an item already SOLD (via this same channel or any
 * other) resolves to `{ ok: true, alreadyCommitted: true }` rather than throwing --
 * callers must NOT treat ItemAlreadyCommittedError as an error condition themselves,
 * this function already absorbs it.
 *
 * @param itemId  The Item to transition. Caller is responsible for authorization --
 *                see SECURITY note above.
 * @param soldVia Free-form tag written to Item.lastSoldVia on a fresh transition only
 *                (never re-stamped on an idempotent repeat). Known values as of
 *                ADR-131: 'FB_NATIVE' (DOM-scan detection), 'FB_EMAIL_ORDER' (order-
 *                confirmation email detection). Item.lastSoldVia is a plain String? --
 *                no enum, no migration needed to add another value.
 */
export async function commitFacebookNativeSale(
  itemId: string,
  soldVia: string,
): Promise<CommitFacebookNativeSaleResult> {
  try {
    await commitItemSale(itemId, 'SOLD', ['AVAILABLE']);
  } catch (err: any) {
    if (err instanceof ItemAlreadyCommittedError) {
      return { ok: true, alreadyCommitted: true };
    }
    throw err;
  }

  // Sold-channel observability -- deliberately a separate follow-up write, NOT folded
  // into commitItemSale() itself (see itemSaleGuard.ts header: that helper is the single
  // ADR-098 atomic status-transition guard shared by every sale-completing call site, and
  // widening its signature for one metadata field is out of scope). Only runs on a genuine
  // fresh transition -- the ItemAlreadyCommittedError branch above already returned.
  await prisma.item.update({ where: { id: itemId }, data: { lastSoldVia: soldVia } });

  endEbayListingIfExists(itemId).catch((err: any) =>
    console.warn(`[eBay] withdraw-on-SOLD (${soldVia}) failed for item ${itemId}:`, err.message)
  );
  markShopifyItemSold(itemId).catch((err: any) =>
    console.warn(`[Shopify] mark-sold-on-SOLD (${soldVia}) failed for item ${itemId}:`, err.message)
  );
  withdrawDiscogsListingIfExists(itemId).catch((err: any) =>
    console.warn(`[Discogs] withdraw-on-SOLD (${soldVia}) failed for item ${itemId}:`, err.message)
  );

  return { ok: true, alreadyCommitted: false };
}
