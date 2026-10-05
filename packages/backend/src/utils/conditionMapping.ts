/**
 * One condition vocabulary (item editor unification, Wave 1.0A, U4).
 *
 * Canonical Item.condition values: NEW, USED, REFURBISHED, PARTS_OR_REPAIR.
 * Canonical Item.conditionGrade values: S, A, B, C, D (S is retired for used goods and treated as A).
 *
 * This module is PURE: no imports, no prisma, no services. It is additive in Wave 1.0A: nothing calls it
 * yet. The later waves wire it into the first-push mapper (ebayController mapGradeToInventoryCondition becomes
 * a thin wrapper) and the edit-sync block in itemController (the condMap is replaced), so both paths agree.
 *
 * desiredEbayCondition is computed BEFORE ensureConditionValidForCategory runs, so the category-restricted
 * remapping (and the idToEnum map) stay untouched.
 *
 * Unified table:
 *   NEW (any grade)               -> NEW
 *   PARTS_OR_REPAIR (any grade)   -> FOR_PARTS_OR_NOT_WORKING
 *   REFURBISHED (any grade)       -> SELLER_REFURBISHED
 *   USED, or no/unknown condition -> by grade: A and B and S -> USED_VERY_GOOD, C -> USED_GOOD,
 *                                    D -> USED_ACCEPTABLE, no grade -> USED_GOOD
 */

export const CANONICAL_CONDITIONS = ['NEW', 'USED', 'REFURBISHED', 'PARTS_OR_REPAIR'] as const;
export type CanonicalCondition = (typeof CANONICAL_CONDITIONS)[number];

export const CONDITION_GRADES = ['S', 'A', 'B', 'C', 'D'] as const;
export type ConditionGrade = (typeof CONDITION_GRADES)[number];

/** eBay Inventory API condition enums this module can produce. */
export const EBAY_CONDITION_ENUMS = [
  'NEW',
  'USED_VERY_GOOD',
  'USED_GOOD',
  'USED_ACCEPTABLE',
  'SELLER_REFURBISHED',
  'FOR_PARTS_OR_NOT_WORKING',
] as const;
export type EbayConditionEnum = (typeof EBAY_CONDITION_ENUMS)[number];

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
 * Read-time normalization of a stored or submitted condition string. Case-insensitive, trims, and treats
 * spaces and hyphens as underscores ("Like New" and "like-new" both read as LIKE_NEW). Never throws.
 *
 *   NEW, NEW_*                                   -> NEW
 *   USED, GOOD, FAIR, USED_*                     -> USED
 *   LIKE_NEW, EXCELLENT                          -> USED with hintGrade A (Patrick D4 default)
 *   REFURBISHED, SELLER_REFURBISHED, *REFURBISHED -> REFURBISHED
 *   PARTS_OR_REPAIR, POOR, PARTS, PARTS_*, FOR_PARTS* -> PARTS_OR_REPAIR
 *   anything else (including grade letters, null, empty, non-strings) -> condition null, changed false
 *
 * USED_EXCELLENT and the other USED_* values map to USED without a hint (only the bare words EXCELLENT and
 * LIKE_NEW carry the hint, as specified).
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

/** Normalizes a grade string (trim, uppercase). Returns null for empty or unrecognized values. */
export function normalizeGrade(raw: unknown): ConditionGrade | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toUpperCase();
  return isConditionGrade(key) ? key : null;
}

function usedGradeToEbay(grade: ConditionGrade | null): EbayConditionEnum {
  switch (grade) {
    case 'S': // retired for used goods: treated as A
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
 * The eBay Inventory API condition enum this item should carry, per the unified table in the module header.
 * Accepts legacy condition strings (via normalizeCondition). When the grade is missing, a legacy hint grade
 * (LIKE_NEW or EXCELLENT read as grade A) is used for used goods.
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
      // USED, or null/unknown condition: decided by grade.
      const effectiveGrade = normalizeGrade(grade) ?? normalized.hintGrade ?? null;
      return usedGradeToEbay(effectiveGrade);
    }
  }
}

/** Organizer-facing grade lines sent to eBay in the condition description. S is retired and reads as A. */
const EBAY_DESCRIPTION_GRADE_LINES: Record<ConditionGrade, string> = {
  S: 'Grade A: Excellent condition',
  A: 'Grade A: Excellent condition',
  B: 'Grade B: Very good condition',
  C: 'Grade C: Good condition',
  D: 'Grade D: Acceptable condition',
};

/**
 * The grade line placed at the top of the eBay condition description. Case and surrounding whitespace are
 * ignored (via normalizeGrade), and grade S reads as A. An empty or missing grade returns undefined (no line).
 * An unrecognized non-empty grade falls back to `Grade <value>` exactly as given.
 */
export function ebayDescriptionGradeLine(grade: string | null | undefined): string | undefined {
  if (!grade) return undefined;
  const normalized = normalizeGrade(grade);
  return normalized ? EBAY_DESCRIPTION_GRADE_LINES[normalized] : `Grade ${grade}`;
}

/** Condition lines for conditions that carry no grade. Plain words, no grade text, no em dashes. */
const EBAY_DESCRIPTION_NEW_LINE = 'New';
const EBAY_DESCRIPTION_REFURBISHED_LINE = 'Refurbished';
const EBAY_DESCRIPTION_PARTS_LINE = 'For parts or repair';

/**
 * The first line of the eBay condition description for an item, per canonical condition. First publish, edit-sync
 * and the re-analyze sync all go through this so the line always matches the condition eBay is told.
 *
 *   NEW             -> "New" (no grade)
 *   REFURBISHED     -> "Refurbished" (the grade may still exist on the item, but never reads as a grade here)
 *   PARTS_OR_REPAIR -> "For parts or repair"
 *   USED, or no/unknown condition -> the grade line (S reads as A); a legacy LIKE_NEW or EXCELLENT value with no
 *                      stored grade reads as grade A, same as desiredEbayCondition; no grade -> undefined (no line)
 */
export function ebayConditionLine(
  condition: string | null | undefined,
  grade: string | null | undefined,
): string | undefined {
  const normalized = normalizeCondition(condition);
  switch (normalized.condition) {
    case 'NEW':
      return EBAY_DESCRIPTION_NEW_LINE;
    case 'REFURBISHED':
      return EBAY_DESCRIPTION_REFURBISHED_LINE;
    case 'PARTS_OR_REPAIR':
      return EBAY_DESCRIPTION_PARTS_LINE;
    default:
      return ebayDescriptionGradeLine(grade) ?? (normalized.hintGrade ? ebayDescriptionGradeLine(normalized.hintGrade) : undefined);
  }
}

/**
 * The full eBay conditionDescription text (the line from ebayConditionLine, then the organizer's condition notes,
 * a short plain-text slice of the description, and a few notable tags), capped at 1000 characters.
 *
 * Returns undefined when nothing should be sent: no condition set, or a NEW item (eBay's condition description is
 * for items that are not brand new, so a new item never carries one; a caller editing a live listing removes any
 * old text when this is undefined).
 */
export function buildEbayConditionDescription(item: {
  condition: string | null | undefined;
  conditionGrade: string | null | undefined;
  description: string | null | undefined;
  conditionNotes: string | null | undefined;
  tags: string[] | null | undefined;
}): string | undefined {
  if (!item.condition) return undefined;
  if (normalizeCondition(item.condition).condition === 'NEW') return undefined;
  const parts: string[] = [];
  const line = ebayConditionLine(item.condition, item.conditionGrade);
  if (line) parts.push(line);
  if (item.conditionNotes) parts.push(item.conditionNotes);
  if (item.description) {
    const plain = item.description.replace(/<[^>]*>/g, '').trim();
    if (plain) parts.push(plain.substring(0, 400));
  }
  const relevantTags = (item.tags ?? []).filter((t) =>
    ['vintage', 'antique', 'handmade', 'rare', 'collectible', 'signed', 'limited'].includes(t.toLowerCase()),
  );
  if (relevantTags.length) parts.push(`Notes: ${relevantTags.join(', ')}`);
  const joined = parts.join('\n\n');
  if (!joined) return undefined;
  return joined.length > 1000 ? joined.substring(0, 1000) : joined;
}
