/**
 * ImportRunPanel (ADR-134 #642, batch B8): everything the confirm step shows once Import has been pressed.
 *
 *   running      progress bar fed by the NDJSON stream (reading the file, then adding cards), a calm note after a quiet spell,
 *                Stop (cancel; the same file sent again resumes), and a reminder to keep the page open
 *   done         what was added, matched, skipped, with problems; "Download errors.csv"; link back to the items
 *   stopped      the seller stopped it, or the server ended it early: Resume sends the same file again
 *   interrupted  the connection dropped; progress is saved; Resume
 *   failed       a refusal or a server problem, in plain words; Try again or go back
 *   already      409 ALREADY_APPLIED, shown as "already imported" and not as a failure; "Import it again anyway" is a deliberate extra step
 */
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { buildErrorsCsv } from '../../lib/cardIntake';
import { INTAKE_COPY, wordingForRowError, wordingForWarning } from '../../lib/cardIntakeCopy';
import type { ImportState } from '../../lib/cardIntakeStream';
import { errorCount, errorLines, errorRecords, errorsByCode, percentOf } from '../../lib/cardIntakeStream';
import ErrorNotice from './ErrorNotice';
import ProgressBar from './ProgressBar';
import { cardCls, headingCls, mutedCls, noticeInfoCls, noticeOkCls, noticeWarnCls, primaryBtn, secondaryBtn } from './ui';

export interface ImportRunPanelProps {
  state: ImportState;
  saleId: string;
  stalled: boolean;
  stopping: boolean;
  onStop: () => void;
  /** Sends the same file again (resume, or try again). */
  onResume: () => void;
  onForce: () => void;
  /** Back to the confirm form without starting anything. */
  onDismiss: () => void;
  onStartOver: () => void;
}

/** Saves text as a file in the browser. Revokes the temporary address afterwards. */
function downloadText(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ImportRunPanel: React.FC<ImportRunPanelProps> = ({ state, saleId, stalled, stopping, onStop, onResume, onForce, onDismiss, onStartOver }) => {
  const [forceOk, setForceOk] = useState(false);
  const records = useMemo(() => (state.status === 'done' || state.status === 'stopped' ? errorRecords(state, 20) : []), [state]);
  const totalErrors = state.done ? Math.max(state.done.summary.errors, errorCount(state)) : errorCount(state);
  // Rows skipped because they needed a choice: the errors file can be imported as a new file to choose for them.
  const choiceCodes = errorsByCode(state);
  const needsChoiceErrors = (choiceCodes.AMBIGUOUS_PRINTING ?? 0) + (choiceCodes.UNKNOWN_FINISH ?? 0);

  if (state.status === 'running') {
    const reading = state.phase === 'reading';
    const label = state.phase === null ? INTAKE_COPY.progressStarting : reading ? INTAKE_COPY.progressReading : INTAKE_COPY.progressWriting;
    const percent = state.phase === null ? null : percentOf(state.processed, state.total);
    return (
      <section aria-labelledby="ci-run-heading" className={cardCls}>
        <h3 id="ci-run-heading" className={headingCls}>
          {INTAKE_COPY.progressHeading}
        </h3>
        <div className="mt-4" role="status" aria-live="polite">
          <ProgressBar label={label} percent={percent} detail={state.total > 0 ? INTAKE_COPY.progressOf(state.processed, state.total) : undefined} />
          {!reading && state.phase !== null ? <p className={`mt-2 ${mutedCls}`}>{INTAKE_COPY.progressCounts(state.created, state.merged, state.skipped, state.errors)}</p> : null}
        </div>
        {stalled ? <p className={`mt-3 ${noticeInfoCls}`}>{INTAKE_COPY.progressStalled}</p> : null}
        <p className={`mt-3 ${mutedCls}`}>{INTAKE_COPY.progressKeepOpen}</p>
        <div className="mt-4">
          <button type="button" onClick={onStop} disabled={stopping} className={secondaryBtn}>
            {stopping ? INTAKE_COPY.stopping : INTAKE_COPY.stopButton}
          </button>
        </div>
      </section>
    );
  }

  if (state.status === 'done' && state.done) {
    const d = state.done.summary;
    const csvReady = totalErrors > 0 && state.done.errorsCsvHeader !== '' && errorLines(state).length > 0;
    const warningCodes = Object.keys(d.warnings);
    return (
      <section aria-labelledby="ci-run-heading" className={cardCls}>
        <h3 id="ci-run-heading" className={headingCls} tabIndex={-1}>
          {INTAKE_COPY.doneHeading}
        </h3>
        <ul className={`mt-3 list-disc space-y-1 pl-8 pr-3 py-2 text-sm ${noticeOkCls}`}>
          <li>{INTAKE_COPY.doneCreated(d.created)}</li>
          <li>{INTAKE_COPY.doneMerged(d.merged)}</li>
          <li>{INTAKE_COPY.doneSkipped(d.skipped)}</li>
          <li>{INTAKE_COPY.doneErrors(d.errors)}</li>
        </ul>
        {state.done.resumed ? <p className={`mt-3 ${mutedCls}`}>{INTAKE_COPY.doneResumed}</p> : null}
        {d.noCatalogMatch > 0 ? <p className={`mt-3 ${mutedCls}`}>{INTAKE_COPY.doneNoMatch(d.noCatalogMatch)}</p> : null}
        {d.needsPrice > 0 ? <p className={`mt-3 ${noticeWarnCls}`}>{INTAKE_COPY.doneNeedsPrice(d.needsPrice)}</p> : null}
        {warningCodes.length > 0 ? (
          <ul className={`mt-3 list-disc space-y-1 pl-5 ${mutedCls}`}>
            {warningCodes.map((code) => (
              <li key={code}>
                {wordingForWarning(code)} ({d.warnings[code].toLocaleString('en-US')})
              </li>
            ))}
          </ul>
        ) : null}

        {totalErrors > 0 ? (
          <div className="mt-4">
            <h4 className="text-base font-semibold text-warm-900 dark:text-warm-100">{INTAKE_COPY.errorsListHeading}</h4>
            <ul className="mt-2 space-y-2 text-sm">
              {records.map((r) => (
                <li key={r.row} className="min-w-0 rounded-lg border border-warm-200 p-2 dark:border-gray-700">
                  <span className="font-semibold text-warm-900 dark:text-warm-100">{INTAKE_COPY.problemRow(r.row)}</span>
                  <span className="mt-0.5 block break-words text-warm-700 dark:text-warm-300">{r.message || wordingForRowError(r.code).help}</span>
                </li>
              ))}
            </ul>
            <p className={`mt-3 ${mutedCls}`}>{INTAKE_COPY.errorsDownloadHint}</p>
            {needsChoiceErrors > 0 ? <p className={`mt-2 ${noticeInfoCls}`}>{INTAKE_COPY.errorsChoiceHint}</p> : null}
            {state.errorsTruncated ? <p className={`mt-2 ${noticeWarnCls}`}>{INTAKE_COPY.errorsIncomplete}</p> : null}
            <div className="mt-3">
              <button type="button" disabled={!csvReady} onClick={() => downloadText(INTAKE_COPY.errorsFileName, buildErrorsCsv(state.done ? state.done.errorsCsvHeader : '', errorLines(state)))} className={primaryBtn}>
                {INTAKE_COPY.errorsDownload}
              </button>
            </div>
          </div>
        ) : (
          <p className={`mt-3 ${mutedCls}`}>{INTAKE_COPY.doneNoErrors}</p>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link href={`/organizer/add-items/${saleId}`} className={`${totalErrors > 0 ? secondaryBtn : primaryBtn} no-underline`}>
            {INTAKE_COPY.doneViewItems}
          </Link>
          <button type="button" onClick={onStartOver} className={secondaryBtn}>
            {INTAKE_COPY.doneImportAnother}
          </button>
        </div>
      </section>
    );
  }

  if (state.status === 'stopped') {
    return (
      <section aria-labelledby="ci-run-heading" className={cardCls}>
        <h3 id="ci-run-heading" className={headingCls} tabIndex={-1}>
          {INTAKE_COPY.doneStoppedHeading}
        </h3>
        <p className={`mt-2 ${noticeInfoCls}`}>{INTAKE_COPY.doneStoppedBody}</p>
        {state.done ? <p className={`mt-3 text-sm text-warm-800 dark:text-warm-200`}>{INTAKE_COPY.progressCounts(state.created, state.merged, state.skipped, state.errors)}</p> : null}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={onResume} className={primaryBtn}>
            {INTAKE_COPY.resumeButton}
          </button>
          <button type="button" onClick={onStartOver} className={secondaryBtn}>
            {INTAKE_COPY.startOver}
          </button>
        </div>
      </section>
    );
  }

  if (state.status === 'interrupted') {
    return (
      <section aria-labelledby="ci-run-heading" className={cardCls}>
        <h3 id="ci-run-heading" className={headingCls} tabIndex={-1}>
          {INTAKE_COPY.failedHeading}
        </h3>
        <p role="alert" className={`mt-2 ${noticeWarnCls}`}>
          {INTAKE_COPY.interruptedBody}
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={onResume} className={primaryBtn}>
            {INTAKE_COPY.resumeButton}
          </button>
          <button type="button" onClick={onStartOver} className={secondaryBtn}>
            {INTAKE_COPY.startOver}
          </button>
        </div>
      </section>
    );
  }

  if (state.status === 'failed' && state.failure) {
    return (
      <section aria-labelledby="ci-run-heading" className={cardCls}>
        <h3 id="ci-run-heading" className={headingCls} tabIndex={-1}>
          {INTAKE_COPY.failedHeading}
        </h3>
        <div className="mt-3">
          <ErrorNotice failure={state.failure}>
            <button type="button" onClick={onResume} className={primaryBtn}>
              {INTAKE_COPY.retryButton}
            </button>
            <button type="button" onClick={onDismiss} className={secondaryBtn}>
              {INTAKE_COPY.backButton}
            </button>
          </ErrorNotice>
        </div>
      </section>
    );
  }

  if (state.status === 'already') {
    return (
      <section aria-labelledby="ci-run-heading" className={cardCls}>
        <h3 id="ci-run-heading" className={headingCls} tabIndex={-1}>
          {INTAKE_COPY.alreadyHeading}
        </h3>
        <p role="status" className={`mt-2 ${noticeInfoCls}`}>
          {INTAKE_COPY.alreadyBody}
        </p>
        {state.alreadySummary ? (
          <p className={`mt-3 text-sm text-warm-800 dark:text-warm-200`}>
            {INTAKE_COPY.alreadySummary(state.alreadySummary.created, state.alreadySummary.merged, state.alreadySummary.skipped, state.alreadySummary.errors)}
          </p>
        ) : null}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Link href={`/organizer/add-items/${saleId}`} className={`${primaryBtn} no-underline`}>
            {INTAKE_COPY.doneViewItems}
          </Link>
          <button type="button" onClick={onStartOver} className={secondaryBtn}>
            {INTAKE_COPY.doneImportAnother}
          </button>
        </div>
        <details className="mt-5 rounded-lg border border-warm-200 dark:border-gray-700">
          <summary className="flex min-h-[44px] cursor-pointer items-center px-3 text-sm font-semibold text-warm-800 dark:text-warm-200">{INTAKE_COPY.forceHeading}</summary>
          <div className="space-y-3 px-3 pb-3">
            <p className={noticeWarnCls}>{INTAKE_COPY.forceBody}</p>
            <label className="flex min-h-[44px] items-start gap-3 text-sm text-warm-800 dark:text-warm-200">
              <input type="checkbox" className="mt-0.5 h-5 w-5 flex-shrink-0 accent-amber-600" checked={forceOk} onChange={(e) => setForceOk(e.target.checked)} />
              <span className="min-w-0 break-words">{INTAKE_COPY.forceCheck}</span>
            </label>
            <button type="button" disabled={!forceOk} onClick={onForce} className={secondaryBtn}>
              {INTAKE_COPY.forceButton}
            </button>
          </div>
        </details>
      </section>
    );
  }

  return null;
};

export default ImportRunPanel;
