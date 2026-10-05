/**
 * Local-edit marker for IMPORTED-ONLY eBay items (a non-blank ebayListingId, no ebayOfferId).
 *
 * Such an item cannot push edits back to eBay, and the background enrich pass / Trading backfill
 * (utils/ebayEnrichPlan.ts, controllers/ebayController.ts) treat eBay as the source of truth for it, EXCEPT while
 * ebayContentDirtyAt is set. A title/description/condition edit already sets that flag (computeEbayPushFields in
 * services/ebayItemPushService.ts). This helper decides the same for a real change to category, tags or photoUrls,
 * so the next import does not revert the organizer's edit. Writers outside updateItem (re-analyze) can also pass
 * title, description and condition so every path agrees.
 *
 * PURE: no prisma, no network. Items with an ebayOfferId are never marked here (they push, and enrich is blank-only
 * for them), and nothing here clears the flag.
 */

export interface ImportedEditItemState {
  ebayListingId?: string | null;
  ebayOfferId?: string | null;
  category?: string | null;
  tags?: string[] | null;
  photoUrls?: string[] | null;
  title?: string | null;
  description?: string | null;
  condition?: string | null;
}

/** The values a save writes; undefined means the save does not touch that field. */
export interface ImportedEditPayload {
  category?: string | null;
  tags?: string[] | null;
  photoUrls?: string[] | null;
  title?: string | null;
  description?: string | null;
  condition?: string | null;
}

const isBlank = (v: unknown): boolean => v == null || String(v).trim() === '';

/** True for an item imported from eBay that FindA.Sale never published: listing id set, offer id blank or whitespace. */
export function isImportedOnlyEbayItem(item: Pick<ImportedEditItemState, 'ebayListingId' | 'ebayOfferId'>): boolean {
  return !isBlank(item.ebayListingId) && isBlank(item.ebayOfferId);
}

const sameList = (a: unknown, b: unknown[]): boolean => {
  const old = Array.isArray(a) ? a : [];
  return old.length === b.length && old.every((v, i) => v === b[i]);
};

/**
 * True when the item is imported-only and the save REALLY changes category, tags or photoUrls (stored vs new value).
 * An undefined field, a no-op resave, or null versus '' for category is not a change. Arrays compare by value and order.
 */
export function importedOnlyEditNeedsDirtyMark(item: ImportedEditItemState, next: ImportedEditPayload): boolean {
  if (!isImportedOnlyEbayItem(item)) return false;

  for (const key of ['category', 'title', 'description', 'condition'] as const) {
    if (next[key] === undefined) continue;
    const before = isBlank(item[key]) ? null : item[key];
    const after = isBlank(next[key]) ? null : next[key];
    if (before !== after) return true;
  }
  if (Array.isArray(next.tags) && !sameList(item.tags, next.tags)) return true;
  if (Array.isArray(next.photoUrls) && !sameList(item.photoUrls, next.photoUrls)) return true;
  return false;
}

/**
 * Bulk and batch writers (updateMany cannot compare per item): the ids of the imported-only items among `items` whose
 * stored category / tags / photoUrls really differ from `next`. The caller sets ebayContentDirtyAt on exactly these ids.
 */
export function importedOnlyIdsNeedingDirtyMark<T extends ImportedEditItemState & { id: string }>(
  items: readonly T[],
  next: ImportedEditPayload,
): string[] {
  return items.filter((i) => importedOnlyEditNeedsDirtyMark(i, next)).map((i) => i.id);
}
