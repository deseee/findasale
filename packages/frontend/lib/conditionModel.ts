/**
 * One condition vocabulary for the item editor (item editor unification, U4), frontend side.
 *
 * LOCAL MIRROR of packages/backend/src/utils/conditionMapping.ts. The frontend must not import the
 * shared package or reach into the backend, so the rules are copied here and a parity test
 * (lib/__tests__/conditionModel.test.ts) compares this file against the backend module whenever the
 * backend source is present. If the backend table changes, change this file and the test table too.
 *
 * Canonical Item.condition: NEW, USED, REFURBISHED, PARTS_OR_REPAIR.
 * Grade: A, B, C, D, only meaningful for USED. Grade S is retired for used goods: old rows that still
 * carry S are read as A. The two lowest-risk differences from the backend module are deliberate and
 * covered by tests: normalizeGrade here folds S into A, and the selectable grade list has no S.
 *
 * Pure module: no imports, no React, no side effects. Nothing imports it yet.
 *
 * Replaces, in later steps (these are what the pages use today):
 * - Add page (add-items/[saleId].tsx, about lines 382-396): an 8-value CONDITIONS list and a local
 *   CONDITION_LABELS (NEW, LIKE_NEW, USED, GOOD, FAIR, POOR, REFURBISHED, PARTS_OR_REPAIR).
 * - Edit page (edit-item/[id].tsx, about lines 395 and 1027): inline legacy maps that send LIKE_NEW and
 *   EXCELLENT to NEW and default unknown values to USED.
 * - Review page (add-items/[saleId]/review.tsx, about lines 671 and 809): the same inline legacy maps,
 *   with unknown values left blank.
 * lib/itemConstants.ts keeps CONDITIONS and CONDITION_LABELS (same four values and labels as below) and
 * its CONDITION_MAP for display of old data. This module adds the grade model, read-time normalization
 * and the eBay preview on top.
 */

export const CANONICAL_CONDITIONS = ['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR'] as const;
export type CanonicalCondition = (typeof CANONICAL_CONDITIONS)[number];

/** User-facing labels. Same strings as CONDITION_LABELS in lib/itemConstants.ts. */
export const CANONICAL_CONDITION_LABELS: Record<CanonicalCondition, string> = {
  NEW: 'New',
  USED: 'Used',
  REFURBISHED: 'Refurbished',
  PARTS_OR_REPAIR: 'Parts / Repair',
};

/** Grades an organizer can pick (used goods only). */
export const CONDITION_GRADES = ['A', 'B', 'C', 'D'] as const;
export type ConditionGrade = (typeof CONDITION_GRADES)[number];

/**
 * Approved organizer-facing grade wording: A is excellent, B is very good, C is good, D is acceptable. This is only the
 * description shown to organizers. What eBay receives is a separate table (EBAY_CONDITION_LABELS below): A and B both
 * map to Very Good (eBay's own name for 4000).
 */
export const CONDITION_GRADE_LABELS: Record<ConditionGrade, string> = {
  A: 'Excellent',
  B: 'Very good',
  C: 'Good',
  D: 'Acceptable',
};

/** Picker options: the letter and its wording, for example 'A - Excellent'. */
export const CONDITION_GRADE_OPTIONS: ReadonlyArray<{ value: ConditionGrade; label: string }> =
  CONDITION_GRADES.map((g) => ({ value: g, label: `${g} - ${CONDITION_GRADE_LABELS[g]}` }));

/** eBay Inventory API condition enums the model can produce. Same list as the backend module. */
export const EBAY_CONDITION_ENUMS = [
  'NEW',
  'USED_VERY_GOOD',
  'USED_GOOD',
  'USED_ACCEPTABLE',
  'SELLER_REFURBISHED',
  'FOR_PARTS_OR_NOT_WORKING',
] as const;
export type EbayConditionEnum = (typeof EBAY_CONDITION_ENUMS)[number];

/** What eBay shows the buyer for each enum: eBay's own condition names (4000 Very Good, 5000 Good, 6000 Acceptable). Mirrors getConditionLabel in the backend. */
export const EBAY_CONDITION_LABELS: Record<EbayConditionEnum, string> = {
  NEW: 'New',
  USED_VERY_GOOD: 'Very Good',
  USED_GOOD: 'Good',
  USED_ACCEPTABLE: 'Acceptable',
  SELLER_REFURBISHED: 'Seller refurbished',
  FOR_PARTS_OR_NOT_WORKING: 'For parts or not working',
};

export type NormalizedCondition = {
  /** Canonical condition, or null when the input is empty or not recognized. */
  condition: CanonicalCondition | null;
  /** Grade suggested by a legacy value (EXCELLENT, LIKE_NEW). Only a hint: never overrides a stored grade. */
  hintGrade?: ConditionGrade;
  /** True when a recognized input was rewritten (different casing, whitespace, or a legacy value). */
  changed: boolean;
};

function isCanonicalCondition(value: string): value is CanonicalCondition {
  return (CANONICAL_CONDITIONS as readonly string[]).includes(value);
}

function isConditionGrade(value: string): value is ConditionGrade {
  return (CONDITION_GRADES as readonly string[]).includes(value);
}

/**
 * Read-time normalization of a stored condition string. Same rules as the backend. Case-insensitive,
 * trims, and treats spaces and hyphens as underscores ("Like New" and "like-new" both read as LIKE_NEW).
 * Never throws.
 *
 *   NEW, NEW_*                                        -> NEW
 *   USED, GOOD, FAIR, USED_*                          -> USED
 *   LIKE_NEW, EXCELLENT                               -> USED with hintGrade A
 *   REFURBISHED, SELLER_REFURBISHED, *_REFURBISHED    -> REFURBISHED
 *   PARTS_OR_REPAIR, POOR, PARTS, PARTS_*, FOR_PARTS* -> PARTS_OR_REPAIR
 *   anything else (grade letters, null, empty, non-strings) -> condition null, changed false
 */
export function normalizeCondition(raw: unknown): NormalizedCondition {
  if (typeof raw !== 'string') return { condition: null, changed: false };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { condition: null, changed: false };

  const key = trimmed.toUpperCase().replace(/[\s-]+/g, '_');

  let condition: CanonicalCondition | null = null;
  let hintGrade: ConditionGrade | undefined;

  if (isCanonicalCondition(key)) {
    condition = key;
  } else if (key === 'LIKE_NEW' || key === 'EXCELLENT') {
    condition = 'USED';
    hintGrade = 'A';
  } else if (key === 'GOOD' || key === 'FAIR' || key.startsWith('USED_')) {
    condition = 'USED';
  } else if (key.startsWith('NEW_')) {
    condition = 'NEW';
  } else if (key === 'REFURBISHED' || key.endsWith('_REFURBISHED') || key.startsWith('REFURBISHED_')) {
    condition = 'REFURBISHED';
  } else if (key === 'POOR' || key === 'PARTS' || key.startsWith('PARTS_') || key.startsWith('FOR_PARTS')) {
    condition = 'PARTS_OR_REPAIR';
  }

  if (condition === null) return { condition: null, changed: false };

  const result: NormalizedCondition = { condition, changed: raw !== condition };
  if (hintGrade !== undefined) result.hintGrade = hintGrade;
  return result;
}

/**
 * Read-time grade normalization: trim, uppercase, and fold the retired S into A. Returns null for empty
 * or unrecognized values. (The backend keeps S as S but maps it to the same eBay result as A.)
 */
export function normalizeGrade(raw: unknown): ConditionGrade | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toUpperCase();
  if (key === 'S') return 'A';
  return isConditionGrade(key) ? key : null;
}

/**
 * Whether the grade picker applies. True only for used goods. NEW, REFURBISHED and PARTS_OR_REPAIR
 * ignore the grade when listing on eBay (the backend mapping never reads it for those), so the picker is
 * hidden for them. Legacy values are normalized first (LIKE_NEW reads as USED). Empty or unknown is false.
 */
export function gradeApplies(condition: string | null | undefined): boolean {
  return normalizeCondition(condition).condition === 'USED';
}

function usedGradeToEbay(grade: ConditionGrade | null): EbayConditionEnum {
  switch (grade) {
    case 'A':
    case 'B':
      return 'USED_VERY_GOOD';
    case 'C':
      return 'USED_GOOD';
    case 'D':
      return 'USED_ACCEPTABLE';
    default:
      return 'USED_GOOD';
  }
}

/**
 * Mirror of the backend desiredEbayCondition: the eBay Inventory API enum this item will carry.
 *   NEW (any grade) -> NEW; PARTS_OR_REPAIR -> FOR_PARTS_OR_NOT_WORKING; REFURBISHED -> SELLER_REFURBISHED;
 *   USED or no/unknown condition -> A and B USED_VERY_GOOD, C USED_GOOD, D USED_ACCEPTABLE, none USED_GOOD.
 * A legacy hint grade (LIKE_NEW, EXCELLENT read as A) is used only when no grade is stored.
 */
export function desiredEbayCondition(
  condition: string | null | undefined,
  grade: string | null | undefined,
): EbayConditionEnum {
  const normalized = normalizeCondition(condition);

  switch (normalized.condition) {
    case 'NEW':
      return 'NEW';
    case 'PARTS_OR_REPAIR':
      return 'FOR_PARTS_OR_NOT_WORKING';
    case 'REFURBISHED':
      return 'SELLER_REFURBISHED';
    default: {
      const effectiveGrade = normalizeGrade(grade) ?? normalized.hintGrade ?? null;
      return usedGradeToEbay(effectiveGrade);
    }
  }
}

/**
 * Human label of what eBay will show for this condition and grade, for the save-impact line.
 *   NEW -> New, PARTS_OR_REPAIR -> For parts or not working, REFURBISHED -> Seller refurbished,
 *   USED A or B -> Very Good, C -> Good, D -> Acceptable, no grade -> Good.
 */
export function eBayConditionPreview(
  condition: string | null | undefined,
  grade: string | null | undefined,
): string {
  return EBAY_CONDITION_LABELS[desiredEbayCondition(condition, grade)];
}

/**
 * Convenience for loading stored values into form state. Returns the canonical condition ('' when blank
 * or unrecognized, so the caller decides the default) and the grade ('' when none). A stored grade is
 * kept even on non-used goods (hide the picker with gradeApplies instead) so loading and re-saving never
 * silently clears a grade the database holds. A stored grade wins over a legacy hint grade, the hint
 * applies to used goods only, and S reads as A.
 */
export function readConditionForForm(
  rawCondition: unknown,
  rawGrade: unknown,
): { condition: CanonicalCondition | ''; conditionGrade: ConditionGrade | '' } {
  const n = normalizeCondition(rawCondition);
  const condition = n.condition ?? '';
  const stored = normalizeGrade(rawGrade);
  const hint = condition === 'USED' ? n.hintGrade : undefined;
  return { condition, conditionGrade: stored ?? hint ?? '' };
}
