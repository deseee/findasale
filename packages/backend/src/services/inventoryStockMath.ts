/**
 * inventoryStockMath.ts -- the one pure definition of "in stock" (2026-10-13, single inventory number).
 *
 * In stock = max(COALESCE(Item.stockTotal, 1) - Item.stockSold, 0).
 *
 * stockTotal / stockSold stay the PRIVATE internal ledger (no schema change); the organizer and every market only
 * ever see this one derived number. This file has no imports so any module (controllers, services, crons) can use it
 * without creating an import cycle. services/inventoryStockSync.ts re-exports inStockOf.
 */

export function inStockOf(item: { stockTotal: number | null; stockSold: number }): number {
  const total = item.stockTotal === null || item.stockTotal === undefined ? 1 : item.stockTotal;
  const sold = typeof item.stockSold === 'number' && Number.isFinite(item.stockSold) ? item.stockSold : 0;
  return Math.max(total - sold, 0);
}
