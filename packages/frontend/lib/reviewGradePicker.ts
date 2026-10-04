/**
 * Review card condition grade picker (Wave 3 round 2, F3).
 *
 * The picker offers A, B, C and D, and only for used goods. Grade S is retired; it appears as 'S (legacy)' only on
 * an item that already carries S, so an old value is shown and can be kept. A condition that is NEW, REFURBISHED,
 * PARTS_OR_REPAIR, blank or unknown hides the picker. Legacy condition values (GOOD, FAIR, LIKE_NEW, ...) are read
 * through lib/conditionModel.ts, so they count as used.
 *
 * Pure module: only imports lib/conditionModel.ts.
 */

import { CONDITION_GRADES, CONDITION_GRADE_LABELS, gradeApplies, type ConditionGrade } from './conditionModel';

export interface GradePickerOption {
  value: string;
  /** Button text. */
  label: string;
  /** Tooltip. */
  title: string;
}

export interface GradePicker {
  show: boolean;
  options: GradePickerOption[];
}

export function gradePickerFor(
  condition: string | null | undefined,
  currentGrade: string | null | undefined,
): GradePicker {
  if (!gradeApplies(condition)) return { show: false, options: [] };
  const options: GradePickerOption[] = CONDITION_GRADES.map((g: ConditionGrade) => ({
    value: g,
    label: g,
    title: `${g} - ${CONDITION_GRADE_LABELS[g]}`,
  }));
  if (typeof currentGrade === 'string' && currentGrade.trim().toUpperCase() === 'S') {
    options.push({ value: 'S', label: 'S (legacy)', title: 'S (legacy), counted as A' });
  }
  return { show: true, options };
}
