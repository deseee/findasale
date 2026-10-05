/**
 * Shopper-facing condition wording, read through the one condition vocabulary (lib/conditionModel.ts).
 *
 * Shoppers see four conditions: New, Used, Refurbished, Parts / Repair. Used goods can also show their grade in
 * plain words (A Excellent, B Very good, C Good, D Acceptable). Stored values are never shown raw: legacy rows
 * (LIKE_NEW, EXCELLENT, GOOD, FAIR, POOR, grade S) go through normalizeCondition / normalizeGrade, so an old row
 * reads exactly like a new one (legacy LIKE_NEW and EXCELLENT read as Used with grade A).
 *
 * The grade words are defined here, not read from conditionModel's CONDITION_GRADE_LABELS, so shopper wording
 * does not move when the organizer-side labels are edited.
 *
 * Pure module: no React, no side effects.
 */
import {
  CANONICAL_CONDITIONS,
  CANONICAL_CONDITION_LABELS,
  CanonicalCondition,
  ConditionGrade,
  normalizeCondition,
  normalizeGrade,
} from './conditionModel';

/** Plain-words grade names a shopper sees. */
export const SHOPPER_GRADE_WORDS: Record<ConditionGrade, string> = {
  A: 'Excellent',
  B: 'Very good',
  C: 'Good',
  D: 'Acceptable',
};

/** What each grade means to a shopper (tooltips). */
export const SHOPPER_GRADE_DESCRIPTIONS: Record<ConditionGrade, string> = {
  A: 'Excellent (grade A). Light cosmetic wear only. Fully functional and looks great.',
  B: 'Very good (grade B). Minor signs of use. Fully functional.',
  C: 'Good (grade C). Visible wear or cosmetic flaws. Fully functional.',
  D: 'Acceptable (grade D). Heavy wear or flaws that may affect use. Inspect before you buy.',
};

/** What each condition means to a shopper (tooltips). */
export const SHOPPER_CONDITION_DESCRIPTIONS: Record<CanonicalCondition, string> = {
  NEW: 'New. Unused and in original condition.',
  USED: 'Used. Previously owned. The grade and photos show the wear.',
  REFURBISHED: 'Refurbished. Restored to working condition by the seller.',
  PARTS_OR_REPAIR: 'Parts / Repair. May not work as intended. Sold as is for parts or repair.',
};

/** The four filter choices a shopper is offered. Values are the canonical stored values (also the query param). */
export const SHOPPER_CONDITION_FILTER_OPTIONS: ReadonlyArray<{ value: CanonicalCondition; label: string }> =
  CANONICAL_CONDITIONS.map((value) => ({ value, label: CANONICAL_CONDITION_LABELS[value] }));

/**
 * Words the old shopper filters offered that the condition model does not read as a condition. They were used-goods
 * wording, so a bookmarked link carrying one keeps meaning Used. Mirrors the backend filter (utils/conditionFilter.ts).
 */
const LEGACY_FILTER_ALIASES: Record<string, CanonicalCondition> = {
  VERY_GOOD: 'USED',
  MINT: 'USED',
  ACCEPTABLE: 'USED',
};

/**
 * The canonical condition a filter value (from the URL, a saved search, or the select) stands for, or '' when it is
 * empty or not recognized. Old bookmarked values resolve: excellent, good, fair, "Very Good" become USED,
 * poor becomes PARTS_OR_REPAIR. The backend applies the same rules, so links keep working even if this is skipped.
 */
export function normalizeConditionFilterValue(raw: unknown): CanonicalCondition | '' {
  if (typeof raw !== 'string') return '';
  const normalized = normalizeCondition(raw).condition;
  if (normalized) return normalized;
  const key = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return LEGACY_FILTER_ALIASES[key] ?? '';
}

/** Label for a filter value in saved-search summaries and chips: the canonical label, else what was saved. */
export function conditionFilterLabel(raw: unknown): string {
  const canonical = normalizeConditionFilterValue(raw);
  if (canonical) return CANONICAL_CONDITION_LABELS[canonical];
  return typeof raw === 'string' ? raw.trim() : '';
}

export type ShopperCondition = {
  /** Canonical condition, or null when the stored value is not recognized. */
  condition: CanonicalCondition | null;
  /** "New", "Used", "Refurbished", "Parts / Repair"; an unrecognized value reads as sentence-case words. */
  label: string;
  /** Grade letter, only for used goods. A legacy LIKE_NEW or EXCELLENT with no stored grade reads as A; S reads as A. */
  grade: ConditionGrade | null;
  /** "Excellent", "Very good", "Good", "Acceptable" for the grade above, else null. */
  gradeWord: string | null;
  /** label, plus " - " and the grade word when there is one: "Used - Excellent". */
  text: string;
  /** One-sentence meaning for tooltips. */
  description: string | null;
};

function plainWords(raw: string): string {
  const words = raw.trim().replace(/[_\s]+/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * How a shopper sees an item's condition. Returns null when there is no condition to show.
 * The grade is shown only for used goods; a stored grade wins over the hint a legacy value carries.
 */
export function describeShopperCondition(rawCondition: unknown, rawGrade?: unknown): ShopperCondition | null {
  if (typeof rawCondition !== 'string' || rawCondition.trim().length === 0) return null;
  const normalized = normalizeCondition(rawCondition);

  if (normalized.condition === null) {
    const label = plainWords(rawCondition);
    return { condition: null, label, grade: null, gradeWord: null, text: label, description: null };
  }

  const condition = normalized.condition;
  const label = CANONICAL_CONDITION_LABELS[condition];
  const grade = condition === 'USED' ? normalizeGrade(rawGrade) ?? normalized.hintGrade ?? null : null;
  const gradeWord = grade ? SHOPPER_GRADE_WORDS[grade] : null;
  const description = grade
    ? `${SHOPPER_CONDITION_DESCRIPTIONS[condition]} ${SHOPPER_GRADE_DESCRIPTIONS[grade]}`
    : SHOPPER_CONDITION_DESCRIPTIONS[condition];
  return { condition, label, grade, gradeWord, text: gradeWord ? `${label} - ${gradeWord}` : label, description };
}

/** Plain text for a condition, for places that cannot render a badge (OG image text, alt text). '' when none. */
export function shopperConditionText(rawCondition: unknown, rawGrade?: unknown): string {
  return describeShopperCondition(rawCondition, rawGrade)?.text ?? '';
}
