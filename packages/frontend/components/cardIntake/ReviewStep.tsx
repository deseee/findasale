/**
 * ReviewStep (ADR-134 #642, batch B8): step 3, ambiguous rows.
 *
 * Rows come from the preview's reviewRows: the rows that need a choice (the backend lists at most 500 of them) followed by a
 * small sample of rows with no catalog match (those import with the file's details and never need a choice, so they do not
 * use the 500). They are split by reason into three groups the seller switches between: more than one printing, finish to
 * choose, and no catalog match. Each group offers "apply to all rows like this". A list longer than 200 rows is windowed
 * (VirtualList).
 *
 * Nothing is guessed: a row that needs a choice and has none is skipped by the backend and listed in errors.csv. The count of
 * such rows is shown here and again on the confirm step. Rows that need a choice but are not listed (cap) are counted and
 * explained, with how to finish them from the errors file.
 */
import React, { useMemo, useState } from 'react';
import type { DecisionMap, PreviewData, ReviewReason, ReviewRow, VocabOption } from '../../lib/cardIntake';
import {
  applyFinishToGroup,
  applySameSet,
  applySkipToGroup,
  chooseCandidate,
  chooseFinish,
  finishOptionsForRow,
  groupCounts,
  hiddenReviewCount,
  noCatalogSampleIsPartial,
  noCatalogTotal,
  optionLabel,
  pendingRowCount,
  reviewRowsByReason,
  rowState,
  setSkip,
} from '../../lib/cardIntake';
import { INTAKE_COPY } from '../../lib/cardIntakeCopy';
import ReviewRowCard from './ReviewRowCard';
import VirtualList from './VirtualList';
import { cardCls, headingCls, inputCls, labelCls, mutedCls, noticeInfoCls, noticeWarnCls, primaryBtn, secondaryBtn } from './ui';

export interface ReviewStepProps {
  preview: PreviewData;
  decisions: DecisionMap;
  finishes: readonly VocabOption[];
  onDecisions: (next: DecisionMap) => void;
  onBack: () => void;
  onNext: () => void;
}

const ORDER: ReviewReason[] = ['AMBIGUOUS_PRINTING', 'FINISH_AMBIGUOUS', 'NO_CATALOG_MATCH'];
const TITLES: Record<ReviewReason, string> = {
  AMBIGUOUS_PRINTING: INTAKE_COPY.rowsGroupPrinting,
  FINISH_AMBIGUOUS: INTAKE_COPY.rowsGroupFinish,
  NO_CATALOG_MATCH: INTAKE_COPY.rowsGroupNoMatch,
};
/** Starting height guesses for the windowed list (real heights are measured as rows appear). */
const ESTIMATE: Record<ReviewReason, number> = { AMBIGUOUS_PRINTING: 560, FINISH_AMBIGUOUS: 260, NO_CATALOG_MATCH: 150 };

const rowKey = (r: ReviewRow) => String(r.row);

const ReviewStep: React.FC<ReviewStepProps> = ({ preview, decisions, finishes, onDecisions, onBack, onNext }) => {
  const cols = preview.columnsPresent;
  const rows = preview.reviewRows;
  const present = useMemo(() => ORDER.filter((reason) => reviewRowsByReason(rows, reason).length > 0), [rows]);
  const firstWithPending = present.filter((reason) => groupCounts(rows, decisions, reason, cols).pending > 0)[0];
  const [active, setActive] = useState<ReviewReason | null>(null);
  const [bulkNote, setBulkNote] = useState<string>('');
  const [bulkFinish, setBulkFinish] = useState<string>('');

  const current: ReviewReason | null = active && present.indexOf(active) >= 0 ? active : firstWithPending || present[0] || null;
  const groupRows = useMemo(() => (current ? reviewRowsByReason(rows, current) : []), [rows, current]);
  const pendingTotal = pendingRowCount(rows, decisions, cols);
  const hidden = hiddenReviewCount(preview);
  const noMatchTotal = noCatalogTotal(preview);
  const listedChoiceRows = rows.filter((r) => r.reason !== 'NO_CATALOG_MATCH').length;

  const note = (n: number) => setBulkNote(n > 0 ? INTAKE_COPY.rowsApplied(n) : INTAKE_COPY.rowsAppliedNone);

  const finishChoicesForGroup = useMemo(() => {
    if (!current) return [] as string[];
    const out: string[] = [];
    groupRows.forEach((r) => {
      if (rowState(r, decisions[r.row], cols) !== 'PENDING') return;
      finishOptionsForRow(r, decisions[r.row]).forEach((f) => out.indexOf(f) < 0 && out.push(f));
    });
    return out;
  }, [current, groupRows, decisions, cols]);

  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        <section className={cardCls}>
          <h3 className={headingCls}>{INTAKE_COPY.rowsHeading}</h3>
          <p className={`mt-2 ${mutedCls}`}>{INTAKE_COPY.rowsNone}</p>
          {hidden > 0 ? <p className={`mt-3 ${noticeWarnCls}`}>{INTAKE_COPY.rowsTruncated(0, hidden)}</p> : null}
        </section>
        <Nav onBack={onBack} onNext={onNext} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section aria-labelledby="ci-rows-heading" className={cardCls}>
        <h3 id="ci-rows-heading" className={headingCls}>
          {INTAKE_COPY.rowsHeading}
        </h3>
        <p className={`mt-1 ${mutedCls}`}>{INTAKE_COPY.rowsIntro}</p>
        {hidden > 0 ? <p className={`mt-3 ${noticeWarnCls}`}>{INTAKE_COPY.rowsTruncated(listedChoiceRows, hidden)}</p> : null}
        {pendingTotal > 0 ? (
          <p aria-live="polite" className={`mt-3 ${noticeInfoCls}`}>
            {INTAKE_COPY.rowsPendingNote(pendingTotal)}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap" role="group" aria-label={INTAKE_COPY.rowsHeading}>
          {present.map((reason) => {
            const c = groupCounts(rows, decisions, reason, cols);
            const on = reason === current;
            return (
              <button
                key={reason}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setActive(reason);
                  setBulkNote('');
                  setBulkFinish('');
                }}
                className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 sm:w-auto ${
                  on ? 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100' : 'border-warm-300 bg-white text-warm-800 hover:border-amber-400 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-200'
                }`}
              >
                <span className="min-w-0 break-words">{TITLES[reason]}</span>
                <span className="flex-shrink-0 tabular-nums">
                  {reason === 'NO_CATALOG_MATCH' ? noMatchTotal : c.pending}
                  <span className="sr-only">{' '}{reason === 'NO_CATALOG_MATCH' ? INTAKE_COPY.rowsTabRows : INTAKE_COPY.rowsTabPending}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {current ? (
        <section aria-labelledby="ci-group-heading" className={cardCls}>
          <h4 id="ci-group-heading" className="text-base font-semibold text-warm-900 dark:text-warm-100">
            {TITLES[current]}
          </h4>
          <p className={`mt-1 ${mutedCls}`}>
            {current === 'NO_CATALOG_MATCH'
              ? noCatalogSampleIsPartial(preview)
                ? INTAKE_COPY.rowsGroupNoMatchSample(groupRows.length, noMatchTotal)
                : INTAKE_COPY.rowsGroupNoMatchBody
              : INTAKE_COPY.rowsGroupCount(groupRows.length, groupCounts(rows, decisions, current, cols).pending)}
          </p>

          {current !== 'NO_CATALOG_MATCH' ? (
            <div className="mt-3 rounded-lg border border-warm-200 p-3 dark:border-gray-700">
              <p className="text-sm font-semibold text-warm-900 dark:text-warm-100">{INTAKE_COPY.rowsApplyHeading}</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                <button
                  type="button"
                  className={secondaryBtn}
                  disabled={groupCounts(rows, decisions, current, cols).pending === 0}
                  onClick={() => {
                    const res = applySkipToGroup(rows, decisions, current, cols);
                    onDecisions(res.map);
                    note(res.changed);
                  }}
                >
                  {INTAKE_COPY.rowsApplySkip}
                </button>
                {finishChoicesForGroup.length > 0 ? (
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="min-w-0">
                      <label htmlFor="ci-bulk-finish" className={labelCls}>
                        {INTAKE_COPY.rowsChooseFinish}
                      </label>
                      <select id="ci-bulk-finish" className={inputCls} value={bulkFinish} onChange={(e) => setBulkFinish(e.target.value)}>
                        <option value="">{INTAKE_COPY.rowsFinishPlaceholder}</option>
                        {finishChoicesForGroup.map((f) => (
                          <option key={f} value={f}>
                            {optionLabel(finishes, f)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      className={secondaryBtn}
                      disabled={!bulkFinish}
                      onClick={() => {
                        const res = applyFinishToGroup(rows, decisions, current, bulkFinish, cols);
                        onDecisions(res.map);
                        note(res.changed);
                      }}
                    >
                      {bulkFinish ? INTAKE_COPY.rowsApplyFinish(optionLabel(finishes, bulkFinish)) : INTAKE_COPY.rowsApplyFinishUnset}
                    </button>
                  </div>
                ) : null}
              </div>
              <p aria-live="polite" className={`mt-2 ${mutedCls}`}>
                {bulkNote}
              </p>
            </div>
          ) : null}

          <div className="mt-4">
            <VirtualList
              key={current}
              items={groupRows}
              getKey={rowKey}
              estimateHeight={ESTIMATE[current]}
              ariaLabel={INTAKE_COPY.rowsListLabel}
              hint={groupRows.length > 200 ? INTAKE_COPY.rowsListHint : undefined}
              renderItem={(r) => (
                <ReviewRowCard
                  row={r}
                  decision={decisions[r.row]}
                  columnsPresent={cols}
                  finishes={finishes}
                  onChoose={(printingId) => onDecisions(chooseCandidate(decisions, r, printingId))}
                  onFinish={(finish) => onDecisions(chooseFinish(decisions, r, finish))}
                  onSkip={(skip) => onDecisions(setSkip(decisions, r, skip))}
                  onApplySameSet={(printingId) => {
                    const withPick = chooseCandidate(decisions, r, printingId);
                    const res = applySameSet(rows, withPick, r, printingId);
                    onDecisions(res.map);
                    note(res.changed);
                  }}
                />
              )}
            />
          </div>
        </section>
      ) : null}

      <Nav onBack={onBack} onNext={onNext} />
    </div>
  );
};

const Nav: React.FC<{ onBack: () => void; onNext: () => void }> = ({ onBack, onNext }) => (
  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
    <button type="button" onClick={onBack} className={secondaryBtn}>
      {INTAKE_COPY.backButton}
    </button>
    <button type="button" onClick={onNext} className={primaryBtn}>
      {INTAKE_COPY.nextToConfirm}
    </button>
  </div>
);

export default ReviewStep;
