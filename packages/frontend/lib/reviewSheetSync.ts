/**
 * Review page: re-sync a card from the server after the "All details" sheet saved or closed (Wave 3 round 2, F3).
 *
 * The card keeps its own edit state (`editStates`) and typed price (`priceInputs`), both seeded once from the item.
 * After the sheet saves, the server item is newer than both. These pure helpers decide what to take from the server
 * without ever overwriting something the organizer typed on the card and has not saved.
 *
 * Pure module: no imports, no React.
 */

/** The price input text for a saved price: the number when above zero, otherwise empty (never a Smart suggestion). */
export function priceInputFromServer(price: number | string | null | undefined): string {
  const n = typeof price === 'string' ? parseFloat(price) : price;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? String(n) : '';
}

/**
 * True when the price field holds something other than the item's saved price, i.e. the organizer typed or applied
 * a price that is not saved yet. Blank versus no saved price (or 0) counts as the same.
 */
export function typedPriceDiffersFromSaved(
  typedPrice: string | null | undefined,
  savedPrice: number | string | null | undefined,
): boolean {
  const typedStr = (typedPrice ?? '').trim();
  const typed = typedStr === '' ? null : parseFloat(typedStr);
  const savedNum = typeof savedPrice === 'string' ? parseFloat(savedPrice) : savedPrice;
  const saved = typeof savedNum === 'number' && Number.isFinite(savedNum) && savedNum > 0 ? savedNum : null;
  const typedOk = typed !== null && Number.isFinite(typed) && typed > 0 ? typed : null;
  if (typedOk === null && saved === null) return false;
  if (typedOk === null || saved === null) return true;
  return Math.abs(typedOk - saved) >= 0.005;
}

/**
 * New card edit state after a server refresh: everything from the fresh server-built state, except the fields the
 * organizer has edited on the card and not saved yet (`dirtyKeys`), which keep their current value. With no dirty
 * keys the result is the fresh state. Neither input is mutated.
 */
export function mergeEditStateFromServer<T extends object>(
  fresh: T,
  current: T | undefined,
  dirtyKeys: Iterable<string>,
): T {
  const out: Record<string, unknown> = { ...(fresh as Record<string, unknown>) };
  if (current) {
    for (const key of Array.from(dirtyKeys)) {
      if (key in (current as Record<string, unknown>)) {
        out[key] = (current as Record<string, unknown>)[key];
      }
    }
  }
  return out as T;
}
