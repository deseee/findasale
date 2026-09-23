/**
 * soldFanOutService.ts -- the "pull it everywhere else" fan-out for a SOLD transition that
 * happened on a FindA.Sale-side rail (2026-09-23).
 *
 * Same four fire-and-forget calls every other SOLD call site already makes inline (Stripe, POS,
 * cash, reservations, vendor-booth cart, holds, bounties, eBay cron, bulk + single item edit):
 * eBay withdraw, Shopify mark-sold, Discogs withdraw, Facebook nudge / REMOVE enqueue. Added for
 * the call sites that were missing it (Square single + cart payment, native auction close). The
 * extension-driven platforms (Facebook, Poshmark, Mercari, Craigslist, Vinted) need nothing here:
 * getPendingRemovals picks up any SOLD item with a still-POSTED job row.
 *
 * Never throws; every call self-guards (no-op when the item was never on that channel).
 */

import { endEbayListingIfExists } from '../controllers/ebayController';
import { markShopifyItemSold } from './shopifyService';
import { withdrawDiscogsListingIfExists } from './marketplace/discogsListingConnector';
import { notifyFacebookExportedItemSold } from './facebookNudgeService';

export function fanOutItemSoldWithdrawals(itemId: string, source: string): void {
  endEbayListingIfExists(itemId).catch((err: any) =>
    console.warn(`[eBay] withdraw-on-SOLD (${source}) failed for item ${itemId}:`, err?.message)
  );
  markShopifyItemSold(itemId).catch((err: any) =>
    console.warn(`[Shopify] mark-sold-on-SOLD (${source}) failed for item ${itemId}:`, err?.message)
  );
  withdrawDiscogsListingIfExists(itemId).catch((err: any) =>
    console.warn(`[Discogs] withdraw-on-SOLD (${source}) failed for item ${itemId}:`, err?.message)
  );
  notifyFacebookExportedItemSold(itemId).catch((err: any) =>
    console.warn(`[FB Nudge] (${source}) failed for item ${itemId}:`, err?.message)
  );
}
