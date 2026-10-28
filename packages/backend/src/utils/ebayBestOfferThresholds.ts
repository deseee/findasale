/**
 * eBay Best Offer threshold rules, shared by every path that sends bestOfferTerms
 * (or the Trading API equivalents) to eBay.
 *
 * Item.bestOfferAutoAcceptAmt and Item.bestOfferMinimumAmt are stored DOLLAR amounts set
 * once by the organizer. A later markdown lowers Item.price but never moves them, so the
 * stored auto-accept (or auto-decline) amount can end up at or above the price. eBay rejects
 * an offer whose auto-accept or auto-decline amount is at or above the Buy It Now price,
 * and an auto-decline at or above the auto-accept.
 *
 * The repair semantics are the ones ebayPriceRevisionService.ts has used for its
 * best-offer-threshold retry since 2026-09-19: replace BOTH thresholds with
 *   accept  = max(0.99, round(price * 0.90))
 *   minimum = max(0.50, round(accept * 0.75))
 * Moved here unchanged so the publish/offer paths apply the same numbers BEFORE sending,
 * instead of letting eBay reject the request first. Nothing here writes stored data: the
 * organizer's saved amounts stay as they are and are only adjusted in the eBay payload.
 */

export interface BestOfferThresholdPair {
  accept: number;
  minimum: number;
}

export interface ResolvedBestOfferThresholds {
  /** Auto-accept amount to send, or null to send none. */
  accept: number | null;
  /** Auto-decline (minimum) amount to send, or null to send none. */
  minimum: number | null;
  /** True when the stored amounts were invalid for this price and were replaced or dropped. */
  adjusted: boolean;
}

/** eBay error text for a Best Offer threshold conflict (Inventory API and Trading API wording). */
export function isBestOfferThresholdError(detail: string | undefined): boolean {
  if (!detail) return false;
  return (
    /best offer auto accept/i.test(detail) ||
    /auto decline amount/i.test(detail) ||
    /minimum best offer price/i.test(detail)
  );
}

/**
 * Safe thresholds proportional to a price. Same ratios as the original revise-time repair
 * (ebayPriceRevisionService.ts, 2026-09-19); do not change one without the other.
 */
export function computeSafeBestOfferThresholds(newPrice: number): BestOfferThresholdPair {
  const accept = Math.max(0.99, Math.round(newPrice * 0.9 * 100) / 100);
  const minimum = Math.max(0.5, Math.round(accept * 0.75 * 100) / 100);
  return { accept, minimum };
}

const toCents = (n: number): number => Math.round(n * 100) / 100;

/**
 * Coerce a stored amount (Prisma Decimal, number, numeric string, or an eBay Amount
 * object { value }) to dollars rounded to cents. Null, non-numeric, zero and negative
 * amounts mean "no threshold", matching the old truthy check that skipped 0.
 */
export function toBestOfferAmount(v: unknown): number | null {
  if (v == null) return null;
  const raw =
    typeof v === 'object' && 'value' in (v as Record<string, unknown>)
      ? (v as Record<string, unknown>).value
      : v;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return toCents(n);
}

/** True when eBay will accept these thresholds against this price (amounts in cents-rounded dollars). */
export function areBestOfferThresholdsValid(price: number, accept: number | null, minimum: number | null): boolean {
  const p = toCents(price);
  if (accept != null && accept >= p) return false;
  if (minimum != null && minimum >= p) return false;
  if (accept != null && minimum != null && minimum >= accept) return false;
  return true;
}

/**
 * Decide which thresholds to send for a price.
 * - Stored amounts that are valid for the price are sent unchanged (either may be null).
 * - If either is invalid, both are replaced with computeSafeBestOfferThresholds(price),
 *   the same pair the revise-time repair sends.
 * - If even the safe pair is invalid (a price of about $1.09 or less, where the $0.99
 *   floor reaches the price), no thresholds are sent; Best Offer itself stays on.
 */
export function resolveBestOfferThresholds(
  price: number,
  storedAccept: unknown,
  storedMinimum: unknown
): ResolvedBestOfferThresholds {
  const accept = toBestOfferAmount(storedAccept);
  const minimum = toBestOfferAmount(storedMinimum);
  if (accept == null && minimum == null) return { accept: null, minimum: null, adjusted: false };
  if (!Number.isFinite(price) || price <= 0) return { accept: null, minimum: null, adjusted: true };
  if (areBestOfferThresholdsValid(price, accept, minimum)) return { accept, minimum, adjusted: false };
  const safe = computeSafeBestOfferThresholds(price);
  if (areBestOfferThresholdsValid(price, safe.accept, safe.minimum)) {
    return { accept: safe.accept, minimum: safe.minimum, adjusted: true };
  }
  return { accept: null, minimum: null, adjusted: true };
}

export interface EbayBestOfferTerms {
  bestOfferEnabled: true;
  autoAcceptPrice?: { value: string; currency: string };
  autoDeclinePrice?: { value: string; currency: string };
}

/** Inventory API bestOfferTerms for a new or replaced offer, built from the item's stored amounts. */
export function buildBestOfferTerms(price: number, storedAccept: unknown, storedMinimum: unknown): EbayBestOfferTerms {
  const r = resolveBestOfferThresholds(price, storedAccept, storedMinimum);
  return {
    bestOfferEnabled: true,
    ...(r.accept != null ? { autoAcceptPrice: { value: r.accept.toFixed(2), currency: 'USD' } } : {}),
    ...(r.minimum != null ? { autoDeclinePrice: { value: r.minimum.toFixed(2), currency: 'USD' } } : {}),
  };
}

/**
 * For GET-then-PUT paths that echo eBay's own offer back with a new price: if the offer's
 * existing bestOfferTerms thresholds are invalid for the new price, fix them in place
 * (same rules as resolveBestOfferThresholds). Every other bestOfferTerms field is kept.
 * Returns true when the offer was changed.
 */
export function sanitizeOfferBestOfferTerms(offer: Record<string, unknown>, price: number): boolean {
  const terms = offer.bestOfferTerms as Record<string, unknown> | undefined;
  if (!terms || typeof terms !== 'object') return false;
  const acceptObj = terms.autoAcceptPrice as Record<string, unknown> | undefined;
  const declineObj = terms.autoDeclinePrice as Record<string, unknown> | undefined;
  const r = resolveBestOfferThresholds(price, acceptObj, declineObj);
  if (!r.adjusted) return false;
  const next: Record<string, unknown> = { ...terms };
  delete next.autoAcceptPrice;
  delete next.autoDeclinePrice;
  if (r.accept != null) {
    next.autoAcceptPrice = { value: r.accept.toFixed(2), currency: (acceptObj?.currency as string) || 'USD' };
  }
  if (r.minimum != null) {
    next.autoDeclinePrice = { value: r.minimum.toFixed(2), currency: (declineObj?.currency as string) || 'USD' };
  }
  offer.bestOfferTerms = next;
  return true;
}
