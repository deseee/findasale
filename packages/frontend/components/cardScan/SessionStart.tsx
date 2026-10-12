/**
 * SessionStart (ADR-138 batch B7): the first thing on the page when no scan is open.
 *
 *  - "Pick up where you left off": scans still open for this sale (a scan can be left and come back to, on this phone or another
 *    device), each with its counts in the four queue words.
 *  - A new scan: an optional name, and optional defaults for the condition and finish of cards the seller does not set
 *    themselves. The defaults start as "No default". A suggested condition is never used unless the seller taps it.
 */
import React, { useEffect, useId, useState } from 'react';
import type { VocabOption } from '../../lib/cardIntake';
import { SESSION_LABEL_MAX, buildCreateSessionBody } from '../../lib/cardScan';
import type { ScanClient, ScanCounts, ScanFailure, ScanSessionListItem } from '../../lib/cardScan';
import { SCAN_COPY, SCAN_FILTER_LABELS, wordingForScanError } from '../../lib/cardScanCopy';
import ScanNotice from './ScanNotice';
import { cardCls, headingCls, inputCls, labelCls, mutedCls, primaryBtn, secondaryBtn } from './ui';

export interface SessionStartProps {
  saleId: string;
  client: ScanClient;
  conditions: readonly VocabOption[];
  finishes: readonly VocabOption[];
  onOpen: (sessionId: string) => void;
}

type ListState = 'loading' | 'ready' | 'error';

function countsLine(c: ScanCounts): string {
  return [
    SCAN_COPY.filterCount(SCAN_FILTER_LABELS.NEEDS_DECISION, c.needsReview + c.error),
    SCAN_COPY.filterCount(SCAN_FILTER_LABELS.READY, c.ready),
    SCAN_COPY.filterCount(SCAN_FILTER_LABELS.SKIPPED, c.skipped),
    SCAN_COPY.filterCount(SCAN_FILTER_LABELS.COMMITTED, c.committed),
  ].join(', ');
}

const SessionStart: React.FC<SessionStartProps> = ({ saleId, client, conditions, finishes, onOpen }) => {
  const base = useId();
  const [listState, setListState] = useState<ListState>('loading');
  const [items, setItems] = useState<ScanSessionListItem[]>([]);
  const [listFailure, setListFailure] = useState<ScanFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [label, setLabel] = useState('');
  const [conditionCode, setConditionCode] = useState('');
  const [finish, setFinish] = useState('');
  const [starting, setStarting] = useState(false);
  const [startFailure, setStartFailure] = useState<ScanFailure | null>(null);
  const [localCode, setLocalCode] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    setListState('loading');
    void client.listSessions(saleId, ctl.signal).then((r) => {
      if (ctl.signal.aborted) return;
      if (r.ok) {
        setItems(r.data.filter((s) => s.status === 'OPEN' || s.status === 'COMMITTING'));
        setListFailure(null);
        setListState('ready');
      } else {
        setListFailure(r.failure);
        setListState('error');
      }
    });
    return () => ctl.abort();
  }, [client, saleId, attempt]);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    if (starting) return;
    setStartFailure(null);
    setLocalCode(null);
    const built = buildCreateSessionBody({
      saleId,
      label,
      source: 'PHOTO',
      defaultConditionCode: conditionCode === '' ? null : conditionCode,
      defaultFinish: finish === '' ? null : finish,
    });
    if (!built.ok) {
      setLocalCode(built.code);
      return;
    }
    setStarting(true);
    try {
      const result = await client.createSession(built.body);
      if (result.ok) onOpen(result.data.id);
      else setStartFailure(result.failure);
    } finally {
      setStarting(false);
    }
  };

  const localText = localCode === 'LABEL_TOO_LONG' ? SCAN_COPY.sessionLabelTooLong : localCode ? wordingForScanError('BAD_REQUEST').message : null;

  return (
    <div className="min-w-0 space-y-6">
      <section aria-labelledby={`${base}-resume`} className={`min-w-0 space-y-3 ${cardCls}`}>
        <h2 id={`${base}-resume`} className={headingCls}>
          {SCAN_COPY.sessionResumeHeading}
        </h2>
        {listState === 'loading' ? (
          <p role="status" className={mutedCls}>
            {SCAN_COPY.sessionsLoading}
          </p>
        ) : null}
        {listState === 'error' && listFailure ? (
          <ScanNotice tone="error" text={listFailure.message} help={listFailure.help}>
            <button type="button" onClick={() => setAttempt(attempt + 1)} className={secondaryBtn}>
              {SCAN_COPY.sendRetry}
            </button>
          </ScanNotice>
        ) : null}
        {listState === 'ready' && items.length === 0 ? <p className={mutedCls}>{SCAN_COPY.sessionNone}</p> : null}
        {listState === 'ready' && items.length > 0 ? (
          <ul className="space-y-2">
            {items.map((s) => {
              const name = s.label || SCAN_COPY.sessionUnnamed;
              return (
                <li key={s.id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-warm-200 p-3 dark:border-gray-600 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold text-warm-900 dark:text-warm-100">{name}</p>
                    <p className={`break-words ${mutedCls}`}>{countsLine(s.counts)}</p>
                    {s.status === 'COMMITTING' ? <p className={mutedCls}>{SCAN_COPY.sessionCommitting}</p> : null}
                  </div>
                  <button type="button" onClick={() => onOpen(s.id)} className={secondaryBtn} aria-label={SCAN_COPY.openScanLabel(name)}>
                    {SCAN_COPY.sessionResume}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <form onSubmit={(e) => void start(e)} noValidate aria-labelledby={`${base}-new`} className={`min-w-0 space-y-4 ${cardCls}`}>
        <h2 id={`${base}-new`} className={headingCls}>
          {SCAN_COPY.sessionHeading}
        </h2>
        <div>
          <label htmlFor={`${base}-label`} className={labelCls}>
            {SCAN_COPY.sessionLabel}
          </label>
          <input
            id={`${base}-label`}
            type="text"
            maxLength={SESSION_LABEL_MAX}
            autoComplete="off"
            value={label}
            aria-describedby={`${base}-label-hint`}
            onChange={(e) => setLabel(e.target.value)}
            className={inputCls}
          />
          <p id={`${base}-label-hint`} className={`mt-1 ${mutedCls}`}>
            {SCAN_COPY.sessionLabelHint}
          </p>
        </div>

        <fieldset className="min-w-0 space-y-3">
          <legend className="text-sm font-medium text-warm-900 dark:text-warm-100">{SCAN_COPY.sessionDefaultsHeading}</legend>
          <div>
            <label htmlFor={`${base}-cond`} className={labelCls}>
              {SCAN_COPY.defaultConditionLabel}
            </label>
            <select
              id={`${base}-cond`}
              value={conditionCode}
              aria-describedby={`${base}-cond-hint`}
              onChange={(e) => setConditionCode(e.target.value)}
              className={inputCls}
            >
              <option value="">{SCAN_COPY.defaultConditionNone}</option>
              {conditions.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <p id={`${base}-cond-hint`} className={`mt-1 ${mutedCls}`}>
              {SCAN_COPY.defaultConditionHint}
            </p>
          </div>
          <div>
            <label htmlFor={`${base}-fin`} className={labelCls}>
              {SCAN_COPY.defaultFinishLabel}
            </label>
            <select id={`${base}-fin`} value={finish} aria-describedby={`${base}-fin-hint`} onChange={(e) => setFinish(e.target.value)} className={inputCls}>
              <option value="">{SCAN_COPY.defaultFinishNone}</option>
              {finishes.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.label}
                </option>
              ))}
            </select>
            <p id={`${base}-fin-hint`} className={`mt-1 ${mutedCls}`}>
              {SCAN_COPY.defaultFinishHint}
            </p>
          </div>
        </fieldset>

        <div aria-live="polite" className="space-y-2">
          {localText ? <ScanNotice tone="error" text={localText} onDismiss={() => setLocalCode(null)} /> : null}
          {startFailure ? <ScanNotice tone="error" text={startFailure.message} help={startFailure.help} onDismiss={() => setStartFailure(null)} /> : null}
        </div>

        <button type="submit" disabled={starting} className={primaryBtn}>
          {starting ? SCAN_COPY.sessionStarting : SCAN_COPY.sessionStart}
        </button>
      </form>
    </div>
  );
};

export default SessionStart;
