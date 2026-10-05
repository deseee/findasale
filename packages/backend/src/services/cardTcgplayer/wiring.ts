/**
 * Default wiring of the TCGplayer round trip (ADR-137): the shared Prisma client, sellItemUnits for units TCGplayer
 * sold, a guarded SQL update for units TCGplayer added, and the same fire-and-forget marketplace propagation the
 * counter sale uses (cashPaymentController). Kept apart from syncService.ts so the service stays free of Prisma and
 * marketplace imports and tests can run on fakes.
 */
import { prisma } from '../../lib/prisma';
import { sellItemUnits } from '../itemStockService';
import { syncMarketplaceStock } from '../marketplaceStockSyncService';
import { endEbayListingIfExists } from '../../controllers/ebayController';
import { markShopifyItemSold } from '../shopifyService';
import { withdrawDiscogsListingIfExists } from '../marketplace/discogsListingConnector';
import { withdrawReverbListingIfExists } from '../marketplace/reverbConnector';
import { notifyFacebookExportedItemSold } from '../facebookNudgeService';
import type { SoldResult, SyncDb, SyncDeps, SyncTx } from './syncService';
import { assertNotBulkLot } from './lotGuard';

export const syncDb = prisma as unknown as SyncDb;

/** Same marketplace follow-up a counter sale triggers: withdraw on a full sellout, revise the quantity otherwise. */
export function propagateSold(result: SoldResult): void {
  const { itemId } = result;
  if (result.fullySoldOut) {
    endEbayListingIfExists(itemId).catch((err) => console.error('[cardTcgplayer] eBay withdraw failed:', (err as { name?: string })?.name ?? 'Error'));
    markShopifyItemSold(itemId).catch((err) => console.error('[cardTcgplayer] Shopify mark sold failed:', (err as { name?: string })?.name ?? 'Error'));
    withdrawDiscogsListingIfExists(itemId).catch((err) => console.error('[cardTcgplayer] Discogs withdraw failed:', (err as { name?: string })?.name ?? 'Error'));
    withdrawReverbListingIfExists(itemId).catch((err) => console.error('[cardTcgplayer] Reverb withdraw failed:', (err as { name?: string })?.name ?? 'Error'));
    notifyFacebookExportedItemSold(itemId).catch((err) => console.warn('[cardTcgplayer] Facebook nudge failed:', (err as { name?: string })?.name ?? 'Error'));
  } else {
    syncMarketplaceStock(itemId, { fullySoldOut: false, remainingStock: result.remainingStock }).catch((err) =>
      console.error('[cardTcgplayer] eBay quantity revise failed:', (err as { name?: string })?.name ?? 'Error')
    );
  }
}

export function createDefaultDeps(): SyncDeps {
  return {
    // A bulk lot is never part of the round trip (ADR-136 Addendum C): refuse before any stock write.
    sellUnits: async (itemId, units, tx: SyncTx) => {
      await assertNotBulkLot(tx, itemId);
      return sellItemUnits(itemId, units, tx as unknown as Parameters<typeof sellItemUnits>[2]);
    },
    raiseUnits: async (itemId, units, tx: SyncTx) => {
      // COALESCE keeps an item whose stockTotal is null (single unit) correct. Only an AVAILABLE item can grow, and a
      // bulk lot never grows from a TCGplayer file (the NOT EXISTS below).
      const raw = tx as unknown as { $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number> };
      const count = await raw.$executeRaw`
        UPDATE "Item"
        SET "stockTotal" = COALESCE("stockTotal", 1) + ${units}
        WHERE "id" = ${itemId} AND "status" = 'AVAILABLE'
          AND NOT EXISTS (SELECT 1 FROM "ItemBulkLot" b WHERE b."itemId" = "Item"."id")
      `;
      return count > 0;
    },
    onSold: propagateSold,
    now: () => new Date(),
  };
}
