/**
 * Condition and grade handling for the shared item form (Edit page and the slide-up sheet).
 *
 * Pure module. Builds on lib/conditionModel.ts (the frontend mirror of the backend vocabulary) and adds the three
 * things the form needs that the model does not:
 *   1. readEditCondition: what to SHOW for a stored condition and grade. A legacy value is normalized for display with the
 *      same rules as the backend (LIKE_NEW and EXCELLENT read as USED with grade A). Unlike conditionModel's
 *      readConditionForForm, a stored grade S is kept as S (the form shows it as "S (legacy)" only when the item already
 *      has it) instead of being folded into A.
 *   2. untouchedConditionValue / untouchedGradeValue: what to SEND when the organizer has not touched condition or grade
 *      on this form. The payload then carries the stored value (canonical casing for canonical values, the raw stored
 *      value for legacy ones), so a plain save of an unrelated field never rewrites condition or grade.
 */
import { CANONICAL_CONDITIONS, normalizeCondition } from './conditionModel';
import type { CanonicalCondition } from './conditionModel';

export type EditGrade = 'A' | 'B' | 'C' | 'D' | 'S';

export const EDIT_GRADES: ReadonlyArray<EditGrade> = ['A', 'B', 'C', 'D'];

export interface EditConditionView {
  /** Canonical condition, or '' when blank or not recognized. */
  condition: CanonicalCondition | '';
  /** Grade to show selected: a stored grade wins, else the legacy hint (used goods only), else ''. */
  conditionGrade: EditGrade | '';
  /** True when the stored grade is the retired S (the picker then offers "S (legacy)"). */
  legacyS: boolean;
}

function storedGrade(raw: unknown): EditGrade | '' {
  if (typeof raw !== 'string') return '';
  const key = raw.trim().toUpperCase();
  return key === 'A' || key === 'B' || key === 'C' || key === 'D' || key === 'S' ? key : '';
}

export function readEditCondition(rawCondition: unknown, rawGrade: unknown): EditConditionView {
  const n = normalizeCondition(rawCondition);
  const condition = n.condition ?? '';
  const stored = storedGrade(rawGrade);
  const hint = condition === 'USED' ? n.hintGrade : undefined;
  return { condition, conditionGrade: stored || hint || '', legacyS: stored === 'S' };
}

/**
 * The condition string to send when condition and grade were not touched. Canonical values are sent in canonical
 * form (the same thing the page always sent for them); legacy and unrecognized values are sent exactly as stored
 * (the server coerces them), and a missing value is ''.
 */
export function untouchedConditionValue(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') return '';
  const key = raw.toUpperCase().trim().replace(/\s+/g, '_');
  return (CANONICAL_CONDITIONS as readonly string[]).includes(key) ? key : raw;
}

/** The grade string to send when untouched: exactly as stored, or ''. */
export function untouchedGradeValue(raw: unknown): string {
  return typeof raw === 'string' ? raw : '';
}
