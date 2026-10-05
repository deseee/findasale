/**
 * SyncPanel (ADR-137 #660): the TCGplayer sync screen for one sale.
 *
 *  1 Where things stand      status counts and the last match date
 *  2 Send changes            download the update file, then "I uploaded it"; the cards waiting to be sent
 *  3 Bring sales back        choose a TCGplayer inventory export, check it, then update the quantities here
 *  4 Shipping on eBay        the plain note about orders between $20 and $30
 *
 * Nothing here talks to TCGplayer. The seller moves files by hand. All wording lives in lib/cardTcgplayer.ts.
 */
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import {
  DEFAULT_EXPORT_CHOICES,
  ExportChoices,
  FirstSyncChoice,
  ReconcileReportDto,
  TCG_COPY,
  TcgStatus,
  cardLabel,
  formatSyncedAt,
  needsUploadedAnswer,
  readExport,
  readReconcileReport,
  readStatus,
  reconcileFields,
  reconcileUrl,
  reportHasChanges,
  reportSentences,
  saveTextFile,
  signed,
  tcgErrorSentence,
} from '../../lib/cardTcgplayer';
import { buildForm } from '../../lib/cardIntake';
import { cardCls, headingCls, inputCls, labelCls, mutedCls, noticeErrorCls, noticeInfoCls, noticeOkCls, noticeWarnCls, primaryBtn, secondaryBtn } from '../cardIntake/ui';

interface Props {
  saleId: string;
}

type StatusResult = TcgStatus | { enabled: false };

function statusKey(saleId: string): string[] {
  return ['card-tcgplayer-status', saleId];
}

const checkboxRow = 'flex min-h-[44px] min-w-0 items-start gap-3 py-1';
const checkboxCls = 'mt-1 h-5 w-5 shrink-0 rounded border-warm-300 text-amber-600 focus:ring-2 focus:ring-amber-500';

const SyncPanel: React.FC<Props> = ({ saleId }) => {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: statusKey(saleId),
    queryFn: async (): Promise<StatusResult> => {
      const res = await api.get('/card-tcgplayer/' + encodeURIComponent(saleId) + '/status');
      const parsed = readStatus(res.data);
      if (!parsed) throw new Error('Unreadable status');
      return parsed;
    },
    retry: 1,
    retryDelay: 500,
    refetchOnWindowFocus: false,
  });

  const refreshStatus = () => queryClient.invalidateQueries({ queryKey: statusKey(saleId) });

  if (statusQuery.isLoading) {
    return (
      <p role="status" className={mutedCls}>
        {TCG_COPY.loading}
      </p>
    );
  }
  if (statusQuery.isError || !statusQuery.data) {
    return (
      <p role="alert" className={noticeErrorCls}>
        {TCG_COPY.loadFailed}
      </p>
    );
  }
  const loaded = statusQuery.data;
  if (loaded.enabled !== true) {
    return (
      <p role="status" className={noticeInfoCls}>
        {TCG_COPY.notEnabled}
      </p>
    );
  }
  const status: TcgStatus = loaded;

  return (
    <div className="min-w-0 space-y-6">
      <StatusCard status={status} />
      <ExportCard saleId={saleId} status={status} onChanged={refreshStatus} />
      <ReconcileCard saleId={saleId} status={status} onChanged={refreshStatus} />
      <section className={cardCls} aria-labelledby="tcg-shipping-heading">
        <h2 id="tcg-shipping-heading" className={headingCls}>
          {TCG_COPY.shippingHeading}
        </h2>
        <p className={'mt-2 ' + mutedCls}>{TCG_COPY.shippingNote}</p>
      </section>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// 1 Status
// ---------------------------------------------------------------------------------------------

const StatusCard: React.FC<{ status: TcgStatus }> = ({ status }) => {
  const rows: Array<[string, string]> = [
    [TCG_COPY.cardsTrackedLabel, String(status.cardsTracked)],
    [TCG_COPY.listedLabel, String(status.listedOnTcgplayer)],
    [TCG_COPY.notListedLabel, String(status.notOnTcgplayer)],
    [TCG_COPY.waitingLabel, String(status.waitingToSendCount)],
    [TCG_COPY.lastSyncedLabel, formatSyncedAt(status.lastSyncedAt)],
  ];
  const skipped = status.skipped.noTcgplayerId + status.skipped.graded;
  return (
    <section className={cardCls} aria-labelledby="tcg-status-heading">
      <h2 id="tcg-status-heading" className={headingCls}>
        {TCG_COPY.statusHeading}
      </h2>
      <dl className="mt-3 grid min-w-0 grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-w-0 items-baseline justify-between gap-3">
            <dt className={mutedCls}>{label}</dt>
            <dd className="shrink-0 text-sm font-semibold text-warm-900 dark:text-warm-100">{value}</dd>
          </div>
        ))}
      </dl>
      {skipped > 0 ? <p className={'mt-3 ' + mutedCls}>{TCG_COPY.skippedNote}</p> : null}
    </section>
  );
};

// ---------------------------------------------------------------------------------------------
// 2 Export
// ---------------------------------------------------------------------------------------------

type Flash = { kind: 'ok' | 'info' | 'error'; text: string } | null;

const ExportCard: React.FC<{ saleId: string; status: TcgStatus; onChanged: () => void }> = ({ saleId, status, onChanged }) => {
  const [choices, setChoices] = useState<ExportChoices>(DEFAULT_EXPORT_CHOICES);
  const [flash, setFlash] = useState<Flash>(null);

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/card-tcgplayer/' + encodeURIComponent(saleId) + '/export', choices);
      const out = readExport(res.data);
      if (!out) throw new Error('Unreadable export');
      return out;
    },
    onSuccess: (out) => {
      if (out.csv === null || out.rowCount === 0) {
        setFlash({ kind: 'info', text: TCG_COPY.exportNothing });
      } else if (saveTextFile(out.fileName, out.csv)) {
        setFlash({ kind: 'ok', text: TCG_COPY.counterDownloaded });
      } else {
        setFlash({ kind: 'error', text: TCG_COPY.exportFailed });
      }
      onChanged();
    },
    onError: (err) => setFlash({ kind: 'error', text: tcgErrorSentence(err) }),
  });

  const uploadedMutation = useMutation({
    mutationFn: async () => {
      await api.post('/card-tcgplayer/' + encodeURIComponent(saleId) + '/export/uploaded', {});
    },
    onSuccess: () => {
      setFlash(null);
      onChanged();
    },
    onError: (err) => setFlash({ kind: 'error', text: tcgErrorSentence(err) }),
  });

  const flashCls = flash ? (flash.kind === 'ok' ? noticeOkCls : flash.kind === 'info' ? noticeInfoCls : noticeErrorCls) : '';
  const waiting = status.waitingToSend;

  return (
    <section className={cardCls} aria-labelledby="tcg-export-heading">
      <h2 id="tcg-export-heading" className={headingCls}>
        {TCG_COPY.exportHeading}
      </h2>
      <p className={'mt-2 ' + mutedCls}>{TCG_COPY.exportIntro}</p>

      <details className="mt-3 min-w-0">
        <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-medium text-amber-700 dark:text-amber-400">{TCG_COPY.optionsHeading}</summary>
        <div className="mt-2 min-w-0 space-y-2">
          <label className={checkboxRow}>
            <input
              type="checkbox"
              className={checkboxCls}
              checked={choices.includeNew}
              onChange={(e) => setChoices({ ...choices, includeNew: e.target.checked })}
            />
            <span className="min-w-0 text-sm text-warm-800 dark:text-warm-200">
              {TCG_COPY.includeNewLabel}
              <span className={'block ' + mutedCls}>{TCG_COPY.includeNewHelp}</span>
            </span>
          </label>
          <label className={checkboxRow}>
            <input
              type="checkbox"
              className={checkboxCls}
              checked={choices.includePrices}
              onChange={(e) => setChoices({ ...choices, includePrices: e.target.checked })}
            />
            <span className="min-w-0 text-sm text-warm-800 dark:text-warm-200">
              {TCG_COPY.includePricesLabel}
              <span className={'block ' + mutedCls}>{TCG_COPY.includePricesHelp}</span>
            </span>
          </label>
          <div>
            <label htmlFor="tcg-quantity-style" className={labelCls}>
              {TCG_COPY.quantityLabel}
            </label>
            <select
              id="tcg-quantity-style"
              className={inputCls}
              value={choices.quantityColumn}
              onChange={(e) => setChoices({ ...choices, quantityColumn: e.target.value === 'TOTAL' ? 'TOTAL' : 'ADD' })}
            >
              <option value="ADD">{TCG_COPY.quantityAdd}</option>
              <option value="TOTAL">{TCG_COPY.quantityTotal}</option>
            </select>
            <p className={'mt-1 ' + mutedCls}>{TCG_COPY.quantityHelp}</p>
          </div>
        </div>
      </details>

      <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <button type="button" className={primaryBtn} disabled={exportMutation.isPending} onClick={() => exportMutation.mutate()}>
          {exportMutation.isPending ? TCG_COPY.exportWorking : TCG_COPY.exportButton}
        </button>
        {status.exportWaiting ? (
          <button type="button" className={secondaryBtn} disabled={uploadedMutation.isPending} onClick={() => uploadedMutation.mutate()}>
            {uploadedMutation.isPending ? TCG_COPY.uploadedWorking : TCG_COPY.uploadedButton}
          </button>
        ) : null}
      </div>
      {status.exportWaiting ? <p className={'mt-2 ' + mutedCls}>{TCG_COPY.uploadedHint}</p> : null}
      {flash ? (
        <p role={flash.kind === 'error' ? 'alert' : 'status'} className={'mt-3 ' + flashCls}>
          {flash.text}
        </p>
      ) : null}

      <h3 className="mt-6 text-base font-semibold text-warm-900 dark:text-warm-100">{TCG_COPY.waitingHeading}</h3>
      {waiting.length === 0 ? (
        <p className={'mt-2 ' + mutedCls}>{TCG_COPY.waitingEmpty}</p>
      ) : (
        <>
          <ul className="mt-2 min-w-0 divide-y divide-warm-200 dark:divide-gray-700">
            {waiting.map((line) => (
              <li key={line.key} className="min-w-0 py-2">
                <p className="break-words text-sm font-medium text-warm-900 dark:text-warm-100">{cardLabel(line)}</p>
                <p className={mutedCls}>
                  {TCG_COPY.colHere + ' ' + line.available + ', ' + TCG_COPY.colTcgplayer + ' ' + line.onTcgplayer + ', ' + TCG_COPY.colToSend + ' ' + signed(line.toSend)}
                </p>
              </li>
            ))}
          </ul>
          {status.waitingToSendCount > waiting.length ? <p className={'mt-2 ' + mutedCls}>{TCG_COPY.waitingMore}</p> : null}
        </>
      )}
    </section>
  );
};

// ---------------------------------------------------------------------------------------------
// 3 Reconcile
// ---------------------------------------------------------------------------------------------

const ReconcileCard: React.FC<{ saleId: string; status: TcgStatus; onChanged: () => void }> = ({ saleId, status, onChanged }) => {
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [uploaded, setUploaded] = useState<boolean | null>(null);
  const [firstSync, setFirstSync] = useState<FirstSyncChoice>('FLAG_ONLY');
  const [report, setReport] = useState<ReconcileReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (step: 'preview' | 'apply'): Promise<ReconcileReportDto> => {
    if (!file) throw new Error('No file');
    const form = buildForm(reconcileFields({ exportWaiting: status.exportWaiting, uploaded, firstSync }), file, file.name);
    const res = await api.post(reconcileUrl(saleId, step), form, { headers: { 'Content-Type': 'multipart/form-data' } });
    const out = readReconcileReport(res.data);
    if (!out) throw new Error('Unreadable report');
    return out;
  };

  const previewMutation = useMutation({
    mutationFn: () => send('preview'),
    onSuccess: (out) => {
      setError(null);
      setReport(out);
    },
    onError: (err) => {
      setReport(null);
      setError(tcgErrorSentence(err));
    },
  });

  const applyMutation = useMutation({
    mutationFn: () => send('apply'),
    onSuccess: (out) => {
      setError(null);
      setReport(out);
      setFile(null);
      setFileKey((k) => k + 1);
      setUploaded(null);
      onChanged();
    },
    onError: (err) => setError(tcgErrorSentence(err)),
  });

  const busy = previewMutation.isPending || applyMutation.isPending;
  const mustAnswer = needsUploadedAnswer(status.exportWaiting, uploaded);
  const canPreview = !!file && !mustAnswer && !busy;
  const isPreview = !!report && !report.applied;

  const startOver = () => {
    setFile(null);
    setFileKey((k) => k + 1);
    setUploaded(null);
    setReport(null);
    setError(null);
  };

  return (
    <section className={cardCls} aria-labelledby="tcg-reconcile-heading">
      <h2 id="tcg-reconcile-heading" className={headingCls}>
        {TCG_COPY.reconcileHeading}
      </h2>
      <p className={'mt-2 ' + mutedCls}>{TCG_COPY.reconcileIntro}</p>

      <div className="mt-4 min-w-0">
        <label htmlFor="tcg-file" className={labelCls}>
          {TCG_COPY.fileLabel}
        </label>
        <input
          key={fileKey}
          id="tcg-file"
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/plain"
          className={inputCls}
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null);
            setReport(null);
            setError(null);
          }}
        />
      </div>

      {status.exportWaiting ? (
        <fieldset className="mt-4 min-w-0" disabled={busy}>
          <legend className={labelCls}>{TCG_COPY.uploadedQuestion}</legend>
          <div className="flex min-w-0 flex-col gap-1">
            <label className={checkboxRow}>
              <input type="radio" name="tcg-uploaded" className={checkboxCls} checked={uploaded === true} onChange={() => { setUploaded(true); setReport(null); }} />
              <span className="text-sm text-warm-800 dark:text-warm-200">{TCG_COPY.uploadedYes}</span>
            </label>
            <label className={checkboxRow}>
              <input type="radio" name="tcg-uploaded" className={checkboxCls} checked={uploaded === false} onChange={() => { setUploaded(false); setReport(null); }} />
              <span className="text-sm text-warm-800 dark:text-warm-200">{TCG_COPY.uploadedNo}</span>
            </label>
          </div>
          <p className={mutedCls}>{TCG_COPY.uploadedQuestionHelp}</p>
        </fieldset>
      ) : null}

      <fieldset className="mt-4 min-w-0" disabled={busy}>
        <legend className={labelCls}>{TCG_COPY.firstSyncQuestion}</legend>
        <div className="flex min-w-0 flex-col gap-1">
          <label className={checkboxRow}>
            <input type="radio" name="tcg-first-sync" className={checkboxCls} checked={firstSync === 'FLAG_ONLY'} onChange={() => { setFirstSync('FLAG_ONLY'); setReport(null); }} />
            <span className="text-sm text-warm-800 dark:text-warm-200">{TCG_COPY.firstSyncKeep}</span>
          </label>
          <label className={checkboxRow}>
            <input type="radio" name="tcg-first-sync" className={checkboxCls} checked={firstSync === 'ADOPT_TCGPLAYER'} onChange={() => { setFirstSync('ADOPT_TCGPLAYER'); setReport(null); }} />
            <span className="text-sm text-warm-800 dark:text-warm-200">{TCG_COPY.firstSyncAdopt}</span>
          </label>
        </div>
      </fieldset>

      <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <button type="button" className={isPreview ? secondaryBtn : primaryBtn} disabled={!canPreview} onClick={() => previewMutation.mutate()}>
          {previewMutation.isPending ? TCG_COPY.previewWorking : TCG_COPY.previewButton}
        </button>
        {isPreview && report && reportHasChanges(report) ? (
          <button type="button" className={primaryBtn} disabled={busy} onClick={() => applyMutation.mutate()}>
            {applyMutation.isPending ? TCG_COPY.applyWorking : TCG_COPY.applyButton}
          </button>
        ) : null}
        {report || file ? (
          <button type="button" className={secondaryBtn} disabled={busy} onClick={startOver}>
            {TCG_COPY.startOver}
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className={'mt-3 ' + noticeErrorCls}>
          {error}
        </p>
      ) : null}
      {report ? <ReportView report={report} /> : null}
    </section>
  );
};

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------

const ReportView: React.FC<{ report: ReconcileReportDto }> = ({ report }) => {
  const sentences = reportSentences(report);
  const changed = report.changes.filter((c) => c.kind !== 'IN_SYNC');
  const changedTotal = report.totals.decreased + report.totals.increased + report.totals.needsNewItem;
  return (
    <div className="mt-4 min-w-0 space-y-4" data-testid="tcgplayer-report">
      <h3 className="text-base font-semibold text-warm-900 dark:text-warm-100">{report.applied ? TCG_COPY.reportAppliedHeading : TCG_COPY.reportPreviewHeading}</h3>
      {sentences.length === 0 ? (
        <p role="status" className={noticeOkCls}>
          {TCG_COPY.reportNothing}
        </p>
      ) : (
        <ul role="status" className={'list-disc space-y-1 pl-6 ' + noticeInfoCls}>
          {sentences.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}

      {changed.length > 0 ? (
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-warm-900 dark:text-warm-100">{TCG_COPY.reportCardsHeading}</h4>
          <ul className="mt-1 min-w-0 divide-y divide-warm-200 dark:divide-gray-700">
            {changed.map((c) => (
              <li key={c.key} className="min-w-0 py-2">
                <p className="break-words text-sm font-medium text-warm-900 dark:text-warm-100">{cardLabel(c)}</p>
                <p className={mutedCls}>
                  {TCG_COPY.colFile + ' ' + c.fileTotal + ', ' + TCG_COPY.colHere + ' ' + c.available + ', ' + TCG_COPY.colAfter + ' ' + c.availableAfter}
                </p>
                {c.note ? <p className={mutedCls}>{c.note}</p> : null}
              </li>
            ))}
          </ul>
          {changedTotal > changed.length ? <p className={'mt-1 ' + mutedCls}>{TCG_COPY.reportMoreCards}</p> : null}
        </div>
      ) : null}

      {report.notInFindasale.length > 0 ? (
        <div className={'min-w-0 ' + noticeWarnCls}>
          <h4 className="text-sm font-semibold">{TCG_COPY.reportNotHereHeading}</h4>
          <p>{TCG_COPY.reportNotHereHelp}</p>
          <ul className="mt-1 list-disc pl-6">
            {report.notInFindasale.map((n) => (
              <li key={n.row + ':' + n.productId + ':' + n.condition} className="break-words">
                {'TCGplayer ID ' + n.productId + (n.condition ? ', ' + n.condition : '') + ', ' + n.total + ' in file'}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.listedButMissing.length > 0 ? (
        <div className={'min-w-0 ' + noticeWarnCls}>
          <h4 className="text-sm font-semibold">{TCG_COPY.reportMissingHeading}</h4>
          <p>{TCG_COPY.reportMissingHelp}</p>
          <ul className="mt-1 list-disc pl-6">
            {report.listedButMissing.map((m) => (
              <li key={m.key} className="break-words">
                {cardLabel(m)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.duplicateKeys.length > 0 ? (
        <div className={'min-w-0 ' + noticeWarnCls}>
          <h4 className="text-sm font-semibold">{TCG_COPY.reportDuplicatesHeading}</h4>
          <p>{TCG_COPY.reportDuplicatesHelp}</p>
          <ul className="mt-1 list-disc pl-6">
            {report.duplicateKeys.map((d) => (
              <li key={d.key} className="break-words">
                {'Rows ' + d.rows.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.problems.length > 0 ? (
        <div className={'min-w-0 ' + noticeWarnCls}>
          <h4 className="text-sm font-semibold">{TCG_COPY.reportProblemsHeading}</h4>
          <ul className="mt-1 list-disc pl-6">
            {report.problems.map((p) => (
              <li key={p.row + ':' + p.message} className="break-words">
                {'Row ' + p.row + ': ' + p.message}
              </li>
            ))}
          </ul>
          {report.problemCount > report.problems.length ? <p className="mt-1">{TCG_COPY.reportProblemsMore}</p> : null}
        </div>
      ) : null}
    </div>
  );
};

export default SyncPanel;
