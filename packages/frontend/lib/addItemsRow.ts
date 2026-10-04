/**
 * Pure helpers for the Add Items page (pages/organizer/add-items/[saleId].tsx), kept here so they can be tested
 * with node:test. No imports from React, no side effects.
 *
 * Row quick editor (condition and grade):
 * - Stored conditions are shown normalized through lib/conditionModel.ts (LIKE_NEW reads as USED with grade A,
 *   GOOD and FAIR read as USED, POOR reads as PARTS_OR_REPAIR), the same way the backend reads them.
 * - The normalized values are only a display. Each edit state remembers the values it loaded with, and the PUT
 *   body gets `condition` / `conditionGrade` only when the organizer actually changed that field, so opening a row
 *   and pressing Save never rewrites a legacy value the organizer did not touch.
 * - Grade S is retired. It is offered (labelled "S (legacy)") only for an item that already carries S.
 *
 * Failed-push badge: GET /items/drafts?saleId= returns `marketplacePushFailedCount` per item (0 when none).
 */
import {
  CONDITION_GRADE_OPTIONS,
  gradeApplies,
  normalizeGrade,
  readConditionForForm,
} from './conditionModel';

// ---------------------------------------------------------------------------
// Condition and grade in the row quick editor
// ---------------------------------------------------------------------------

export type RowConditionState = {
  /** Value shown in the Condition select ('' when none or unrecognized). */
  condition: string;
  /** Value shown in the Grade select ('' when none; 'S' only when the item already carries S). */
  conditionGrade: string;
  /** What the Condition select showed when the row was opened. Used only to detect a real change. */
  conditionInitial: string;
  /** What the Grade select showed when the row was opened. Used only to detect a real change. */
  conditionGradeInitial: string;
};

/** Stored grade for the row editor: like normalizeGrade, except a stored S stays S so the item keeps showing it. */
export function readRowGrade(rawGrade: unknown): string {
  if (typeof rawGrade === 'string' && rawGrade.trim().toUpperCase() === 'S') return 'S';
  return normalizeGrade(rawGrade) ?? '';
}

/** Initial condition state for a row, from the item as the drafts list returned it. */
export function buildRowConditionState(item: { condition?: unknown; conditionGrade?: unknown } | null | undefined): RowConditionState {
  const read = readConditionForForm(item?.condition, item?.conditionGrade);
  // A stored grade wins (and a stored S stays S); otherwise the legacy hint (LIKE_NEW reads as A) or ''.
  const grade = readRowGrade(item?.conditionGrade) || read.conditionGrade;
  return {
    condition: read.condition,
    conditionGrade: grade,
    conditionInitial: read.condition,
    conditionGradeInitial: grade,
  };
}

/**
 * Condition keys for the PUT body. Only a field the organizer changed is included, so the body keeps the same
 * keys as before and an untouched (possibly legacy) value is never re-saved.
 */
export function buildConditionPutFields(
  state: Pick<RowConditionState, 'condition' | 'conditionGrade' | 'conditionInitial' | 'conditionGradeInitial'>,
): { condition?: string; conditionGrade?: string } {
  const out: { condition?: string; conditionGrade?: string } = {};
  if (state.condition !== state.conditionInitial) out.condition = state.condition;
  if (state.conditionGrade !== state.conditionGradeInitial) out.conditionGrade = state.conditionGrade;
  return out;
}

/** The grade picker shows for used goods only (legacy values are normalized first). */
export function showRowGradePicker(condition: string | null | undefined): boolean {
  return gradeApplies(condition);
}

/** Grade options A to D, plus "S (legacy)" first when the item already has S (loaded with it or currently showing it). */
export function rowGradeOptions(initialGrade: string, currentGrade: string): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = CONDITION_GRADE_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
  if (initialGrade === 'S' || currentGrade === 'S') options.unshift({ value: 'S', label: 'S (legacy)' });
  return options;
}

// ---------------------------------------------------------------------------
// Failed eBay push badge on the collapsed row
// ---------------------------------------------------------------------------

export const EBAY_FAILED_BADGE_TEXT = 'eBay update failed';
export const EBAY_FAILED_BADGE_ARIA_LABEL = 'eBay update failed, open to review';

/** Number of failed, unseen marketplace pushes the drafts list reported for the item (0 when absent or invalid). */
export function failedPushCount(item: { marketplacePushFailedCount?: unknown } | null | undefined): number {
  const n = item?.marketplacePushFailedCount;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** True when the collapsed row should show the amber "eBay update failed" badge. */
export function showEbayFailedBadge(item: { marketplacePushFailedCount?: unknown } | null | undefined): boolean {
  return failedPushCount(item) > 0;
}
