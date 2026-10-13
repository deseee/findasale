/**
 * Single inventory number (2026-10-13): after a card import changed the unit count of existing items, bring every market in line with
 * the new in-stock number. Kept in its own tiny module so commit.ts stays free of marketplace imports (the import runs on fakes in
 * tests). The sync module is loaded lazily, runs one item at a time in the background, never throws and is skipped under test.
 */
export function syncChangedStockInBackground(itemIds: readonly string[], reason: string): void {
  if (itemIds.length === 0 || process.env.NODE_ENV === 'test') return;
  const ids = Array.from(new Set(itemIds));
  import('../inventoryStockSync')
    .then(async (m) => {
      for (const id of ids) await m.syncItemStock(id, reason);
    })
    .catch((err: unknown) => console.warn(`[CardIntake] stock sync after import failed:`, (err as Error)?.message ?? err));
}
