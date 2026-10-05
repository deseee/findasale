/**
 * Decision logic for the background "[eBay Enrich]" GetItem pass that runs after a manual eBay import
 * (controllers/ebayController.ts, importEbayInventory).
 *
 * PURE: no prisma, no network. The controller parses the GetItem XML and asks planEnrichWrites what, if anything, to write.
 *
 * Principle (approved by Patrick): organizer intent wins. eBay only fills blanks on items FindA.Sale owns; held or
 * content-dirty items are never touched.
 *
 *   - ebaySyncHeldAt or ebayContentDirtyAt set: skip entirely (no GetItem call, no write).
 *   - ebayOfferId non-blank (FindA.Sale published it): fill BLANKS only (description, photoUrls, category, tags,
 *     ebayCategoryId, and condition via fillBlankCondition). A non-blank stored value is never overwritten.
 *   - no ebayOfferId (imported from eBay, cannot push edits): eBay is the source of truth, so eBay's non-empty
 *     values refresh the item (an EMPTY eBay value never blanks a stored one). Condition and grade stay blank-only.
 *   - ebayShippingClassification is recomputed only when this pass writes category and/or tags.
 */
import { classifyEbayShipping } from './ebayShippingClassifier';
import { fillBlankCondition, type EbaySourcedCondition } from './ebayConditionImport';

export interface EnrichItemState {
  description?: string | null;
  photoUrls?: string[] | null;
  category?: string | null;
  tags?: string[] | null;
  ebayCategoryId?: string | null;
  condition?: string | null;
  conditionGrade?: string | null;
  ebayOfferId?: string | null;
  ebaySyncHeldAt?: Date | null;
  ebayContentDirtyAt?: Date | null;
}

export interface EnrichParsed {
  /** Cleaned description (HTML stripped, 2000 chars max); '' when eBay gave none. */
  description?: string | null;
  photoUrls?: string[] | null;
  categoryName?: string | null;
  categoryId?: string | null;
  tags?: string[] | null;
  /** canonicalFromEbayCondition(...) result for this listing; null when not computed. */
  ebayCondition?: EbaySourcedCondition | null;
}

export type EnrichWrites = Record<string, unknown>;

const isBlankStr = (v: string | null | undefined): boolean => v == null || String(v).trim() === '';
const isBlankArr = (v: unknown[] | null | undefined): boolean => !Array.isArray(v) || v.length === 0;

/** True when FindA.Sale published this item (a non-blank eBay offer id). */
export function isPublishedByUs(item: Pick<EnrichItemState, 'ebayOfferId'>): boolean {
  return !isBlankStr(item.ebayOfferId);
}

/** True when the item is on hold or has a pending local content edit: the enrich pass must not touch it. */
export function isEnrichProtected(item: Pick<EnrichItemState, 'ebaySyncHeldAt' | 'ebayContentDirtyAt'>): boolean {
  return !!item.ebaySyncHeldAt || !!item.ebayContentDirtyAt;
}

/**
 * Whether the GetItem call is worth making. False for held/dirty items, and for items we published that have nothing
 * left to fill (every fill-blank-only field is already set), since nothing could be written.
 */
export function needsEnrichFetch(item: EnrichItemState): boolean {
  if (isEnrichProtected(item)) return false;
  if (!isPublishedByUs(item)) return true;
  return (
    isBlankStr(item.description) ||
    isBlankArr(item.photoUrls) ||
    isBlankStr(item.category) ||
    isBlankArr(item.tags) ||
    isBlankStr(item.ebayCategoryId) ||
    isBlankStr(item.condition)
  );
}

/**
 * The data to write for one item, or null when nothing should be written (held, dirty, or no change to make).
 */
export function planEnrichWrites(item: EnrichItemState, parsed: EnrichParsed): EnrichWrites | null {
  if (isEnrichProtected(item)) return null;

  const ours = isPublishedByUs(item);
  const out: EnrichWrites = {};

  const desc = parsed.description ?? '';
  if (!isBlankStr(desc) && (!ours || isBlankStr(item.description))) out.description = desc;

  const photos = parsed.photoUrls ?? [];
  if (photos.length > 0 && (!ours || isBlankArr(item.photoUrls))) out.photoUrls = photos;

  const catName = parsed.categoryName ?? null;
  if (!isBlankStr(catName) && (!ours || isBlankStr(item.category))) out.category = catName;

  const tags = parsed.tags ?? [];
  if (tags.length > 0 && (!ours || isBlankArr(item.tags))) out.tags = tags;

  const catId = parsed.categoryId ?? null;
  if (!isBlankStr(catId)) {
    if (ours ? isBlankStr(item.ebayCategoryId) : item.ebayCategoryId !== catId) out.ebayCategoryId = catId;
  }

  // Condition and grade: blank-only for every item (an item FindA.Sale published never gets a grade; see fillBlankCondition).
  if (parsed.ebayCondition && (isBlankStr(item.condition) || isBlankStr(item.conditionGrade))) {
    Object.assign(out, fillBlankCondition({ condition: item.condition, conditionGrade: item.conditionGrade, ebayOfferId: item.ebayOfferId }, parsed.ebayCondition));
  }

  // Keep ebayShippingClassification in step only when this pass actually writes category and/or tags.
  if (out.category !== undefined || out.tags !== undefined) {
    out.ebayShippingClassification = classifyEbayShipping(
      (out.category !== undefined ? out.category : item.category ?? null) as string | null,
      (out.tags !== undefined ? out.tags : item.tags ?? []) as string[],
    );
  }

  return Object.keys(out).length > 0 ? out : null;
}
