/**
 * Condition select and grade picker for the item form, on the shared condition vocabulary (lib/conditionModel.ts):
 * exactly four conditions (New, Used, Refurbished, Parts / Repair) and a grade picker A to D. Grade S shows only when the
 * item already has it, labelled "S (legacy)". Grades apply to used goods; the picker stays visible for every condition
 * (nothing is removed) with a note when it does not affect the eBay condition.
 */
import React from 'react';
import {
  CANONICAL_CONDITIONS,
  CANONICAL_CONDITION_LABELS,
  CONDITION_GRADE_LABELS,
  gradeApplies,
} from '../../lib/conditionModel';
import type { CanonicalCondition } from '../../lib/conditionModel';
import { EDIT_GRADES } from '../../lib/itemFormCondition';
import type { EditGrade } from '../../lib/itemFormCondition';

const INPUT_CLASS =
  'w-full px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500';

export const ConditionSelect: React.FC<{
  value: CanonicalCondition | '' | string;
  onChange: (value: CanonicalCondition) => void;
}> = ({ value, onChange }) => (
  <div>
    <label htmlFor="item-condition" className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
      Condition
    </label>
    <select
      id="item-condition"
      value={value}
      onChange={(e) => onChange(e.target.value as CanonicalCondition)}
      className={INPUT_CLASS}
    >
      <option value="">Select condition</option>
      {CANONICAL_CONDITIONS.map((c) => (
        <option key={c} value={c}>
          {CANONICAL_CONDITION_LABELS[c]}
        </option>
      ))}
    </select>
  </div>
);

export const ConditionGradePicker: React.FC<{
  condition: string;
  grade: EditGrade | '' | string;
  /** The item already has the retired grade S: offer it as "S (legacy)". */
  showLegacyS: boolean;
  /** What eBay will show for this condition and grade, when the item is on eBay. */
  ebayPreview?: string;
  onChange: (grade: EditGrade) => void;
}> = ({ condition, grade, showLegacyS, ebayPreview, onChange }) => {
  const grades: EditGrade[] = showLegacyS ? [...EDIT_GRADES, 'S'] : [...EDIT_GRADES];
  return (
    <div>
      <span id="item-grade-label" className="block text-sm font-medium text-warm-700 dark:text-warm-300 mb-2">
        Condition Grade
      </span>
      <div role="radiogroup" aria-labelledby="item-grade-label" className="flex gap-2">
        {grades.map((g) => {
          const selected = grade === g;
          const title = g === 'S' ? 'S (legacy)' : `${g} - ${CONDITION_GRADE_LABELS[g as 'A' | 'B' | 'C' | 'D']}`;
          return (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={title}
              onClick={() => onChange(g)}
              title={title}
              className={`flex-1 min-h-[44px] py-1.5 text-xs font-bold rounded border transition-colors ${
                selected
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-indigo-400'
              }`}
            >
              {g === 'S' ? 'S (legacy)' : g}
            </button>
          );
        })}
      </div>
      <div className="text-xs text-gray-400 mt-0.5">
        {EDIT_GRADES.map((g) => `${g}=${CONDITION_GRADE_LABELS[g as 'A' | 'B' | 'C' | 'D']}`).join(' · ')}
      </div>
      {condition && !gradeApplies(condition) ? (
        <div className="text-xs text-gray-400 mt-0.5">The grade only changes the eBay condition for used items.</div>
      ) : null}
      {ebayPreview ? (
        <div className="text-xs text-warm-600 dark:text-warm-300 mt-0.5">On eBay this shows as: {ebayPreview}</div>
      ) : null}
    </div>
  );
};
