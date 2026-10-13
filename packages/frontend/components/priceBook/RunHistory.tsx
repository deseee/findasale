/**
 * RunHistory (ADR-140 section 11.5): the last 20 repricing runs with their status and an "Undo these changes" button where
 * undo is still allowed (applied or partly applied, inside the undo window). Undo repeats until done and then says how many
 * prices came back and how many were left alone because they were changed by hand since.
 */
import React, { useId, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { priceBookApi, readPriceBookError, runUntilDone } from '../../lib/priceBook';
import type { PriceBookRunSummary, PriceBookStatus } from '../../lib/priceBook';
import { PRICE_BOOK_COPY, PRICE_BOOK_UI, RUN_KIND_LABELS, RUN_STATUS_LABELS, lookupWord } from '../../lib/priceBookCopy';
import { describeUndoOutcome, formatLongDate } from '../../lib/priceBookRules';
import ConfirmDialog from '../ConfirmDialog';
import { isUndoAllowed, mutedCls, noticeErrorCls, noticeOkCls, sectionCls, secondaryBtn, subHeadingCls } from './ui';
import { pbKeys, useNow, useRefreshPriceBook } from './usePriceBookData';

export interface RunHistoryProps {
  status: PriceBookStatus;
}

export const HISTORY_MAX = 20;

const RunHistory: React.FC<RunHistoryProps> = ({ status }) => {
  const baseId = useId();
  const now = useNow();
  const refresh = useRefreshPriceBook();
  const [confirming, setConfirming] = useState<PriceBookRunSummary | null>(null);
  const [working, setWorking] = useState<string>('');
  const [outcome, setOutcome] = useState<{ runId: string; lines: string[] } | null>(null);
  const [error, setError] = useState('');

  const list = useQuery({
    queryKey: pbKeys.runs,
    queryFn: () => priceBookApi.listRuns(),
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const runs: PriceBookRunSummary[] = (list.data || []).slice(0, HISTORY_MAX);
  const undoDays = status.limits.undoDays || 0;

  const undo = useMutation({
    mutationFn: (run: PriceBookRunSummary) => runUntilDone(() => priceBookApi.undoRun(run.id)),
    onMutate: (run) => {
      setError('');
      setOutcome(null);
      setWorking(run.id);
    },
    onSuccess: (final, run) => {
      setWorking('');
      setOutcome({ runId: run.id, lines: describeUndoOutcome(final) });
      void refresh();
    },
    onError: (err) => {
      setWorking('');
      setError(readPriceBookError(err).message);
      void refresh();
    },
  });

  const titleId = `${baseId}-title`;

  return (
    <section aria-labelledby={titleId} className={sectionCls}>
      <h2 id={titleId} className={subHeadingCls}>{PRICE_BOOK_COPY.historyHeading}</h2>
      {error && <p role="alert" className={noticeErrorCls}>{error}</p>}
      <div aria-live="polite">
        {list.isLoading && <p role="status" className={mutedCls}>{PRICE_BOOK_COPY.loading}</p>}
        {list.isError && (
          <div role="alert" className={noticeErrorCls}>
            <p>{PRICE_BOOK_COPY.loadError}</p>
            <button type="button" className={`${secondaryBtn} mt-2`} onClick={() => list.refetch()}>{PRICE_BOOK_COPY.retry}</button>
          </div>
        )}
        {list.isSuccess && runs.length === 0 && <p className={mutedCls}>{PRICE_BOOK_UI.noRunsYet}</p>}
      </div>
      {runs.length > 0 && (
        <ul className="space-y-2">
          {runs.map((run) => {
            const applied = run.status === 'APPLIED' || run.status === 'PARTIAL' || run.status === 'UNDONE';
            return (
              <li key={run.id} className="min-w-0 rounded-lg border border-warm-200 p-3 dark:border-gray-700">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-warm-900 dark:text-warm-100">
                      {PRICE_BOOK_UI.historyTitle(lookupWord(RUN_KIND_LABELS, run.kind, ''), formatLongDate(run.createdAt))}
                    </p>
                    <p className="break-words text-sm text-warm-700 dark:text-warm-300">
                      {PRICE_BOOK_UI.historyDetail(
                        lookupWord(RUN_STATUS_LABELS, run.status, ''),
                        [applied ? PRICE_BOOK_COPY.applied(run.appliedCount) : '', run.undoneCount > 0 ? PRICE_BOOK_COPY.undone(run.undoneCount) : '']
                          .filter((x) => x)
                          .join(' ')
                      )}
                    </p>
                  </div>
                  {isUndoAllowed(run, now, undoDays) && (
                    <button type="button" className={secondaryBtn} disabled={working !== ''} onClick={() => setConfirming(run)}>
                      {working === run.id ? PRICE_BOOK_UI.working : PRICE_BOOK_COPY.undo}
                    </button>
                  )}
                </div>
                {outcome && outcome.runId === run.id && (
                  <div role="status" className="mt-2 space-y-1">
                    {outcome.lines.map((line) => (
                      <p key={line} className={noticeOkCls}>{line}</p>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        isOpen={confirming !== null}
        title={PRICE_BOOK_UI.undoConfirmTitle}
        message={PRICE_BOOK_UI.undoConfirmMessage}
        confirmLabel={PRICE_BOOK_COPY.undo}
        cancelLabel={PRICE_BOOK_UI.cancel}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const run = confirming;
          setConfirming(null);
          if (run) undo.mutate(run);
        }}
      />
    </section>
  );
};

export default RunHistory;
