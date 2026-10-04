/**
 * Review page price-input helpers (Wave 3, F3).
 *
 * The Review page keeps the organizer-typed price per item in a Map<itemId, string> (`priceInputs`). It is
 * seeded once from each item's saved price and Approve sends that typed value. These pure helpers cover the
 * three places that must agree with it:
 *   - reseedPriceInputs: after a successful bulk price write, point the affected inputs at the new price so a
 *     later Approve cannot send the old seeded price and overwrite the bulk price.
 *   - bulkPriceWrittenIds: which items a bulk price response really wrote (eBay-listed items under $0.99 are
 *     skipped by the backend and keep their old price, so they must NOT be re-seeded).
 *   - typedPriceForReadiness: what to hand computeItemReadiness as the typed price.
 *
 * This is the saved price, never the Smart suggestion: a suggested price is tap-to-apply only and is never
 * placed in the input by these helpers.
 *
 * Pure module: no imports, no React.
 */

/**
 * New Map with the given ids set to the new price. A price above zero becomes its string form, as the seed
 * does. A price of zero or less (or not a number) becomes '' so Approve asks for a price instead of sending a
 * stale one. Ids not listed, and the input Map itself, are left untouched.
 */
export function reseedPriceInputs(
  prev: ReadonlyMap<string, string>,
  ids: readonly string[],
  price: number,
): Map<string, string> {
  const next = new Map(prev);
  const value = Number.isFinite(price) && price > 0 ? String(price) : '';
  for (const id of ids) next.set(id, value);
  return next;
}

/**
 * Item ids a bulk price response wrote. Reads `succeeded` from the response body. When the body has no
 * `succeeded` array, falls back to the requested ids only for a plain 200 (a 207 means some items were
 * skipped or failed and without the list there is no way to tell which, so nothing is re-seeded).
 */
export function bulkPriceWrittenIds(
  responseData: unknown,
  httpStatus: number | undefined,
  requestedIds: readonly string[],
): string[] {
  const succeeded = (responseData as { succeeded?: unknown } | null | undefined)?.succeeded;
  if (Array.isArray(succeeded)) {
    const requested = new Set(requestedIds);
    return succeeded.filter((id): id is string => typeof id === 'string' && requested.has(id));
  }
  return httpStatus === 200 ? [...requestedIds] : [];
}

/** Short visible note for items a bulk price write skipped (eBay minimum), or null when none were. */
export function bulkPriceSkippedMessage(responseData: unknown): string | null {
  const skipped = (responseData as { skipped?: unknown } | null | undefined)?.skipped;
  if (!Array.isArray(skipped) || skipped.length === 0) return null;
  const reason =
    typeof (skipped[0] as { reason?: unknown })?.reason === 'string'
      ? (skipped[0] as { reason: string }).reason
      : 'Not changed';
  const n = skipped.length;
  return `${n} item${n !== 1 ? 's' : ''} kept the old price. ${reason}.`;
}

/**
 * The typed price argument for computeItemReadiness. When the item has an entry in the price inputs (seeded
 * or typed, including an emptied field) that string is the price that counts. When it has no entry yet (first
 * render before the seeding effect has run) it returns undefined so readiness falls back to the item's saved
 * price instead of flashing red.
 */
export function typedPriceForReadiness(
  priceInputs: ReadonlyMap<string, string>,
  itemId: string,
): string | undefined {
  return priceInputs.has(itemId) ? priceInputs.get(itemId) : undefined;
}
