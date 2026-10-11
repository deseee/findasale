/**
 * Product identifier merge for the live-listing edit push (brand, mpn, upc, ean, isbn).
 *
 * Pure logic, no network and no Prisma: services/ebayItemPushService.pushItemToEbay GETs the eBay inventory item, hands its
 * `product` object to mergeEbayIdentifiers together with the item's current identifier values, and PUTs the result back
 * (only when `changed`). It mirrors how first publish builds identifiers (controllers/ebayController.ts): product.brand
 * mirrors aspects.Brand, a Brand always travels with an MPN ('Does Not Apply' when there is no real part number),
 * product.upc / ean / isbn are one-element arrays, and the ISBN aspect is set alongside product.isbn.
 *
 * Safety rules (each one guards against eBay errorId 25002, "Brand/MPN/ISBN is missing", on the republish):
 *   - Values are trimmed. An empty value is never sent as an empty string.
 *   - A non-empty edit overwrites the existing value; aspect keys match case-insensitively and keep eBay's own spelling.
 *   - Brand set with no MPN anywhere on the listing gets MPN 'Does Not Apply'. A real MPN replaces 'Does Not Apply'.
 *   - MPN cleared while a Brand exists becomes 'Does Not Apply'. MPN cleared with no Brand is removed only when the category
 *     is KNOWN not to require MPN (mpnRequired === false); otherwise it is left untouched and reported (MPN_CLEAR_SKIPPED).
 *   - Brand cleared: never removed (the category may require it). eBay's Brand is left as is and reported (BRAND_CLEAR_SKIPPED).
 *   - UPC / EAN cleared: the product.upc / product.ean arrays are deleted.
 *   - ISBN cleared: deleted only when the category is not Books (261186) AND no ISBN aspect is on the listing; otherwise left
 *     untouched and reported (ISBN_CLEAR_SKIPPED), because ISBN is a required aspect for Books.
 *   - product.epid, imageUrls, title, description, subtitle and every aspect not named above are preserved untouched.
 */

export type EbayIdentifierField = 'brand' | 'mpn' | 'upc' | 'ean' | 'isbn';
export const EBAY_IDENTIFIER_FIELDS: readonly EbayIdentifierField[] = ['brand', 'mpn', 'upc', 'ean', 'isbn'];

/** eBay's accepted placeholder when a Brand has no real part number. */
export const MPN_PLACEHOLDER = 'Does Not Apply';
/** eBay Books category: ISBN is a required item specific there. */
export const BOOKS_CATEGORY_ID = '261186';

export interface IdentifierValues {
  brand?: unknown;
  mpn?: unknown;
  upc?: unknown;
  ean?: unknown;
  isbn?: unknown;
}

export interface IdentifierNote {
  field: EbayIdentifierField;
  code: 'BRAND_CLEAR_SKIPPED' | 'MPN_CLEAR_SKIPPED' | 'ISBN_CLEAR_SKIPPED';
  message: string;
}

export interface IdentifierMergeResult {
  /** A new product object (the input is not mutated). */
  product: Record<string, unknown>;
  /** True when `product` differs from the input, i.e. a PUT is needed. */
  changed: boolean;
  /** Requested fields that are now correct on `product` (applied, or already equal). Excludes skipped ones. */
  done: EbayIdentifierField[];
  /** Requested fields deliberately left untouched, with a reason the organizer can read. */
  skipped: IdentifierNote[];
}

export interface IdentifierMergeContext {
  /** The live listing's eBay category id, or null when unknown. */
  categoryId: string | null;
  /** Whether the category requires MPN: true / false when known from the taxonomy, null when unknown. */
  mpnRequired: boolean | null;
}

export interface AspectRequirementLike {
  name: string;
  required?: boolean;
}

/** Trim; empty or non-string becomes null. The same trim first publish applies to brand / mpn / isbn. */
export function normalizeIdentifier(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/** true / false when the taxonomy says whether the category requires MPN, null when it cannot be told. Never throws. */
export async function resolveMpnRequired(
  categoryId: string | null,
  lookup: (categoryId: string) => Promise<ReadonlyArray<AspectRequirementLike> | null>
): Promise<boolean | null> {
  if (!categoryId) return null;
  try {
    const spec = await lookup(categoryId);
    if (!spec) return null;
    const mpn = spec.find((a) => typeof a?.name === 'string' && a.name.trim().toLowerCase() === 'mpn');
    return mpn ? mpn.required === true : false;
  } catch {
    return null;
  }
}

const findKey = (obj: Record<string, unknown>, name: string): string | undefined =>
  Object.keys(obj).find((k) => k.toLowerCase() === name.toLowerCase());

const firstValue = (v: unknown): string | null => {
  if (Array.isArray(v)) return normalizeIdentifier(v[0]);
  return normalizeIdentifier(v);
};

const isPlaceholder = (v: string | null): boolean => !!v && v.toLowerCase() === MPN_PLACEHOLDER.toLowerCase();

export function mergeEbayIdentifiers(
  productIn: Record<string, unknown> | null | undefined,
  values: IdentifierValues,
  fields: ReadonlyArray<EbayIdentifierField>,
  ctx: IdentifierMergeContext
): IdentifierMergeResult {
  const before = JSON.stringify(productIn ?? {});
  const product: Record<string, unknown> = { ...(productIn ?? {}) };
  const aspectsIn = product.aspects;
  const hadAspects = !!aspectsIn && typeof aspectsIn === 'object' && !Array.isArray(aspectsIn);
  const aspects: Record<string, unknown> = hadAspects ? { ...(aspectsIn as Record<string, unknown>) } : {};

  const F = new Set<EbayIdentifierField>(fields);
  const skipped: IdentifierNote[] = [];
  const skip = (field: EbayIdentifierField, code: IdentifierNote['code'], message: string) => skipped.push({ field, code, message });
  const setAspect = (name: string, value: string) => {
    aspects[findKey(aspects, name) ?? name] = [value];
  };

  const brand = normalizeIdentifier(values.brand);
  const mpn = normalizeIdentifier(values.mpn);
  const upc = normalizeIdentifier(values.upc);
  const ean = normalizeIdentifier(values.ean);
  const isbn = normalizeIdentifier(values.isbn);

  // A Brand exists on the listing when product.brand or a Brand aspect (even 'Unbranded') is present: eBay pairs each with an MPN.
  const hasBrandNow = (): boolean => !!normalizeIdentifier(product.brand) || firstValue(aspects[findKey(aspects, 'Brand') ?? '']) !== null;
  const setMpn = (value: string) => {
    product.mpn = value;
    setAspect('MPN', value);
  };

  // brand
  let brandApplied = false;
  if (F.has('brand')) {
    if (brand) {
      product.brand = brand;
      setAspect('Brand', brand);
      brandApplied = true;
    } else {
      skip('brand', 'BRAND_CLEAR_SKIPPED', 'Brand was cleared here but left as it is on eBay, because eBay may require a brand. Change it on eBay if you need to.');
    }
  }

  // mpn (and the Brand+MPN pairing)
  if (F.has('mpn')) {
    if (mpn) {
      setMpn(mpn);
    } else if (hasBrandNow()) {
      setMpn(MPN_PLACEHOLDER); // never leave a Brand without an MPN (25002 BrandMPN)
    } else if (ctx.mpnRequired === false) {
      delete product.mpn;
      const k = findKey(aspects, 'MPN');
      if (k) delete aspects[k];
    } else {
      skip('mpn', 'MPN_CLEAR_SKIPPED', 'MPN was cleared here but left as it is on eBay, because eBay may require it for this category. Change it on eBay if you need to.');
    }
  } else if (brandApplied) {
    const productMpn = normalizeIdentifier(product.mpn);
    const aspectKey = findKey(aspects, 'MPN');
    const aspectMpn = aspectKey ? firstValue(aspects[aspectKey]) : null;
    const have = productMpn ?? aspectMpn;
    if (!have) {
      setMpn(mpn ?? MPN_PLACEHOLDER);
    } else if (isPlaceholder(have) && mpn) {
      setMpn(mpn);
    } else {
      // Keep the existing MPN but make sure both places carry it.
      if (!productMpn) product.mpn = have;
      if (!aspectMpn) setAspect('MPN', have);
    }
  }

  // upc, ean
  if (F.has('upc')) {
    if (upc) product.upc = [upc];
    else delete product.upc;
  }
  if (F.has('ean')) {
    if (ean) product.ean = [ean];
    else delete product.ean;
  }

  // isbn
  if (F.has('isbn')) {
    if (isbn) {
      product.isbn = [isbn];
      setAspect('ISBN', isbn);
    } else {
      const isbnKey = findKey(aspects, 'ISBN');
      if (ctx.categoryId === BOOKS_CATEGORY_ID || isbnKey) {
        skip('isbn', 'ISBN_CLEAR_SKIPPED', 'ISBN was cleared here but left as it is on eBay, because eBay requires an ISBN for books. Change it on eBay if you need to.');
      } else {
        delete product.isbn;
      }
    }
  }

  if (hadAspects || Object.keys(aspects).length > 0) product.aspects = aspects;

  const skippedFields = new Set<string>(skipped.map((s) => s.field));
  return {
    product,
    changed: JSON.stringify(product) !== before,
    done: fields.filter((f) => !skippedFields.has(f)),
    skipped,
  };
}
