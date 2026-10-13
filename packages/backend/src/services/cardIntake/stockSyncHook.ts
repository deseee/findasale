/**
 * Single inventory number (2026-10-13): after a card import changed the unit count of existing items, bring every market in line with
 * the new in-stock number. Kept in its own tiny module so the card intake stays free of marketplace imports: the intake's import
 * graph is asserted (cardIntakeCopyAndIsolation.test.ts) to contain no AI service, HTTP client or tier module, and that walk follows
 * dynamic imports too. So this module imports NOTHING from the sync engine. The app registers the runner once at startup
 * (index.ts calls setStockSyncRunner(syncItemStock)); until then, and under test, a call does nothing. Never throws.
 */
export type StockSyncRunner = (itemId: string, reason: string) => Promise<unknown>;

let runner: StockSyncRunner | null = null;

/** Called once at app startup with services/inventoryStockSync.syncItemStock. */
export function setStockSyncRunner(fn: StockSyncRunner | null): void {
  runner = fn;
}

export function syncChangedStockInBackground(itemIds: readonly string[], reason: string): void {
  if (itemIds.length === 0 || process.env.NODE_ENV === 'test') return;
  const run = runner;
  if (!run) {
    console.warn('[CardIntake] stock sync after import skipped: no stock sync runner registered');
    return;
  }
  const ids = Array.from(new Set(itemIds));
  (async () => {
    for (const id of ids) await run(id, reason);
  })().catch((err: unknown) => console.warn('[CardIntake] stock sync after import failed:', (err as Error)?.message ?? err));
}
