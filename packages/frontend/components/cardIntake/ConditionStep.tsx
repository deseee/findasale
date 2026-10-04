/**
 * ConditionStep (ADR-134 #642, batch B8): step 2, condition mapping.
 *
 * One line per DISTINCT condition word in the file (usually 3 to 7), never one per row: the word as written, how many rows
 * use it, the backend's suggestion, and the seller's choice. A line the backend matched exactly (EXACT) starts chosen. A line
 * marked REVIEW (the same word means different grades in different apps) starts with NO choice and blocks Import until the seller
 * picks a condition or "Leave blank". The chosen table is sent as conditionMapping on confirm.
 *
 * Phones: each line is a card. From 768 px: one grid row per line with the same fields.
 */
import React from 'react';
import type { ConditionChoices, ConditionLine, PreviewData, VocabOption } from '../../lib/cardIntake';
import { BLANK_CHOICE, choiceFor, optionLabel, pendingConditionLines, setConditionChoice, applyAllSuggestions } from '../../lib/cardIntake';
import { INTAKE_COPY } from '../../lib/cardIntakeCopy';
import { cardCls, headingCls, inputCls, mutedCls, noticeInfoCls, noticeOkCls, noticeWarnCls, primaryBtn, secondaryBtn } from './ui';

export interface ConditionStepProps {
  preview: PreviewData;
  conditions: readonly VocabOption[];
  choices: ConditionChoices;
  defaultCondition: string;
  onChoices: (next: ConditionChoices) => void;
  onBack: () => void;
  onNext: () => void;
}

const ConditionStep: React.FC<ConditionStepProps> = ({ preview, conditions, choices, defaultCondition, onChoices, onBack, onNext }) => {
  const lines = preview.conditionMapping;
  const pending = pendingConditionLines(lines, choices);
  const canUseAll = lines.some((l) => l.confidence === 'REVIEW' && l.proposed && choiceFor(choices, l) === undefined);

  const renderLine = (line: ConditionLine, index: number) => {
    const current = choiceFor(choices, line);
    const needsCheck = line.confidence === 'REVIEW';
    const selectId = `ci-cond-${index}`;
    const suggestion = line.proposed ? line.proposedLabel || optionLabel(conditions, line.proposed) : null;
    return (
      <li key={line.sourceValue + ':' + index} className="min-w-0 rounded-lg border border-warm-200 p-3 dark:border-gray-700 md:grid md:grid-cols-[minmax(0,2fr)_5rem_minmax(0,2fr)_minmax(0,3fr)] md:items-center md:gap-4">
        <div className="min-w-0">
          <p className="break-words text-base font-semibold text-warm-900 dark:text-warm-100">{line.sourceValue}</p>
          <p className="mt-0.5 text-sm md:hidden">
            <span className={mutedCls}>{INTAKE_COPY.conditionsColRows}: </span>
            <span className="text-warm-800 dark:text-warm-200">{INTAKE_COPY.conditionsRowsCount(line.rowCount)}</span>
          </p>
          <p className="mt-1">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                needsCheck ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100' : 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100'
              }`}
            >
              {needsCheck ? INTAKE_COPY.conditionsNeedsCheck : INTAKE_COPY.conditionsMatched}
            </span>
          </p>
        </div>
        <p className="mt-2 hidden text-sm tabular-nums text-warm-800 dark:text-warm-200 md:mt-0 md:block">{INTAKE_COPY.conditionsRowsCount(line.rowCount)}</p>
        <p className="mt-2 text-sm text-warm-700 dark:text-warm-300 md:mt-0">
          <span className={`md:hidden ${mutedCls}`}>{INTAKE_COPY.conditionsColSuggested}: </span>
          {suggestion || INTAKE_COPY.conditionsNoSuggestion}
        </p>
        <div className="mt-3 min-w-0 md:mt-0">
          <label htmlFor={selectId} className="sr-only">
            {INTAKE_COPY.conditionsChoiceFor(line.sourceValue)}
          </label>
          <select
            id={selectId}
            className={`${inputCls} ${current === undefined ? 'border-amber-500' : ''}`}
            value={current === undefined ? '' : current}
            onChange={(e) => onChoices(setConditionChoice(choices, line, e.target.value))}
          >
            <option value="">
              {INTAKE_COPY.conditionsChoose}
            </option>
            {conditions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
            <option value={BLANK_CHOICE}>{INTAKE_COPY.conditionsBlank}</option>
          </select>
          {line.proposed && current === undefined ? (
            <button type="button" onClick={() => onChoices(setConditionChoice(choices, line, line.proposed as string))} className={`mt-2 ${secondaryBtn}`}>
              {INTAKE_COPY.conditionsUseSuggestion(suggestion || line.proposed)}
            </button>
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <section aria-labelledby="ci-cond-heading" className={cardCls}>
        <h3 id="ci-cond-heading" className={headingCls}>
          {INTAKE_COPY.conditionsHeading}
        </h3>
        <p className={`mt-1 ${mutedCls}`}>{INTAKE_COPY.conditionsIntro}</p>

        {lines.length === 0 ? (
          <div className={`mt-4 ${noticeInfoCls}`}>
            <p>{INTAKE_COPY.conditionsNone}</p>
            {defaultCondition ? <p className="mt-1">{INTAKE_COPY.conditionsNoneDefault(optionLabel(conditions, defaultCondition))}</p> : null}
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p aria-live="polite" className={`min-w-0 ${pending.length > 0 ? noticeWarnCls : noticeOkCls}`}>
                {pending.length > 0 ? INTAKE_COPY.conditionsPending(pending.length) : INTAKE_COPY.conditionsAllSet}
              </p>
              <button type="button" disabled={!canUseAll} onClick={() => onChoices(applyAllSuggestions(lines, choices))} className={secondaryBtn}>
                {INTAKE_COPY.conditionsUseAll}
              </button>
            </div>

            {/* Column titles, desktop only */}
            <div aria-hidden="true" className="mt-4 hidden gap-4 px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-warm-500 dark:text-gray-400 md:grid md:grid-cols-[minmax(0,2fr)_5rem_minmax(0,2fr)_minmax(0,3fr)]">
              <span>{INTAKE_COPY.conditionsColSource}</span>
              <span>{INTAKE_COPY.conditionsColRows}</span>
              <span>{INTAKE_COPY.conditionsColSuggested}</span>
              <span>{INTAKE_COPY.conditionsColChoice}</span>
            </div>
            <ul className="mt-3 space-y-3 md:mt-0">{lines.map(renderLine)}</ul>
          </>
        )}
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <button type="button" onClick={onBack} className={secondaryBtn}>
          {INTAKE_COPY.backButton}
        </button>
        <button type="button" onClick={onNext} className={primaryBtn}>
          {INTAKE_COPY.nextToRows}
        </button>
      </div>
    </div>
  );
};

export default ConditionStep;
