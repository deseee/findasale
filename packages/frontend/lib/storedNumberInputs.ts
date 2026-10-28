/**
 * Native <input type="number"> constraints (min / max / step) that never block saving a value
 * the backend already stored.
 *
 * Bug 2026-10-28: the edit-item form rendered an item's stored eBay auto-accept threshold as 0%
 * (stored dollar amount equal to the price). The input had min="1", so the browser's own
 * validation refused EVERY save of that item, even one that only changed the title, until the
 * organizer edited a best-offer field they never touched.
 *
 * Backend semantics (Item.bestOfferAutoAcceptAmt / Item.bestOfferMinimumAmt, packages/database
 * schema.prisma): both are optional DOLLAR amounts. null means "not set" (no threshold is sent to
 * eBay). The item update route stores any number as-is with no range check, and the eBay publish
 * path only sends a threshold when the amount is truthy. The form shows them as a percentage OFF
 * the price, so a 0% (or negative) value just means the stored dollar amount is at or above the
 * current price, usually because the price was marked down after the threshold was set. That is
 * a stored value the backend accepts, so it must never block a save.
 */

export const BEST_OFFER_PCT_MIN = 1;
export const BEST_OFFER_PCT_MAX = 99;

/** True when a best-offer percentage is set but outside the 1 to 99 range the form asks for. */
export function isBestOfferPctOutOfRange(value: number | ''): boolean {
  return typeof value === 'number' && (value < BEST_OFFER_PCT_MIN || value > BEST_OFFER_PCT_MAX);
}

/**
 * Non-blocking note shown under the best-offer inputs when a value is outside 1 to 99, or null.
 * Below 1% means the stored dollar threshold is at or above the current price.
 */
export function bestOfferPctRangeNote(acceptPct: number | '', declinePct: number | ''): string | null {
  const values = [acceptPct, declinePct].filter((v): v is number => isBestOfferPctOutOfRange(v));
  if (values.length === 0) return null;
  if (values.some((v) => v < BEST_OFFER_PCT_MIN)) {
    return "A saved threshold is at or above the current price, so eBay can't use it. Enter 1 to 99, or clear it. You can still save other changes.";
  }
  return 'A saved threshold is outside 1 to 99%. Enter 1 to 99, or clear it. You can still save other changes.';
}

/**
 * min/max props for a best-offer percentage input. The 1 to 99 range is enforced only once the
 * organizer has edited that field on this form; a value loaded from the item is left alone.
 */
export function bestOfferPctInputBounds(edited: boolean): { min?: number; max?: number } {
  return edited ? { min: BEST_OFFER_PCT_MIN, max: BEST_OFFER_PCT_MAX } : {};
}

/**
 * step prop for a money input. Cents ("0.01") normally; "any" when the value already has more than
 * two decimal places (Item.price is a Float, and one prod item holds 13.192), so the browser does
 * not refuse the save with "Please enter a valid value".
 */
export function moneyInputStep(value: string | number | null | undefined): '0.01' | 'any' {
  if (value === null || value === undefined || value === '') return '0.01';
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.01';
  return Math.abs(Math.round(n * 100) - n * 100) < 1e-6 ? '0.01' : 'any';
}
