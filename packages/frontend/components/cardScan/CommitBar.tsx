/**
 * CommitBar (ADR-138 batch B7): saving the ready cards into the sale's stock.
 *
 *  - The way to count has no default. The seller chooses "Add to my stock" or "Set my stock to this count" and the button stays
 *    off until they do.
 *  - Beside the button: how many cards (and copies) will be saved, the session defaults that will be applied to cards without
 *    their own choice ("12 cards will be saved as Near Mint (your default for this session)."), and how many cards still need a
 *    decision and will not be saved.
 *  - After saving: the counts in plain words, the cards that were not saved, the cards that could not be saved, and a way on.
 *  - The server freezes edits while saving, so this part also explains a scan that is being saved or closed.
 */
import React, { useId } from 'react';
import Link from 'next/link';
import type { VocabOption } from '../../lib/cardIntake';
import type { ScanEntry, ScanFailure, ScanMode, ScanSession } from '../../lib/cardScan';
import { SCAN_COPY } from '../../lib/cardScanCopy';
import { MODE_OPTIONS, commitState, describeCommit, entryTitle } from '../../lib/cardScanQueue';
import RepriceUnpricedLink from '../priceBook/RepriceUnpricedLink'; // ADR-140 (B8): renders only when the price book is on
import type { CommitOutcome } from './useScanSession';
import ScanNotice from './ScanNotice';
import { headingCls, mutedCls, primaryBtn, secondaryBtn } from './ui';

export interface CommitBarProps {
  saleId: string;
  session: ScanSession | null;
  entries: ScanEntry[];
  mode: ScanMode | null;
  uploadsInFlight: number;
  pendingChanges: number;
  conditions: readonly VocabOption[];
  finishes: readonly VocabOption[];
  committing: boolean;
  outcome: CommitOutcome | null;
  failure: ScanFailure | null;
  onMode: (mode: ScanMode) => void;
  onCommit: () => void;
  onNewScan: () => void;
  /** Hides the result of the last save so the cards that were left can be finished. Offered only while the scan is still open. */
  onKeepGoing: () => void;
}

const CommitBar: React.FC<CommitBarProps> = ({
  saleId,
  session,
  entries,
  mode,
  uploadsInFlight,
  pendingChanges,
  conditions,
  finishes,
  committing,
  outcome,
  failure,
  onMode,
  onCommit,
  onNewScan,
  onKeepGoing,
}) => {
  const base = useId();
  const state = commitState({ session, entries, mode, uploadsInFlight, pendingChanges, conditionOptions: conditions, finishOptions: finishes });
  const titleOf = (entryId: string): string => {
    const hit = entries.filter((e) => e.id === entryId)[0];
    return hit ? entryTitle(hit) : SCAN_COPY.unknownCard;
  };

  if (outcome) {
    const desc = describeCommit(outcome.result, outcome.alreadyApplied);
    return (
      <section aria-labelledby={`${base}-done`} className="min-w-0 space-y-3 rounded-lg border border-green-300 bg-green-50 p-4 dark:border-green-700 dark:bg-green-900/20">
        <h2 id={`${base}-done`} className={headingCls}>
          {desc.headline}
        </h2>
        <div role="status" className="space-y-1 text-sm text-warm-900 dark:text-warm-100">
          {desc.lines.map((line) => (
            <p key={line} className="break-words">
              {line}
            </p>
          ))}
          <RepriceUnpricedLink needsPrice={outcome.result.summary.needsPrice} saleId={saleId} batchId={outcome.result.batchId} className="pt-1" />
        </div>
        {outcome.result.notCommitted.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold text-warm-900 dark:text-warm-100">{SCAN_COPY.commitNotCommittedHeading}</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-warm-800 dark:text-warm-100">
              {outcome.result.notCommitted.map((n) => (
                <li key={n.entryId} className="break-words">
                  {titleOf(n.entryId)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {outcome.result.failed.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold text-warm-900 dark:text-warm-100">{SCAN_COPY.commitFailedHeading}</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-warm-800 dark:text-warm-100">
              {outcome.result.failed.map((f) => (
                <li key={f.entryId} className="break-words">
                  {titleOf(f.entryId)}
                  {f.message ? `: ${f.message}` : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={onNewScan} className={primaryBtn}>
            {SCAN_COPY.commitScanAgain}
          </button>
          {session && session.status === 'OPEN' ? (
            <button type="button" onClick={onKeepGoing} className={secondaryBtn}>
              {SCAN_COPY.commitKeepGoing}
            </button>
          ) : null}
          <Link
            href={`/organizer/add-items/${encodeURIComponent(saleId)}`}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-warm-100 px-4 py-2 text-sm font-semibold text-warm-900 hover:bg-warm-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600 sm:w-auto"
          >
            {SCAN_COPY.backToItems}
          </Link>
        </div>
      </section>
    );
  }

  if (session && session.status !== 'OPEN' && !committing) {
    return (
      <section aria-labelledby={`${base}-closed`} className="min-w-0 space-y-2">
        <h2 id={`${base}-closed`} className={headingCls}>
          {SCAN_COPY.commitHeading}
        </h2>
        <ScanNotice tone="info" text={session.status === 'COMMITTING' ? SCAN_COPY.sessionCommitting : SCAN_COPY.sessionClosed} />
      </section>
    );
  }

  return (
    <section aria-labelledby={`${base}-title`} className="min-w-0 space-y-4 rounded-lg border border-warm-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h2 id={`${base}-title`} className={headingCls}>
        {SCAN_COPY.commitHeading}
      </h2>

      <fieldset className="min-w-0" disabled={committing}>
        <legend className="text-sm font-medium text-warm-900 dark:text-warm-100">{SCAN_COPY.modeLabel}</legend>
        <div className="mt-2 flex flex-col gap-2">
          {MODE_OPTIONS.map((o) => {
            const id = `${base}-mode-${o.mode}`;
            const checked = mode === o.mode;
            return (
              <label
                key={o.mode}
                htmlFor={id}
                className={`flex min-h-[44px] w-full cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm focus-within:ring-2 focus-within:ring-amber-500 ${
                  checked ? 'border-amber-600 bg-amber-50 dark:bg-amber-900/20' : 'border-warm-200 hover:border-amber-300 dark:border-gray-600'
                }`}
              >
                <input id={id} type="radio" name={`${base}-mode`} className="mt-0.5 h-5 w-5 flex-shrink-0 accent-amber-600" checked={checked} onChange={() => onMode(o.mode)} />
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-medium text-warm-900 dark:text-warm-100">{o.label}</span>
                  <span className="block break-words text-warm-600 dark:text-warm-300">{o.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {state.disclosures.length > 0 ? (
        <ul className="space-y-1 text-sm text-warm-900 dark:text-warm-100">
          {state.disclosures.map((d) => (
            <li key={d} className="break-words">
              {d}
            </li>
          ))}
        </ul>
      ) : null}
      {state.notReadyNote ? <p className={mutedCls}>{state.notReadyNote}</p> : null}

      {!state.canCommit && !committing ? (
        <ul id={`${base}-why`} className={`list-disc space-y-1 pl-5 ${mutedCls}`}>
          {state.blockerTexts.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : null}

      {failure ? <ScanNotice tone="error" text={failure.message} help={failure.help} /> : null}
      {committing ? (
        <p role="status" className="text-sm font-medium text-warm-900 dark:text-warm-100">
          {SCAN_COPY.committing}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!state.canCommit || committing}
        aria-describedby={!state.canCommit && !committing ? `${base}-why` : undefined}
        onClick={onCommit}
        className={primaryBtn}
      >
        {state.buttonLabel}
      </button>
    </section>
  );
};

export default CommitBar;
