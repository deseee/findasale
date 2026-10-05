/**
 * What an eBay condition means in FindA.Sale terms, for inbound data (import, background enrich, pull-sync).
 *
 * PURE: no prisma, no network. Reads only conditionMapping types and the pinned card category ids.
 *
 * The rule: a grade is stored ONLY when eBay itself supplies a quality level.
 *
 *   id    eBay name                         condition        grade
 *   1000  New                               NEW              null
 *   1500  New other                         NEW              null
 *   1750  New with defects                  NEW              null
 *   2000  Certified Refurbished             REFURBISHED      null
 *   2010  Excellent - Refurbished           REFURBISHED      null
 *   2020  Very Good - Refurbished           REFURBISHED      null
 *   2030  Good - Refurbished                REFURBISHED      null
 *   2500  Seller refurbished                REFURBISHED      null
 *   2750  Like New (graded in cards/coins)  USED             null (category dependent, so no level is claimed)
 *   2990  Pre-owned - Excellent (apparel)   USED             A
 *   3000  Used                              USED             null (carries no level)
 *   3010  Pre-owned - Fair (apparel)        USED             C
 *   4000  Very Good                         USED             B (null in card and coin categories)
 *   5000  Good                              USED             C
 *   6000  Acceptable                        USED             D
 *   7000  For parts or not working          PARTS_OR_REPAIR  null
 *   missing, empty or unknown               null             null
 *
 * The grade is never S. Grade is null whenever condition is not USED. Cards and coins keep their own condition
 * scale (ItemCard), so a card or coin category hint forces grade null for 4000 and 2750.
 *
 * Both eBay vocabularies are accepted: numeric ids (as a number or a numeric string, from the Trading API and the
 * Metadata API) and Inventory API enum names (case-insensitive, spaces and hyphens read as underscores).
 * Never throws.
 */
import { CanonicalCondition, normalizeCondition } from './conditionMapping';
import { isPinnedCardCategoryId } from '../config/cardEbayCategories';

export type ImportedGrade = 'A' | 'B' | 'C' | 'D';

export type EbaySourcedCondition = {
  /** NEW | USED | REFURBISHED | PARTS_OR_REPAIR, or null when eBay gave nothing usable. */
  condition: CanonicalCondition | null;
  /** Only when eBay supplied a quality level. Never S. Null whenever condition is not USED. */
  grade: ImportedGrade | null;
  ebaySourced: true;
  /** Normalized numeric eBay id (for example '3000'), or null when unknown. */
  conditionId: string | null;
  /** True only when the id carried a quality level and a grade is returned. */
  levelKnown: boolean;
};

export type EbayConditionImportOpts = {
  /** eBay category id of the listing, when known. A pinned card category forces grade null for 2750 and 4000. */
  categoryId?: string | null;
  /** eBay category name, when known. A card or coin name forces grade null for 2750 and 4000. */
  categoryName?: string | null;
  /** Caller already knows the category is a card or coin category. */
  isCardOrCoinCategory?: boolean;
};

type Row = { condition: CanonicalCondition; grade: ImportedGrade | null };

const BY_ID: Readonly<Record<string, Row>> = {
  '1000': { condition: 'NEW', grade: null },
  '1500': { condition: 'NEW', grade: null },
  '1750': { condition: 'NEW', grade: null },
  '2000': { condition: 'REFURBISHED', grade: null },
  '2010': { condition: 'REFURBISHED', grade: null },
  '2020': { condition: 'REFURBISHED', grade: null },
  '2030': { condition: 'REFURBISHED', grade: null },
  '2500': { condition: 'REFURBISHED', grade: null },
  '2750': { condition: 'USED', grade: null },
  '2990': { condition: 'USED', grade: 'A' },
  '3000': { condition: 'USED', grade: null },
  '3010': { condition: 'USED', grade: 'C' },
  '4000': { condition: 'USED', grade: 'B' },
  '5000': { condition: 'USED', grade: 'C' },
  '6000': { condition: 'USED', grade: 'D' },
  '7000': { condition: 'PARTS_OR_REPAIR', grade: null },
};

/** Inventory API enum name to numeric id (eBay's condition-id-values table). */
const ENUM_TO_ID: Readonly<Record<string, string>> = {
  NEW: '1000',
  NEW_OTHER: '1500',
  NEW_WITH_DEFECTS: '1750',
  CERTIFIED_REFURBISHED: '2000',
  EXCELLENT_REFURBISHED: '2010',
  VERY_GOOD_REFURBISHED: '2020',
  GOOD_REFURBISHED: '2030',
  SELLER_REFURBISHED: '2500',
  LIKE_NEW: '2750',
  PRE_OWNED_EXCELLENT: '2990',
  USED_EXCELLENT: '3000',
  PRE_OWNED_FAIR: '3010',
  USED_VERY_GOOD: '4000',
  USED_GOOD: '5000',
  USED_ACCEPTABLE: '6000',
  FOR_PARTS_OR_NOT_WORKING: '7000',
};

const CARD_OR_COIN_NAME = /\b(coins?|paper money|trading cards?|ccg|collectible card)\b/i;
const COIN_CATEGORY_IDS: readonly string[] = ['11116', '11981'];

function isCardOrCoin(opts: EbayConditionImportOpts | undefined): boolean {
  if (!opts) return false;
  if (opts.isCardOrCoinCategory === true) return true;
  const id = typeof opts.categoryId === 'string' ? opts.categoryId.trim() : '';
  if (id && (isPinnedCardCategoryId(id) || COIN_CATEGORY_IDS.includes(id))) return true;
  const name = typeof opts.categoryName === 'string' ? opts.categoryName : '';
  return name.length > 0 && CARD_OR_COIN_NAME.test(name);
}

/** The numeric eBay id for a numeric id, numeric string or Inventory enum name, or null. Never throws. */
export function ebayConditionIdOf(input: unknown): string | null {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || !Number.isInteger(input)) return null;
    const id = String(input);
    return BY_ID[id] ? id : null;
  }
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (/^\d+$/.test(trimmed)) {
    const id = String(parseInt(trimmed, 10));
    return BY_ID[id] ? id : null;
  }
  const key = trimmed.toUpperCase().replace(/[\s-]+/g, '_');
  return ENUM_TO_ID[key] ?? null;
}

export function canonicalFromEbayCondition(
  conditionIdOrEnum: string | number | null | undefined,
  opts?: EbayConditionImportOpts,
): EbaySourcedCondition {
  try {
    const id = ebayConditionIdOf(conditionIdOrEnum);
    if (!id) return { condition: null, grade: null, ebaySourced: true, conditionId: null, levelKnown: false };
    const row = BY_ID[id];
    let grade: ImportedGrade | null = row.condition === 'USED' ? row.grade : null;
    if (grade && id === '4000' && isCardOrCoin(opts)) grade = null;
    return { condition: row.condition, grade, ebaySourced: true, conditionId: id, levelKnown: grade !== null };
  } catch {
    return { condition: null, grade: null, ebaySourced: true, conditionId: null, levelKnown: false };
  }
}

/**
 * Blank-only fill for an Item. Given what is stored now and what eBay says, returns ONLY the fields to write:
 * condition when the stored condition is blank, grade when the stored grade is blank AND eBay supplied a level.
 * A non-blank stored condition or grade is never overwritten. When the condition is already stored and differs from
 * the one eBay implies, the level is not applied either (a grade for a different family would be wrong).
 *
 * Items FindA.Sale published itself (a non-blank ebayOfferId) never get a grade filled: a blank grade there means the
 * organizer chose none, and what eBay holds is only our own USED_GOOD default echoed back, not a level eBay supplied.
 * Their blank condition may still be filled. Callers must pass ebayOfferId (select it) so this rule cannot be skipped.
 */
export function fillBlankCondition(
  stored: { condition?: string | null; conditionGrade?: string | null; ebayOfferId: string | null | undefined },
  ebay: EbaySourcedCondition,
): { condition?: CanonicalCondition; conditionGrade?: ImportedGrade } {
  const out: { condition?: CanonicalCondition; conditionGrade?: ImportedGrade } = {};
  const condBlank = !stored.condition || String(stored.condition).trim() === '';
  const gradeBlank = !stored.conditionGrade || String(stored.conditionGrade).trim() === '';
  const publishedByUs = typeof stored.ebayOfferId === 'string' ? stored.ebayOfferId.trim() !== '' : stored.ebayOfferId != null;
  if (condBlank && ebay.condition) out.condition = ebay.condition;
  const effectiveCondition = condBlank ? ebay.condition : normalizeCondition(stored.condition).condition;
  if (gradeBlank && !publishedByUs && ebay.grade && effectiveCondition === 'USED') out.conditionGrade = ebay.grade;
  return out;
}
