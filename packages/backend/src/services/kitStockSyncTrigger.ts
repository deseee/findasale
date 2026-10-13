/**
 * kitStockSyncTrigger.ts -- re-push the stock number of every kit-related listing after a sale that touched a kit (2026-10-13).
 *
 * Kits are listed on every marketplace like any item, so the moment a kit sells (it takes its components) or one of its components
 * sells (the kit's derived stock shrinks), every market that carries a quantity must hear about it:
 *
 *   - a KIT was sold / restocked  -> syncItemStock(kit): the kit's own listings get the new quantity (or are ended at zero), and
 *     inventoryStockSync cascades to each component (their stock was taken);
 *   - a COMPONENT was sold / restocked -> syncItemStock(each kit that contains it, noCascade): the kits' listings get the new
 *     derived quantity (or are ended at zero).
 *
 * WHY a separate module with a delay: the stock functions that detect "this was a kit / component" (itemStockService.sellItemUnits,
 * itemSaleGuard.commitItemSale, refund restock) usually run INSIDE the caller's database transaction, which has not committed yet.
 * syncItemStock re-reads the database, so it must run after the commit; a short delay (default 2.5 s) is the post-commit hook, and
 * inventoryReconcileCron is the backstop for the rare transaction that outlives it. Ordinary items never reach this module, so the
 * hot sale path costs nothing extra for them. Nothing here ever throws or blocks the sale.
 *
 * Lazy imports keep this module cycle-free (itemStockService imports it; inventoryStockSync imports the eBay controller).
 */

export type KitRelatedKind = 'kit' | 'component';

/** Runs the sync now (used by tests and by the delayed scheduler). Never throws. */
export async function syncKitRelatedStock(itemId: string, kind: KitRelatedKind, reason: string): Promise<void> {
  try {
    const { prisma } = await import('../lib/prisma');
    const { syncItemStock } = await import('./inventoryStockSync');
    if (kind === 'kit') {
      await syncItemStock(itemId, reason); // default cascade also re-syncs the components
      return;
    }
    const rows = (await (prisma as any).itemKitComponent.findMany({ where: { componentItemId: itemId }, select: { kitItemId: true } })) ?? [];
    for (const r of rows as Array<{ kitItemId: string }>) {
      await syncItemStock(r.kitItemId, `${reason} (component ${itemId})`, { noCascade: true });
    }
  } catch (err: any) {
    console.warn(`[KitStockSync] ${kind} sync (${reason}) failed for item ${itemId}:`, err?.message);
  }
}

/** Fire-and-forget, after the caller's transaction has had time to commit. Skipped under jest (no stray timers). */
export function scheduleKitRelatedStockSync(itemId: string, kind: KitRelatedKind, reason: string, delayMs = 2500): void {
  try {
    if (process.env.JEST_WORKER_ID) return;
    const t = setTimeout(() => {
      void syncKitRelatedStock(itemId, kind, reason);
    }, delayMs);
    if (typeof (t as any)?.unref === 'function') (t as any).unref();
  } catch {
    /* never block a sale */
  }
}
