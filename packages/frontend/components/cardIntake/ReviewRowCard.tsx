/**
 * ReviewRowCard (ADR-134 #642, batch B8): one row that needs the seller's choice in step 3.
 *
 *  - AMBIGUOUS_PRINTING: up to five candidate printings as full-width cards (radio buttons: the whole card is the tap target and
 *    the arrow keys move between them), then a finish picker when the chosen printing comes in more than one finish and the file
 *    has no finish column.
 *  - FINISH_AMBIGUOUS: a finish picker.
 *  - NO_CATALOG_MATCH: nothing to choose ("No catalog match, will import with your details"); the row can still be skipped.
 *  - Every row can be skipped. A row with no choice is skipped by the backend and listed in errors.csv, never guessed.
 */
import React, { useState } from 'react';
import type { ColumnsPresent, Candidate, ReviewRow, RowDecision, VocabOption } from '../../lib/cardIntake';
import { candidateFinishes, candidateTitle, finishOptionsForRow, finishRequired, findCandidate, optionLabel, rowState } from '../../lib/cardIntake';
import { INTAKE_COPY } from '../../lib/cardIntakeCopy';
import { inputCls, labelCls, mutedCls, secondaryBtn } from './ui';

export interface ReviewRowCardProps {
  row: ReviewRow;
  decision: RowDecision | undefined;
  columnsPresent: Pick<ColumnsPresent, 'finish'>;
  finishes: readonly VocabOption[];
  onChoose: (printingId: string) => void;
  onFinish: (finish: string) => void;
  onSkip: (skip: boolean) => void;
  onApplySameSet: (printingId: string) => void;
}

const Thumb: React.FC<{ url: string | null; name: string }> = ({ url, name }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex h-[66px] w-[48px] flex-shrink-0 items-center justify-center overflow-hidden rounded border border-warm-200 bg-warm-100 dark:border-gray-600 dark:bg-gray-700">
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" className="h-full w-full object-contain" onError={() => setFailed(true)} />
      ) : (
        <span className="px-1 text-center text-[10px] leading-tight text-warm-500 dark:text-warm-400">
          <span className="sr-only">{name}: </span>
          {INTAKE_COPY.rowsNoImage}
        </span>
      )}
    </div>
  );
};

const STATE_PILL: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  DECIDED: 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100',
  SKIPPED: 'bg-warm-200 text-warm-800 dark:bg-gray-700 dark:text-gray-100',
  INFO: 'bg-warm-100 text-warm-800 dark:bg-gray-700 dark:text-gray-100',
};

function candidateMeta(c: Candidate, finishes: readonly VocabOption[]): string {
  const f = candidateFinishes(c).map((code) => optionLabel(finishes, code));
  return f.join(', ');
}

const ReviewRowCard: React.FC<ReviewRowCardProps> = ({ row, decision, columnsPresent, finishes, onChoose, onFinish, onSkip, onApplySameSet }) => {
  const state = rowState(row, decision, columnsPresent);
  const skipped = state === 'SKIPPED';
  const picked = findCandidate(row, decision && decision.printingId);
  const options = finishOptionsForRow(row, decision);
  const needsFinish = finishRequired(row, decision, columnsPresent);
  const showFinish = options.length > 1 && row.reason !== 'NO_CATALOG_MATCH';
  const groupName = `ci-row-${row.row}`;
  const pillText = state === 'PENDING' ? INTAKE_COPY.rowsPending : state === 'DECIDED' ? INTAKE_COPY.rowsDecided : state === 'SKIPPED' ? INTAKE_COPY.rowsSkipped : INTAKE_COPY.rowsNoMatchRow;
  const fileLine = INTAKE_COPY.rowsFromFile(row.setCode ? row.setCode.toUpperCase() : '', row.collectorNumber || '');

  return (
    <article className="min-w-0 rounded-lg border border-warm-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800" aria-label={INTAKE_COPY.rowsRowLabel(row.row, row.name)}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="break-words text-base font-semibold text-warm-900 dark:text-warm-100">{INTAKE_COPY.rowsRowLabel(row.row, row.name)}</h4>
          <p className={`break-words ${mutedCls}`}>{fileLine}</p>
        </div>
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATE_PILL[state]}`}>{pillText}</span>
      </header>

      {row.reason === 'NO_CATALOG_MATCH' ? (
        <p className="mt-2 text-sm text-warm-700 dark:text-warm-300">{INTAKE_COPY.rowsNoMatchRow}</p>
      ) : null}

      {row.reason === 'AMBIGUOUS_PRINTING' ? (
        <fieldset className="mt-3 min-w-0" disabled={skipped}>
          <legend className="sr-only">{INTAKE_COPY.rowsRowLabel(row.row, row.name)}</legend>
          <div className="flex flex-col gap-2">
            {row.candidates.map((c) => {
              const checked = !!decision && decision.printingId === c.printingId && !skipped;
              const id = `${groupName}-${c.printingId}`;
              return (
                <label
                  key={c.printingId}
                  htmlFor={id}
                  className={`flex min-h-[44px] w-full cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm focus-within:ring-2 focus-within:ring-amber-500 ${
                    checked ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'border-warm-200 hover:border-amber-300 dark:border-gray-600'
                  } ${skipped ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <input id={id} type="radio" name={groupName} className="h-5 w-5 flex-shrink-0 accent-amber-600" checked={checked} disabled={skipped} onChange={() => onChoose(c.printingId)} />
                  <Thumb url={c.imageSmallUrl} name={c.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-medium text-warm-900 dark:text-warm-100">{candidateTitle(c)}</span>
                    <span className="block break-words text-warm-600 dark:text-warm-300">{candidateMeta(c, finishes)}</span>
                  </span>
                  {checked ? <span className="flex-shrink-0 text-xs font-semibold text-amber-800 dark:text-amber-200">{INTAKE_COPY.rowsPicked}</span> : null}
                </label>
              );
            })}
          </div>
          {row.candidatesTruncated ? <p className={`mt-2 ${mutedCls}`}>{INTAKE_COPY.rowsMoreCandidates}</p> : null}
        </fieldset>
      ) : null}

      {showFinish ? (
        <div className="mt-3">
          <label htmlFor={`ci-finish-${row.row}`} className={labelCls}>
            {INTAKE_COPY.rowsChooseFinish}
            {needsFinish ? <span aria-hidden="true"> *</span> : null}
          </label>
          <select
            id={`ci-finish-${row.row}`}
            className={`${inputCls} ${needsFinish && !(decision && decision.finish) && !skipped ? 'border-amber-500' : ''}`}
            value={(decision && decision.finish) || ''}
            disabled={skipped}
            onChange={(e) => onFinish(e.target.value)}
          >
            <option value="">{needsFinish ? INTAKE_COPY.rowsFinishPlaceholder : INTAKE_COPY.rowsFinishFromFile}</option>
            {options.map((code) => (
              <option key={code} value={code}>
                {optionLabel(finishes, code)}
              </option>
            ))}
          </select>
          {needsFinish && !(decision && decision.finish) && !skipped ? <p className={`mt-1 ${mutedCls}`}>{INTAKE_COPY.rowsFinishNeeded}</p> : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {skipped ? (
          <button type="button" onClick={() => onSkip(false)} className={secondaryBtn}>
            {INTAKE_COPY.rowsUnskip}
          </button>
        ) : (
          <button type="button" onClick={() => onSkip(true)} className={secondaryBtn}>
            {INTAKE_COPY.rowsSkip}
          </button>
        )}
        {picked && !skipped && row.reason === 'AMBIGUOUS_PRINTING' ? (
          <button type="button" onClick={() => onApplySameSet(picked.printingId)} className={secondaryBtn}>
            {INTAKE_COPY.rowsApplySameSet(picked.setName || picked.setCode.toUpperCase())}
          </button>
        ) : null}
      </div>
    </article>
  );
};

export default React.memo(ReviewRowCard);
