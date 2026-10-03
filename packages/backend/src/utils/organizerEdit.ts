/**
 * Organizer-edit stamping helpers for Item.lastEditedAt.
 *
 * Item.updatedAt cannot mean "the organizer last edited this" because crons, background jobs and marketplace
 * sync (roughly 189 writer sites) bump it on every write. Item.lastEditedAt is stamped ONLY from
 * organizer-driven request handlers, through the helpers below.
 *
 * IMPORTANT: crons, background jobs and marketplace sync/pull flows must NOT call these helpers. If a
 * non-organizer writer stamps lastEditedAt, the column loses its meaning.
 *
 * Pure and dependency-free on purpose (no prisma, no @findasale/shared) so it is trivially unit-testable.
 */

/**
 * User-visible Item fields an organizer edits. Derived from the updateItem handler and the Item model.
 * System-managed fields (updatedAt, priceUpdatedAt, originalPrice, priceBeforeMarkdown, rarity, ebay sync
 * ids and states, discogs and reverb ids, embeddings, aiConfidence, viewCount, userEditedFields, ...) are
 * deliberately NOT listed, so a patch that only touches them never counts as an organizer edit.
 */
export const ORGANIZER_VISIBLE_ITEM_FIELDS = [
  // Core listing content
  'title',
  'description',
  'category',
  'condition',
  'conditionGrade',
  'conditionNotes',
  'brand',
  'size',
  'color',
  'material',
  'mpn',
  'upc',
  'ean',
  'isbn',
  'tags',
  'photoUrls',
  'lotNumber',
  'roomTag',
  // Pricing, status and quantity
  'price',
  'costBasis',
  'estimatedValue',
  'status',
  'draftStatus',
  'quantity',
  'stockTotal',
  'listingType',
  'isHighValue',
  'isLegendary',
  'excludeFromMarkdown',
  'consignorId',
  // Auction and reverse auction
  'auctionStartPrice',
  'auctionReservePrice',
  'bidIncrement',
  'auctionEndTime',
  'reverseAuction',
  'reverseDailyDrop',
  'reverseFloorPrice',
  'reverseStartDate',
  // Shipping and package
  'shippingAvailable',
  'shippingPrice',
  'crosslisterFreeShipping',
  'ebayShippingOverride',
  'ebayFulfillmentPolicyOverrideId',
  'packageWeightOz',
  'packageLengthIn',
  'packageWidthIn',
  'packageHeightIn',
  'packageType',
  'packageConfirmedByOrganizer',
  // Best offer and Organizer Special
  'allowBestOffer',
  'bestOfferAutoAcceptAmt',
  'bestOfferMinimumAmt',
  'organizerDiscountXp',
  'organizerDiscountAmount',
  // Organizer-chosen marketplace listing details (set from the edit form, not by sync)
  'ebayCategoryId',
  'ebayCategoryName',
  'ebaySecondaryCategoryId',
  'ebaySubtitle',
  'ebayEpid',
  // Display toggles
  'qrEmbedEnabled',
] as const;

export type OrganizerVisibleItemField = (typeof ORGANIZER_VISIBLE_ITEM_FIELDS)[number];

type Loose = Record<string, unknown>;

const hasOwn = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);

/** Prisma Decimal or similar: an object (not a Date or array) that can yield a number. */
function isDecimalLike(v: unknown): v is { toNumber?: () => number; toString: () => string } {
  if (v === null || typeof v !== 'object') return false;
  if (v instanceof Date || Array.isArray(v)) return false;
  const o = v as { toNumber?: unknown; toString?: unknown };
  if (typeof o.toNumber === 'function') return true;
  return typeof o.toString === 'function' && o.toString !== Object.prototype.toString;
}

function decimalToNumber(v: { toNumber?: () => number; toString: () => string }): number {
  if (typeof v.toNumber === 'function') return v.toNumber();
  return Number(v.toString());
}

/** Blank values (null, undefined, empty string) all mean "no value". */
function normalizeBlank(v: unknown): unknown {
  if (v === undefined || v === '') return null;
  return v;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  const x = normalizeBlank(a);
  const y = normalizeBlank(b);

  if (x === null || y === null) return x === y;

  // Dates: compare instants. A Date against a string is compared as a parsed date.
  if (x instanceof Date || y instanceof Date) {
    const tx = x instanceof Date ? x.getTime() : new Date(x as string | number).getTime();
    const ty = y instanceof Date ? y.getTime() : new Date(y as string | number).getTime();
    return Object.is(tx, ty);
  }

  // Arrays: shallow, order-sensitive element equality.
  if (Array.isArray(x) || Array.isArray(y)) {
    if (!Array.isArray(x) || !Array.isArray(y)) return false;
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) {
      if (!valuesEqual(x[i], y[i])) return false;
    }
    return true;
  }

  // Numbers: number, Decimal-like or numeric string against any of those. Numeric strings are only coerced
  // when the other side is numeric, so two text fields ("10" vs "10.0") are never conflated.
  const xNumeric = typeof x === 'number' || isDecimalLike(x);
  const yNumeric = typeof y === 'number' || isDecimalLike(y);
  if (xNumeric || yNumeric) {
    const nx = typeof x === 'number' ? x : isDecimalLike(x) ? decimalToNumber(x) : Number(String(x).trim());
    const ny = typeof y === 'number' ? y : isDecimalLike(y) ? decimalToNumber(y) : Number(String(y).trim());
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) return Math.abs(nx - ny) < 1e-9;
    return String(x) === String(y);
  }

  if (typeof x === 'object' || typeof y === 'object') {
    try {
      return JSON.stringify(x) === JSON.stringify(y);
    } catch {
      return false;
    }
  }

  return x === y;
}

/**
 * True only if at least one LISTED field present in the patch differs from the existing row.
 * - A field whose patch value is undefined is "not provided" and is ignored.
 * - Fields not in ORGANIZER_VISIBLE_ITEM_FIELDS never count, so system writes alone cannot stamp.
 * - Pass the NORMALIZED data you are about to write (for example updateData), not the raw request body,
 *   so that parsing differences are not mistaken for edits. Same-value resaves return false.
 */
export function hasUserVisibleChange(existing: Loose | null | undefined, patch: Loose | null | undefined): boolean {
  if (!patch) return false;
  const base: Loose = existing ?? {};
  for (const field of ORGANIZER_VISIBLE_ITEM_FIELDS) {
    if (!hasOwn(patch, field)) continue;
    const next = patch[field];
    if (next === undefined) continue;
    if (!valuesEqual(base[field], next)) return true;
  }
  return false;
}

/**
 * Returns `{ lastEditedAt: now }` when the patch changes a user-visible field, else `{}`.
 * Spread the result into a prisma update data object: `data: { ...updateData, ...organizerEditStamp(item, updateData) }`.
 * Organizer request handlers only. Crons, jobs and sync must NOT call this.
 */
export function organizerEditStamp(
  existing: Loose | null | undefined,
  patch: Loose | null | undefined,
  now: Date = new Date(),
): { lastEditedAt?: Date } {
  return hasUserVisibleChange(existing, patch) ? { lastEditedAt: now } : {};
}

/**
 * Unconditional stamp for flows that are inherently an organizer action (publish, photo add, remove or
 * reorder, append description, organizer-triggered sync). Organizer request handlers only. Crons, jobs and
 * background sync must NOT call this.
 */
export function organizerEditStampAlways(now: Date = new Date()): { lastEditedAt: Date } {
  return { lastEditedAt: now };
}
