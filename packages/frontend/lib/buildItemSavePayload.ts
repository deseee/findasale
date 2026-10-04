/**
 * Pure builder for the PUT /items/:id body used by the item editor.
 *
 * Extracted verbatim from `buildSavePayload` in pages/organizer/edit-item/[id].tsx so every host of the
 * shared item form (Edit, and later the Add and Review sheets) saves identically, including the
 * "touched" gating. This is a pure extraction: for the same inputs the object it returns is identical
 * to the old closure, key for key and in the same key order, so JSON.stringify output is byte-identical.
 * It has no React, no imports and no side effects. Nothing imports it yet.
 *
 * Semantics worth knowing (all inherited from the original):
 * - `price` is NOT converted here. The payload carries formData.price exactly as held in state (a string).
 *   A parsed number is used only to compute the best-offer dollar amounts.
 * - A key whose value is `undefined` is dropped by JSON.stringify. That is how "omit" is expressed for
 *   the touched-gated fields (package size, shipping, consignor) and the UI-only percent fields.
 * - `null` is sent as an explicit "clear this value".
 * - Anything else on `formData` is spread through unchanged, so a field added to the form state later is
 *   sent automatically unless it is listed as an override here.
 */

/** Form state shape the editor keeps. Extra keys on the real object are allowed and are sent as-is. */
export interface ItemFormData {
  title: string;
  description: string;
  /** Raw text from the price input. Sent unchanged. */
  price: string;
  quantity: number;
  stockTotal: number;
  category: string;
  ebayCategoryId: string;
  ebayCategoryName: string;
  condition: string;
  conditionGrade: string;
  tags: string[];
  status: string;
  listingType: string;
  /** Naive local string from a datetime-local input, or ''. */
  auctionEndTime: string;
  qrEmbedEnabled: boolean;
  isLegendary: boolean;
  tagColor: string;
  locationId: string | null;
  costBasis: string;
  roomTag: string;
  packageWeightOz: string;
  packageLengthIn: string;
  packageWidthIn: string;
  packageHeightIn: string;
  packageType: string;
  shippingAvailable: boolean;
  shippingPrice: string;
  crosslisterFreeShipping: boolean;
  brand: string;
  size: string;
  color: string;
  material: string;
  upc: string;
  mpn: string;
  isbn: string;
  allowBestOffer: boolean;
  excludeFromMarkdown: boolean;
  /** UI-only percent (0-100) or '' when blank. Never sent. */
  bestOfferAcceptPct: number | '';
  /** UI-only percent (0-100) or '' when blank. Never sent. */
  bestOfferDeclinePct: number | '';
  ebayShippingOverride: string | null;
  /** '' means no consignor. */
  consignorId: string;
  ebayFulfillmentPolicyOverrideId: string | null;
}

/** Everything the builder reads from the page state. */
export interface ItemSaveState {
  formData: ItemFormData;
  /** Raw text of the quantity input (may be mid-typing). Clamped to an integer of at least 1. */
  quantityText: string;
  /** Raw text of the stock total input (may be mid-typing). Clamped to an integer of at least 1. */
  stockTotalText: string;
}

/** "Real edit vs incidental re-save" flags. Untouched means the gated keys are omitted. */
export interface ItemSaveTouched {
  /** Package weight and dimensions were really edited or confirmed this session. */
  weightTouched: boolean;
  /** The shipping checkbox or shipping price was really edited this session. */
  shippingTouched: boolean;
  /** The consignor picker was really edited this session. */
  consignorTouched: boolean;
}

export interface ItemSaveOptions {
  /**
   * Only when strictly true does the payload gain `skipMarketplaceSync: true` (as the last key).
   * Default and false leave the payload unchanged. The backend honors it in a later wave.
   */
  skipMarketplaceSync?: boolean;
}

/** The PUT /items/:id body. Keys not listed here come straight from the form state. */
export type ItemSavePayload = Omit<
  ItemFormData,
  | 'quantity'
  | 'stockTotal'
  | 'packageWeightOz'
  | 'packageLengthIn'
  | 'packageWidthIn'
  | 'packageHeightIn'
  | 'shippingAvailable'
  | 'shippingPrice'
  | 'auctionEndTime'
  | 'ebayShippingOverride'
  | 'ebayFulfillmentPolicyOverrideId'
  | 'bestOfferAcceptPct'
  | 'bestOfferDeclinePct'
  | 'consignorId'
> & {
  quantity: number;
  stockTotal: number;
  /** number|null when weight touched, otherwise undefined (omitted). */
  packageWeightOz: number | null | undefined;
  packageLengthIn: number | null | undefined;
  packageWidthIn: number | null | undefined;
  packageHeightIn: number | null | undefined;
  /** Present only when weight was touched and a positive weight is set. */
  packageConfirmedByOrganizer?: true;
  packageEstimateSource?: 'ORGANIZER';
  bestOfferAutoAcceptAmt: number | null;
  bestOfferMinimumAmt: number | null;
  ebayShippingOverride: string | null;
  ebayFulfillmentPolicyOverrideId: string | null;
  /** boolean when shipping touched, otherwise undefined (omitted). */
  shippingAvailable: boolean | undefined;
  /** number|null when shipping touched, otherwise undefined (omitted). */
  shippingPrice: number | null | undefined;
  /** UTC ISO string, or null when no end time. */
  auctionEndTime: string | null;
  /** Always undefined: UI-only. */
  bestOfferAcceptPct: undefined;
  bestOfferDeclinePct: undefined;
  /** string|null when consignor touched (null clears), otherwise undefined (omitted). */
  consignorId: string | null | undefined;
  /** Present (true) only when the option was strictly true. */
  skipMarketplaceSync?: true;
};

/** Mirrors the page's parseCount: integer, never below 1. */
const parseCount = (text: string): number => Math.max(1, parseInt(text, 10) || 1);

/** Positive integer or null (backend zod requires Int for package fields). */
const toIntOrNull = (v: string): number | null => {
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function buildItemSavePayload(
  state: ItemSaveState,
  touched: ItemSaveTouched,
  opts?: ItemSaveOptions,
): ItemSavePayload {
  const { formData, quantityText, stockTotalText } = state;
  const { weightTouched, shippingTouched, consignorTouched } = touched;

  const price = parseFloat(String(formData.price)) || 0;
  const acceptPct = typeof formData.bestOfferAcceptPct === 'number' ? formData.bestOfferAcceptPct : null;
  const declinePct = typeof formData.bestOfferDeclinePct === 'number' ? formData.bestOfferDeclinePct : null;

  const payload: ItemSavePayload = {
    ...formData,
    // A value typed but not yet blurred must still be saved, so clamp the raw text here.
    quantity: parseCount(quantityText),
    stockTotal: parseCount(stockTotalText),
    // Package size is gated behind weightTouched: an unreviewed estimate must not overwrite the column
    // on an unrelated save. Omitted entirely when untouched.
    packageWeightOz: weightTouched ? toIntOrNull(formData.packageWeightOz) : undefined,
    // Confirm-on-real-edit: only when the organizer actually edited the weight.
    ...(weightTouched && toIntOrNull(formData.packageWeightOz) !== null
      ? ({ packageConfirmedByOrganizer: true, packageEstimateSource: 'ORGANIZER' } as const)
      : {}),
    packageLengthIn: weightTouched ? toIntOrNull(formData.packageLengthIn) : undefined,
    packageWidthIn: weightTouched ? toIntOrNull(formData.packageWidthIn) : undefined,
    packageHeightIn: weightTouched ? toIntOrNull(formData.packageHeightIn) : undefined,
    allowBestOffer: formData.allowBestOffer,
    bestOfferAutoAcceptAmt: formData.allowBestOffer && acceptPct !== null && price > 0
      ? parseFloat((price * (1 - acceptPct / 100)).toFixed(2))
      : null,
    bestOfferMinimumAmt: formData.allowBestOffer && declinePct !== null && price > 0
      ? parseFloat((price * (1 - declinePct / 100)).toFixed(2))
      : null,
    excludeFromMarkdown: formData.excludeFromMarkdown,
    ebayShippingOverride: formData.ebayShippingOverride || null,
    ebayFulfillmentPolicyOverrideId: formData.ebayFulfillmentPolicyOverrideId || null,
    // Shipping is only an explicit organizer edit when shippingTouched. Otherwise both keys are omitted
    // so an unrelated save is never mistaken for a real shipping edit by the backend.
    shippingAvailable: shippingTouched ? formData.shippingAvailable : undefined,
    shippingPrice: shippingTouched
      ? (formData.shippingPrice ? parseFloat(formData.shippingPrice) : null)
      : undefined,
    // Always an explicit value: there is no auto-suggest to protect, so no touched gate.
    crosslisterFreeShipping: formData.crosslisterFreeShipping,
    // datetime-local gives a naive local string. Convert to a UTC ISO string before sending.
    auctionEndTime: formData.auctionEndTime ? new Date(formData.auctionEndTime).toISOString() : null,
    // UI-only percent fields are stripped.
    bestOfferAcceptPct: undefined,
    bestOfferDeclinePct: undefined,
    // Only sent when the consignor picker was touched. '' means clear the attribution, sent as null.
    consignorId: consignorTouched ? (formData.consignorId || null) : undefined,
  };

  if (opts && opts.skipMarketplaceSync === true) {
    payload.skipMarketplaceSync = true;
  }

  return payload;
}
