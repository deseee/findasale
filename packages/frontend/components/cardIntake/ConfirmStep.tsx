/**
 * ConfirmStep (ADR-134 #642, batch B8): step 4, the last look before anything is written.
 *
 *  - Mode (ADD or REPLACE) has NO default. Import stays disabled until the seller picks one. The plain-words meaning of each
 *    choice sits next to it, with the example the preview worked out for the first card already in this sale.
 *  - Prices: "use the price from my file" (default only when the file has a price column) or "leave prices blank".
 *  - A summary of what will happen, the rows with problems, and the exact reasons Import is disabled.
 *  - What an earlier import of the same file left behind (resume point, or already finished).
 */
import React, { useId } from 'react';
import type { BatchSummary, ConditionChoices, DecisionMap, EarlierBatch, IntakeMode, PreviewData, PriceSource } from '../../lib/cardIntake';
import { confirmBlockers, modeExampleText, noCatalogTotal, pendingRowCount, skippedRowCount, hiddenReviewCount } from '../../lib/cardIntake';
import type { IntakeStepId } from '../../lib/cardIntakeCopy';
import { INTAKE_COPY, wordingForRowError } from '../../lib/cardIntakeCopy';
import { cardCls, headingCls, mutedCls, noticeInfoCls, noticeWarnCls, primaryBtn, secondaryBtn } from './ui';

export interface ConfirmStepProps {
  preview: PreviewData;
  mode: IntakeMode | null;
  onMode: (m: IntakeMode) => void;
  priceSource: PriceSource;
  onPrice: (p: PriceSource) => void;
  conditionChoices: ConditionChoices;
  decisions: DecisionMap;
  earlier: EarlierBatch;
  busy: boolean;
  onImport: () => void;
  onBack: () => void;
  onGoStep: (step: IntakeStepId) => void;
}

interface RadioCardProps {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  title: string;
  body: string;
  onSelect: () => void;
}

const RadioCard: React.FC<RadioCardProps> = ({ name, value, checked, disabled, title, body, onSelect }) => {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={`flex min-h-[44px] w-full cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm focus-within:ring-2 focus-within:ring-amber-500 ${
        checked ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'border-warm-200 hover:border-amber-300 dark:border-gray-600'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <input id={id} type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={onSelect} className="mt-0.5 h-5 w-5 flex-shrink-0 accent-amber-600" />
      <span className="min-w-0">
        <span className="block break-words font-semibold text-warm-900 dark:text-warm-100">{title}</span>
        <span className="mt-0.5 block break-words text-warm-700 dark:text-warm-300">{body}</span>
      </span>
    </label>
  );
};

function earlierText(earlier: EarlierBatch): { text: string; warn: boolean } | null {
  if (earlier.kind === 'resume') return { text: INTAKE_COPY.earlierStopped(earlier.done, earlier.total), warn: false };
  if (earlier.kind === 'completed') return { text: INTAKE_COPY.earlierCompleted, warn: true };
  return null;
}

export function summaryOfBatch(b: BatchSummary): string {
  return INTAKE_COPY.alreadySummary(b.created, b.merged, b.skipped, b.errors);
}

const ConfirmStep: React.FC<ConfirmStepProps> = ({ preview, mode, onMode, priceSource, onPrice, conditionChoices, decisions, earlier, busy, onImport, onBack, onGoStep }) => {
  const blockersId = useId();
  const blockers = confirmBlockers({ preview, mode, conditionChoices, busy });
  const s = preview.summary;
  const cols = preview.columnsPresent;
  const pending = pendingRowCount(preview.reviewRows, decisions, cols);
  const unlisted = hiddenReviewCount(preview);
  const noMatch = noCatalogTotal(preview);
  const skipped = skippedRowCount(preview.reviewRows, decisions);
  const decidedCount = preview.reviewRows.filter((r) => {
    const d = decisions[r.row];
    return r.reason !== 'NO_CATALOG_MATCH' && !!d && d.skip !== true && (!!d.printingId || !!d.finish);
  }).length;
  const earlierInfo = earlierText(earlier);
  const errorCodes = Object.keys(s.errorsByCode);

  return (
    <div className="space-y-4">
      <section aria-labelledby="ci-confirm-heading" className={cardCls}>
        <h3 id="ci-confirm-heading" className={headingCls}>
          {INTAKE_COPY.confirmHeading}
        </h3>

        <fieldset className="mt-4">
          <legend className="text-base font-semibold text-warm-900 dark:text-warm-100">{INTAKE_COPY.modeHeading}</legend>
          <p className={`mt-1 ${mutedCls}`}>{INTAKE_COPY.modeHint}</p>
          <div className="mt-3 flex flex-col gap-2">
            <RadioCard name="ci-mode" value="ADD" checked={mode === 'ADD'} title={INTAKE_COPY.modeAddTitle} body={INTAKE_COPY.modeAddBody} onSelect={() => onMode('ADD')} />
            <RadioCard name="ci-mode" value="REPLACE" checked={mode === 'REPLACE'} title={INTAKE_COPY.modeReplaceTitle} body={INTAKE_COPY.modeReplaceBody} onSelect={() => onMode('REPLACE')} />
          </div>
          <div className={`mt-3 ${noticeInfoCls}`}>
            <p className="font-semibold text-warm-900 dark:text-warm-100">{INTAKE_COPY.modeExampleHeading}</p>
            <p className="mt-1 break-words">{modeExampleText(preview.firstMerge)}</p>
          </div>
          {mode === null ? <p className={`mt-2 ${mutedCls}`}>{INTAKE_COPY.modeNotChosen}</p> : null}
        </fieldset>

        {earlierInfo ? <p className={`mt-4 ${earlierInfo.warn ? noticeWarnCls : noticeInfoCls}`}>{earlierInfo.text}</p> : null}

        <fieldset className="mt-5">
          <legend className="text-base font-semibold text-warm-900 dark:text-warm-100">{INTAKE_COPY.priceHeading}</legend>
          <div className="mt-3 flex flex-col gap-2">
            <RadioCard name="ci-price" value="FILE" checked={priceSource === 'FILE'} disabled={!cols.price} title={INTAKE_COPY.priceFile} body={INTAKE_COPY.priceFileHint} onSelect={() => onPrice('FILE')} />
            <RadioCard name="ci-price" value="NONE" checked={priceSource === 'NONE'} title={INTAKE_COPY.priceNone} body={INTAKE_COPY.priceNoneHint} onSelect={() => onPrice('NONE')} />
          </div>
          {!cols.price ? <p className={`mt-2 ${mutedCls}`}>{INTAKE_COPY.priceNoColumn}</p> : null}
          {cols.price && priceSource === 'FILE' && s.needsPrice > 0 ? <p className={`mt-2 ${noticeWarnCls}`}>{INTAKE_COPY.priceNeedsPrice(s.needsPrice)}</p> : null}
        </fieldset>
      </section>

      <section aria-labelledby="ci-summary-heading" className={cardCls}>
        <h3 id="ci-summary-heading" className={headingCls}>
          {INTAKE_COPY.summaryHeading}
        </h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-warm-800 dark:text-warm-200">
          <li>{INTAKE_COPY.summaryCreate(s.willCreate)}</li>
          <li>{INTAKE_COPY.summaryMerge(s.willMerge)}</li>
          {decidedCount > 0 ? <li>{INTAKE_COPY.summaryDecided(decidedCount)}</li> : null}
          {skipped > 0 ? <li>{INTAKE_COPY.summarySkip(skipped)}</li> : null}
          {pending > 0 ? <li>{INTAKE_COPY.summaryUnchosen(pending)}</li> : null}
          {unlisted > 0 ? <li>{INTAKE_COPY.summaryUnlisted(unlisted)}</li> : null}
          {noMatch > 0 ? <li>{INTAKE_COPY.summaryNoMatch(noMatch)}</li> : null}
          {s.errors > 0 ? <li>{INTAKE_COPY.summaryProblems(s.errors)}</li> : null}
          <li>{INTAKE_COPY.summaryDraft}</li>
        </ul>
        {unlisted > 0 ? <p className={`mt-3 ${noticeWarnCls}`}>{INTAKE_COPY.unlistedNote(unlisted)}</p> : null}
      </section>

      {s.errors > 0 ? (
        <section aria-labelledby="ci-problems-heading" className={cardCls}>
          <h3 id="ci-problems-heading" className={headingCls}>
            {INTAKE_COPY.problemsHeading}
          </h3>
          <p className={`mt-1 ${mutedCls}`}>{INTAKE_COPY.problemsBody}</p>
          <ul className="mt-3 space-y-1 text-sm text-warm-800 dark:text-warm-200">
            {errorCodes.map((code) => (
              <li key={code} className="break-words">
                {wordingForRowError(code).label}: {s.errorsByCode[code].toLocaleString('en-US')}
              </li>
            ))}
          </ul>
          {preview.errorRows.length > 0 ? (
            <>
              <p className={`mt-3 ${mutedCls}`}>{INTAKE_COPY.problemsShown(Math.min(10, preview.errorRows.length), s.errors)}</p>
              <ul className="mt-2 space-y-2 text-sm">
                {preview.errorRows.slice(0, 10).map((r) => (
                  <li key={r.row} className="min-w-0 rounded-lg border border-warm-200 p-2 dark:border-gray-700">
                    <span className="font-semibold text-warm-900 dark:text-warm-100">{INTAKE_COPY.problemRow(r.row)}</span>
                    {r.name ? <span className="break-words text-warm-700 dark:text-warm-300">{': ' + r.name}</span> : null}
                    <span className="mt-0.5 block break-words text-warm-700 dark:text-warm-300">{wordingForRowError(r.code).help}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {blockers.length > 0 ? (
        <section id={blockersId} aria-labelledby={blockersId + '-h'} className={noticeWarnCls}>
          <h3 id={blockersId + '-h'} className="font-semibold">
            {INTAKE_COPY.blockersHeading}
          </h3>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {blockers.map((b) => (
              <li key={b.code}>
                {b.message}
                {b.code === 'CONDITIONS' ? (
                  <>
                    {' '}
                    <button type="button" onClick={() => onGoStep('conditions')} className="min-h-[44px] font-semibold underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
                      {INTAKE_COPY.goToConditions}
                    </button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <button type="button" onClick={onBack} className={secondaryBtn}>
          {INTAKE_COPY.backButton}
        </button>
        <button type="button" onClick={onImport} disabled={blockers.length > 0} aria-describedby={blockers.length > 0 ? blockersId : undefined} className={primaryBtn}>
          {busy ? INTAKE_COPY.importButtonBusy : INTAKE_COPY.importButton}
        </button>
      </div>
    </div>
  );
};

export default ConfirmStep;
