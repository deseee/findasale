/**
 * ADR-134 #643 (batch B5): pinned eBay category ids and condition-descriptor ids for collectible
 * trading cards. Pure data and pure functions: no env reads, no network, no database, no imports.
 *
 * WHY A NEW FILE: the static category maps (packages/shared/src/constants/ebayCategories.ts and
 * frontend/public/ebay-categories.json) use the placeholder id 15687 for many unrelated names and
 * are intentionally left alone (DECISION D6 = REDIRECT). Cards use the ids below instead.
 *
 * SOURCES (fetched 2026-10-03, ids re-read against the live pages by the B5 developer):
 *   - Descriptor and value ids:
 *     https://developer.ebay.com/api-docs/user-guides/static/mip-user-guide/mip-enum-condition-descriptor-ids-for-trading-cards.html
 *     (applies to categories 183050, 183454 and 261328; graded cards use condition LIKE_NEW (2750),
 *     ungraded cards use USED_VERY_GOOD (4000)).
 *   - conditionDescriptors request shape (name, values[], additionalInfo max 30, certification number
 *     goes in additionalInfo; graded needs Grader and Grade, ungraded needs Card Condition):
 *     https://developer.ebay.com/api-docs/sell/inventory/openapi/3/sell_inventory_v1_oas3.json
 *     (schema ConditionDescriptor).
 *
 * VERIFIED LIVE 2026-10-04 (scripts/verifyCardEbayPolicies.ts, V1 to V3, EBAY_US, tree 0, 0 call failures):
 *   - Names: 183454 "CCG Individual Cards", 183050 and 261328 "Trading Card Singles". All three are
 *     leaf categories (V1), so getItemAspectsForCategory accepts them.
 *   - Every id in the tables below exists in the live Metadata policy (V3 missingFromLive is empty for
 *     graders, grades and card condition). Ungraded Card Condition ids match exactly.
 *   - Grader availability per category was corrected to the live lists (ACE in all three, TCG in
 *     183454 and 261328).
 *   - Live ids NOT in the tables (not reachable from CARD_GRADERS today): graders AGS 2750124, DSG
 *     2750125, Majesty 2750126, GRAAD 2750127, Arena Club 2750128, AiGrading 2750129 (all three
 *     categories); grade "Sample" 2750223. The resolver re-checks every id against the live policy.
 *
 * STILL UNVERIFIED:
 *   - That the code values LIKE_NEW (graded) and USED_VERY_GOOD (ungraded) map to legacy conditions
 *     2750 and 4000 (the Metadata endpoint reports ids, not enums).
 *   - Whether eBay accepts a descriptor 27503 entry that carries additionalInfo and no values (V4,
 *     needs an organizer token, not run by this batch).
 */

export interface PinnedCardCategory {
  readonly id: string;
  /** Display name as eBay's taxonomy returned it (V1, 2026-10-04). Null only if a future id has not been read yet. */
  readonly name: string | null;
}

/** eBay card category used for collectible card game singles. Name read live (V1, 2026-10-04). */
export const CCG_SINGLES: PinnedCardCategory = { id: '183454', name: 'CCG Individual Cards' };
/** Name read live (V1, 2026-10-04). Not reached by any game today (see GAME_TO_PINNED_CATEGORY). */
export const NON_SPORT_SINGLES: PinnedCardCategory = { id: '183050', name: 'Trading Card Singles' };
/** Name read live (V1, 2026-10-04). Not reached by any game today (see GAME_TO_PINNED_CATEGORY). */
export const SPORTS_SINGLES: PinnedCardCategory = { id: '261328', name: 'Trading Card Singles' };

export const PINNED_CARD_CATEGORY_IDS: readonly string[] = [
  CCG_SINGLES.id,
  NON_SPORT_SINGLES.id,
  SPORTS_SINGLES.id,
];

export function isPinnedCardCategoryId(categoryId: string | null | undefined): boolean {
  return !!categoryId && PINNED_CARD_CATEGORY_IDS.includes(String(categoryId));
}

/**
 * ADR-137 (#660): eBay Standard Envelope item-price ceiling in US dollars. The item must sell for LESS than this, so a card
 * priced at exactly 20 is not eligible and ships tracked. A local copy on purpose (this module imports nothing); the same
 * figure is EBAY_STANDARD_ENVELOPE_MAX_PRICE_USD in services/ebayRateEstimateService.ts and STANDARD_ENVELOPE_MAX_PRICE_USD in
 * utils/ebayPolicyParser.ts, and a unit test fails if the three ever differ.
 */
export const CARD_STANDARD_ENVELOPE_MAX_PRICE_USD = 20;

/**
 * True when a price change moves a card across the Standard Envelope ceiling in either direction (one side is under the
 * ceiling and the other is not, or one side has no price). A live offer that was priced into the envelope policy must be
 * re-resolved the moment its price reaches the ceiling, instead of waiting for the daily drift sweep. Pure: no I/O.
 * Accepts the number, numeric string or Prisma Decimal shapes an item price can arrive in.
 */
export function standardEnvelopePriceCrossing(before: unknown, after: unknown): boolean {
  const toNum = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const underCeiling = (n: number | null): boolean => n !== null && n < CARD_STANDARD_ENVELOPE_MAX_PRICE_USD;
  return underCeiling(toNum(before)) !== underCeiling(toNum(after));
}

/**
 * Game (ItemCard.game) to pinned category, for productType SINGLE only. OTHER and every non-SINGLE
 * product type get no pin and keep the existing suggestEbayCategoryForTitle flow.
 */
export const GAME_TO_PINNED_CATEGORY: Readonly<Record<string, PinnedCardCategory>> = {
  MTG: CCG_SINGLES,
  POKEMON: CCG_SINGLES,
  YUGIOH: CCG_SINGLES,
  LORCANA: CCG_SINGLES,
  ONE_PIECE: CCG_SINGLES,
};

/** The card fields the eBay layer reads. Prisma ItemCard rows are assignable to this. */
export interface EbayCardInput {
  game: string;
  productType: string;
  cardName?: string | null;
  setCode?: string | null;
  setName?: string | null;
  collectorNumber?: string | null;
  language?: string | null;
  finish?: string | null;
  rarity?: string | null;
  conditionCode?: string | null;
  grader?: string | null;
  grade?: string | null;
  certNumber?: string | null;
}

/** Pinned eBay category for a card record, or null when the record gets no pin. */
export function getPinnedCardCategory(
  card: { game: string; productType: string } | null | undefined
): PinnedCardCategory | null {
  if (!card) return null;
  if (String(card.productType || '').toUpperCase() !== 'SINGLE') return null;
  return GAME_TO_PINNED_CATEGORY[String(card.game || '').toUpperCase()] ?? null;
}

// ────────────────────────────────────────────────────────────────────────────
// Condition descriptors (eBay doc above)
// ────────────────────────────────────────────────────────────────────────────

/** Condition enums eBay uses for cards (Inventory API enum, legacy condition id in comments). */
export const CARD_CONDITION_GRADED = 'LIKE_NEW'; // 2750
export const CARD_CONDITION_UNGRADED = 'USED_VERY_GOOD'; // 4000

/** Descriptor NAME ids. */
export const CARD_DESCRIPTOR = {
  GRADER: '27501',
  GRADE: '27502',
  CERT_NUMBER: '27503', // open text, sent as additionalInfo, max 30 characters
  CARD_CONDITION: '40001',
} as const;

export const CARD_CERT_MAX_LENGTH = 30;

export interface GraderEntry {
  readonly valueId: string;
  /** Pinned categories this grader is offered in, per the eBay doc. */
  readonly categories: readonly string[];
}

const ALL3 = ['183050', '183454', '261328'] as const;

/**
 * Descriptor 27501 values, keyed by the uppercase grader code stored on ItemCard.grader.
 * CSG is sports only (261328); PCA, PCG and ARK are 183454 only; TCG is 183454 and 261328; ACE is in all three
 * (live-verified 2026-10-04).
 */
export const CARD_GRADER_VALUE_IDS: Readonly<Record<string, GraderEntry>> = {
  PSA: { valueId: '275010', categories: ALL3 },
  BCCG: { valueId: '275011', categories: ALL3 },
  BVG: { valueId: '275012', categories: ALL3 },
  BGS: { valueId: '275013', categories: ALL3 },
  CSG: { valueId: '275014', categories: ['261328'] },
  CGC: { valueId: '275015', categories: ALL3 },
  SGC: { valueId: '275016', categories: ALL3 },
  KSA: { valueId: '275017', categories: ALL3 },
  GMA: { valueId: '275018', categories: ALL3 },
  HGA: { valueId: '275019', categories: ALL3 },
  ISA: { valueId: '2750110', categories: ALL3 },
  PCA: { valueId: '2750111', categories: ['183454'] },
  GSG: { valueId: '2750112', categories: ALL3 },
  PGS: { valueId: '2750113', categories: ALL3 },
  MNT: { valueId: '2750114', categories: ALL3 },
  TAG: { valueId: '2750115', categories: ALL3 },
  RARE: { valueId: '2750116', categories: ALL3 },
  RCG: { valueId: '2750117', categories: ALL3 },
  PCG: { valueId: '2750118', categories: ['183454'] },
  ACE: { valueId: '2750119', categories: ALL3 },
  CGA: { valueId: '2750120', categories: ALL3 },
  TCG: { valueId: '2750121', categories: ['183454', '261328'] },
  ARK: { valueId: '2750122', categories: ['183454'] },
  OTHER: { valueId: '2750123', categories: ALL3 },
};

/** Descriptor 27502 values (the same ids apply in all three categories), keyed by lowercase grade text. */
export const CARD_GRADE_VALUE_IDS: Readonly<Record<string, string>> = {
  '10': '275020',
  '9.5': '275021',
  '9': '275022',
  '8.5': '275023',
  '8': '275024',
  '7.5': '275025',
  '7': '275026',
  '6.5': '275027',
  '6': '275028',
  '5.5': '275029',
  '5': '2750210',
  '4.5': '2750211',
  '4': '2750212',
  '3.5': '2750213',
  '3': '2750214',
  '2.5': '2750215',
  '2': '2750216',
  '1.5': '2750217',
  '1': '2750218',
  authentic: '2750219',
  'authentic altered': '2750220',
  'authentic - trimmed': '2750221',
  'authentic - coloured': '2750222',
  'authentic - colored': '2750222', // eBay's live spelling
};

/**
 * Descriptor 40001 (ungraded Card Condition) value ids per category.
 * 183454 (CCG) uses 400010 and 400015 to 400017 and has NO Damaged value; 183050 and 261328 use
 * 400010 to 400013. DMG is deliberately absent everywhere: a damaged card is never guessed into a
 * played bucket, it resolves unresolved and goes to review.
 */
const UNGRADED_VALUE_IDS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  '183454': { NM: '400010', LP: '400015', MP: '400016', HP: '400017' },
  '183050': { NM: '400010', LP: '400011', MP: '400012', HP: '400013' },
  '261328': { NM: '400010', LP: '400011', MP: '400012', HP: '400013' },
};

export type CardIdLookup =
  | { ok: true; valueId: string }
  | { ok: false; reason: string };

/** Descriptor 27501 value id for a grader code in a pinned category. */
export function lookupCardGraderValueId(grader: string | null | undefined, categoryId: string): CardIdLookup {
  const code = String(grader ?? '').trim().toUpperCase();
  if (!code) return { ok: false, reason: 'no professional grader is recorded on the card' };
  const entry = CARD_GRADER_VALUE_IDS[code];
  if (!entry) return { ok: false, reason: `grader "${String(grader).trim()}" has no eBay grader value` };
  if (!entry.categories.includes(categoryId)) {
    return { ok: false, reason: `grader "${code}" is not offered by eBay in category ${categoryId}` };
  }
  return { ok: true, valueId: entry.valueId };
}

/** Descriptor 27502 value id for a grade string ("10", "9.5", "Authentic", ...). */
export function lookupCardGradeValueId(grade: string | null | undefined): CardIdLookup {
  const raw = String(grade ?? '').trim();
  if (!raw) return { ok: false, reason: 'no grade is recorded on the card' };
  let key = raw.toLowerCase().replace(/\s+/g, ' ');
  // "10.0" and "9.50" are the same grade as "10" and "9.5".
  if (/^\d+(\.\d+)?$/.test(key)) {
    const n = Number(key);
    if (Number.isFinite(n)) key = String(n);
  }
  const valueId = CARD_GRADE_VALUE_IDS[key];
  if (!valueId) return { ok: false, reason: `grade "${raw}" has no eBay grade value` };
  return { ok: true, valueId };
}

/** Descriptor 40001 value id for an ungraded condition code (NM, LP, MP, HP) in a pinned category. */
export function lookupCardConditionValueId(code: string | null | undefined, categoryId: string): CardIdLookup {
  const c = String(code ?? '').trim().toUpperCase();
  if (!c) return { ok: false, reason: 'no condition is recorded on the ungraded card' };
  const table = UNGRADED_VALUE_IDS[categoryId];
  if (!table) return { ok: false, reason: `category ${categoryId} is not a pinned card category` };
  const valueId = table[c];
  if (!valueId) {
    return {
      ok: false,
      reason:
        c === 'DMG'
          ? `eBay category ${categoryId} has no Damaged card condition, so a damaged card is not guessed into a played condition`
          : `condition "${String(code).trim()}" has no eBay card condition value in category ${categoryId}`,
    };
  }
  return { ok: true, valueId };
}
