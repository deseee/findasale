import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Download } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import {
  csApi,
  csKeys,
  MarkPaidBody,
  useSettlementBatch,
  useSettlementPreview,
} from '../../hooks/useConsignorSettlement';
import {
  LIVE_BATCH_STATUSES,
  PayoutRow,
  buildBatchRows,
  buildPreviewRows,
  errMsg,
  fmtDate,
  fmtMoney,
  isLegacyBatchStatus,
  batchStatusLabel,
} from '../../lib/types/consignorSettlement';
import LockedPlaceholder from './LockedPlaceholder';
import PayoutRowsTable, { RunPhase } from './PayoutRowsTable';
import MarkPaidDialog from './MarkPaidDialog';
import ApproveDialog from './ApproveDialog';
import ReasonDialog from './ReasonDialog';
import StatementPrintDialog from './StatementPrintDialog';
import {
  BatchStatusBadge,
  NoMoneyBanner,
  btnOutline,
  btnPrimary,
  btnSecondary,
  btnDanger,
} from './ui';

/**
 * Consignor payouts page body, shared by /organizer/consignor-settlement (every sale) and
 * /organizer/consignor-settlement/[saleId] (one sale).
 *
 * Tier handling: below TEAMS this renders a static locked placeholder and mounts nothing that
 * fetches, so a SIMPLE or PRO organizer makes zero requests and never sees an error.
 */

interface Notice {
  tone: 'success' | 'info' | 'error';
  text: string;
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'approve' }
  | { kind: 'cancelRun' }
  | { kind: 'markPaid'; row: PayoutRow }
  | { kind: 'undo'; row: PayoutRow }
  | { kind: 'print'; rows: PayoutRow[] };

const noticeClass: Record<Notice['tone'], string> = {
  success:
    'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300',
  info: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300',
  error: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300',
};

const ConsignorPayoutsContent: React.FC<{ saleId?: string }> = ({ saleId }) => {
  const qc = useQueryClient();
  const [batchOverride, setBatchOverride] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  // enabled=true here is safe: this component only mounts for TEAMS organizers (see wrapper below).
  const preview = useSettlementPreview({ saleId }, true);
  const detectedId = preview.data ? preview.data.openBatchId : null;
  const activeBatchId = batchOverride || detectedId;
  const batchQ = useSettlementBatch(activeBatchId, true);

  const previewData = preview.data;
  const batch = activeBatchId && batchQ.data ? batchQ.data : null;
  const lines = previewData ? previewData.unsettled : [];

  const rows: PayoutRow[] = useMemo(
    () => (batch ? buildBatchRows(batch, lines) : buildPreviewRows(lines)),
    [batch, lines]
  );

  const phase: RunPhase = !batch
    ? 'none'
    : batch.legacy
    ? 'closed'
    : batch.status === 'DRAFT'
    ? 'draft'
    : LIVE_BATCH_STATUSES.indexOf(batch.status) !== -1
    ? 'live'
    : 'closed';

  const refetchAll = async () => {
    await qc.invalidateQueries({ queryKey: csKeys.all });
  };

  const retry = () => {
    preview.refetch();
    if (activeBatchId) batchQ.refetch();
  };

  /** Runs an action, shows any failure inline (never as a toast), then refreshes data. */
  const run = async (fn: () => Promise<Notice | null | void>, failure: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const n = await fn();
      if (n) setNotice(n);
      await refetchAll();
    } catch (e: any) {
      setNotice({ tone: 'error', text: errMsg(e, failure) });
    } finally {
      setBusy(false);
    }
  };

  // ---- derived numbers -------------------------------------------------------------------
  const sum = (pred: (r: PayoutRow) => boolean) =>
    rows.filter(pred).reduce((s, r) => s + r.net, 0);
  const count = (pred: (r: PayoutRow) => boolean) => rows.filter(pred).length;
  const isOwed = (r: PayoutRow) => r.status === 'PENDING';
  const isHold = (r: PayoutRow) => r.status === 'ON_HOLD';
  const isPaid = (r: PayoutRow) => r.status === 'PAID';

  const liveNewItems = lines.reduce((s, l) => s + l.itemCount, 0);
  const liveNewAmount = lines.reduce((s, l) => s + l.net, 0);
  const showNewSales =
    !!batch && phase === 'live' && lines.length > 0 && liveNewItems > 0;

  const emailCount = rows.filter((r) => r.status !== 'VOID' && !!r.email).length;
  const emailKnown = rows.some((r) => r.emailKnown);
  // Lines in this run that sold for a different amount than the tag price: approving needs an acknowledgement.
  const varianceCount = batch
    ? batch.payouts.reduce((n, p) => n + (p.items || []).filter((i) => i.varianceFlag === true).length, 0)
    : 0;

  // ---- handlers --------------------------------------------------------------------------
  const startRun = () =>
    run(async () => {
      const res = await csApi.createRun(saleId ? { saleId } : {});
      setBatchOverride(res.batchId);
      setExpanded({});
      return res.existing
        ? { tone: 'info', text: 'Some of these sales are already in a payout run. Showing that run.' }
        : { tone: 'success', text: 'Payout run created. Review the amounts, then approve the statements.' };
    }, 'We could not create the payout run.');

  const refreshRun = () =>
    run(async () => {
      if (!batch) return null;
      const d = await csApi.refresh(batch.id);
      if (d.added + d.removed + d.changed === 0) {
        return { tone: 'info', text: 'Nothing has changed since this run was created.' };
      }
      return {
        tone: 'success',
        text: `Sales refreshed. Added ${d.added}, removed ${d.removed}, changed ${d.changed}.`,
      };
    }, 'We could not refresh the sales.');

  const doApprove = async (sendStatements: boolean, acknowledgeVariance: boolean) => {
    if (!batch) return;
    await csApi.approve(batch.id, { sendStatements, acknowledgeVariance });
    setDialog({ kind: 'none' });
    setNotice({
      tone: 'success',
      text: sendStatements
        ? 'Statements approved and emailed where an address is on file. Amounts are locked.'
        : 'Statements approved. Amounts are locked.',
    });
    await refetchAll();
  };

  const doCancelRun = async (reason: string) => {
    if (!batch) return;
    await csApi.cancel(batch.id, reason);
    setDialog({ kind: 'none' });
    setBatchOverride(null);
    setNotice({ tone: 'info', text: 'Payout run cancelled. Those sales are owed again.' });
    await refetchAll();
  };

  const doMarkPaid = async (row: PayoutRow, body: MarkPaidBody) => {
    if (!row.payoutId) return;
    await csApi.markPaid(row.payoutId, body);
    setDialog({ kind: 'none' });
    setNotice({ tone: 'success', text: `Payment recorded for ${row.name}.` });
    await refetchAll();
  };

  const doUndo = async (row: PayoutRow, reason: string) => {
    if (!row.payoutId) return;
    await csApi.undoPaid(row.payoutId, reason);
    setDialog({ kind: 'none' });
    setNotice({ tone: 'info', text: `Payment record removed for ${row.name}. They show as owed again.` });
    await refetchAll();
  };

  const doHold = (row: PayoutRow) =>
    run(async () => {
      if (!row.payoutId) return null;
      await csApi.hold(row.payoutId);
      return { tone: 'info', text: `${row.name} is on hold.` };
    }, 'We could not put this payout on hold.');

  const doRelease = (row: PayoutRow) =>
    run(async () => {
      if (!row.payoutId) return null;
      await csApi.release(row.payoutId);
      return { tone: 'success', text: `${row.name} is no longer on hold.` };
    }, 'We could not release this payout.');

  const doSend = (row: PayoutRow) =>
    run(async () => {
      if (!row.payoutId) return null;
      const r = await csApi.sendStatement(row.payoutId);
      if (r.sent) return { tone: 'success', text: `Statement emailed to ${row.name}.` };
      return {
        tone: 'info',
        text: `Statement not emailed${r.reason ? ': ' + r.reason : ''}. You can print it instead.`,
      };
    }, 'We could not send the statement.');

  const downloadCsv = () =>
    run(async () => {
      if (!batch) return null;
      await csApi.download(`/${encodeURIComponent(batch.id)}/export.csv`, `consignor-payouts-${batch.id}.csv`);
      return null;
    }, 'We could not download the CSV.');

  const downloadPdfs = async () => {
    if (!batch) return;
    const targets = rows.filter((r) => r.payoutId && r.status !== 'VOID');
    if (targets.length === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        const safe = t.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'consignor';
        await csApi.download(`/payouts/${encodeURIComponent(t.payoutId as string)}/statement.pdf`, `statement-${safe}.pdf`);
      }
    } catch (e: any) {
      // PDF is not available right now: fall back to the browser print view.
      setNotice({
        tone: 'info',
        text: 'PDF download is not available right now. Use the print view and choose Save as PDF.',
      });
      setDialog({ kind: 'print', rows: targets });
    } finally {
      setBusy(false);
    }
  };

  // ---- render ----------------------------------------------------------------------------
  const backTo = (
    <Link
      href="/organizer/consignors"
      className="inline-flex items-center min-h-[44px] text-sm text-amber-700 dark:text-amber-400 hover:underline mb-2"
    >
      &larr; Back to Consignors
    </Link>
  );

  const saleTitle = saleId
    ? (previewData && previewData.saleTitle) || (batch && batch.saleTitle) || 'This sale'
    : 'All sales';

  const header = (
    <>
      {backTo}
      <h1 className="text-3xl font-bold text-warm-900 dark:text-white">Consignor payouts</h1>
      <p className="text-warm-600 dark:text-warm-400 mt-1 mb-6">
        {saleTitle}. Work out what each consignor is owed, send them a statement, and record each payment
        once you have paid them.
      </p>
      <NoMoneyBanner />
    </>
  );

  const loadFailed = preview.isError || (!!activeBatchId && batchQ.isError);
  const loading =
    preview.isLoading || (!!activeBatchId && batchQ.isLoading && !batchQ.data);

  if (loadFailed) {
    const err = preview.isError ? preview.error : batchQ.error;
    return (
      <>
        {header}
        <div
          role="alert"
          className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-5"
        >
          <p className="font-bold text-red-800 dark:text-red-300 mb-1">We could not load consignor payouts.</p>
          <p className="text-sm text-red-700 dark:text-red-400 mb-4">
            {errMsg(err, 'Something went wrong on our side. Your records are safe.')}
          </p>
          <button type="button" onClick={retry} className={btnPrimary}>
            Retry
          </button>
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        {header}
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-warm-200 dark:bg-gray-700 animate-pulse" />
            ))}
          </div>
          <div className="h-40 rounded-xl bg-warm-200 dark:bg-gray-700 animate-pulse" />
          <p className="text-sm text-warm-600 dark:text-warm-400">Loading consignor payouts...</p>
        </div>
      </>
    );
  }

  const priorRuns = previewData ? previewData.priorRuns : [];
  const nothingOwed = rows.length === 0;
  const noRunAndNothing = !batch && nothingOwed;

  return (
    <>
      {header}

      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`mb-4 flex items-start justify-between gap-3 rounded-lg border p-3 text-sm ${noticeClass[notice.tone]}`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="min-h-[44px] min-w-[44px] -my-2 -mr-2 font-bold"
            aria-label="Dismiss message"
          >
            &times;
          </button>
        </div>
      )}

      {noRunAndNothing ? (
        priorRuns.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 sm:p-12 text-center border border-warm-200 dark:border-gray-700">
            <p className="text-warm-600 dark:text-warm-400 mb-6">
              No unpaid consignor sales yet. When an item you are holding for a consignor sells, it shows up
              here.
            </p>
            <Link href="/organizer/consignors" className={btnPrimary}>
              Go to Consignors
            </Link>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center border border-warm-200 dark:border-gray-700 mb-6">
            <p className="text-lg font-bold text-warm-900 dark:text-white">Everything is paid up.</p>
            <p className="text-sm text-warm-600 dark:text-warm-400 mt-1">
              New consignor sales will show up here as they happen.
            </p>
          </div>
        )
      ) : (
        <>
          {/* Summary chips */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 sm:p-4">
              <div className="text-xs font-bold uppercase text-amber-800 dark:text-amber-300">Owed</div>
              <div className="text-base sm:text-xl font-bold text-warm-900 dark:text-white break-words">
                {fmtMoney(sum(isOwed))}
              </div>
              <div className="text-xs text-warm-600 dark:text-warm-400">{count(isOwed)} consignors</div>
            </div>
            <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3 sm:p-4">
              <div className="text-xs font-bold uppercase text-green-800 dark:text-green-300">Paid</div>
              <div className="text-base sm:text-xl font-bold text-warm-900 dark:text-white break-words">
                {fmtMoney(sum(isPaid))}
              </div>
              <div className="text-xs text-warm-600 dark:text-warm-400">{count(isPaid)} consignors</div>
            </div>
            <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 p-3 sm:p-4">
              <div className="text-xs font-bold uppercase text-purple-800 dark:text-purple-300">On hold</div>
              <div className="text-base sm:text-xl font-bold text-warm-900 dark:text-white break-words">
                {fmtMoney(sum(isHold))}
              </div>
              <div className="text-xs text-warm-600 dark:text-warm-400">{count(isHold)} consignors</div>
            </div>
          </div>

          {/* Run header + run-level buttons */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div className="text-sm text-warm-600 dark:text-warm-400 flex flex-wrap items-center gap-2">
              {batch ? (
                <>
                  <span className="font-bold text-warm-900 dark:text-white">Payout run</span>
                  <BatchStatusBadge status={batch.legacy ? 'LEGACY' : batch.status} />
                  {batch.createdAt && fmtDate(batch.createdAt) && <span>Created {fmtDate(batch.createdAt)}</span>}
                  {!saleId && batch.saleTitle && <span>for {batch.saleTitle}</span>}
                </>
              ) : (
                <span>No payout run yet. These sales are not in a run.</span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {phase === 'none' && (
                <button type="button" disabled={busy} onClick={startRun} className={btnPrimary}>
                  Create payout run
                </button>
              )}
              {phase === 'draft' && (
                <>
                  <button type="button" disabled={busy} onClick={refreshRun} className={btnSecondary}>
                    <RefreshCw className="w-4 h-4" aria-hidden="true" />
                    Refresh sales
                  </button>
                  <button
                    type="button"
                    disabled={busy || rows.length === 0}
                    onClick={() => setDialog({ kind: 'approve' })}
                    className={btnPrimary}
                  >
                    Approve statements
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDialog({ kind: 'cancelRun' })}
                    className={btnDanger}
                  >
                    Cancel run
                  </button>
                </>
              )}
              {phase === 'live' && (
                <>
                  <button type="button" disabled={busy} onClick={downloadPdfs} className={btnSecondary}>
                    <Download className="w-4 h-4" aria-hidden="true" />
                    Download statements (PDF)
                  </button>
                  <button type="button" disabled={busy} onClick={downloadCsv} className={btnSecondary}>
                    <Download className="w-4 h-4" aria-hidden="true" />
                    Download CSV
                  </button>
                </>
              )}
            </div>
          </div>

          {phase === 'closed' && batch && (
            <p className="mb-4 text-sm text-warm-600 dark:text-warm-400">
              {batch.legacy || isLegacyBatchStatus(batch.status)
                ? 'This run was made before payouts moved to recording payments by hand. It is here for your records and cannot be changed.'
                : 'This run was cancelled. Its sales are owed again and will appear in your next run.'}
            </p>
          )}

          {showNewSales && (
            <div className="mb-4 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-amber-900 dark:text-amber-200 font-bold">
                New sales since approval: {liveNewItems} {liveNewItems === 1 ? 'item' : 'items'},{' '}
                {fmtMoney(liveNewAmount)}
              </p>
              <button type="button" disabled={busy} onClick={startRun} className={btnPrimary}>
                Start another payout run
              </button>
            </div>
          )}

          {batch && phase === 'live' && batch.status === 'PAID' && !showNewSales && (
            <p className="mb-4 text-sm font-bold text-green-700 dark:text-green-400">Everything is paid up.</p>
          )}

          {rows.length > 0 && (
            <PayoutRowsTable
              rows={rows}
              phase={phase}
              expanded={expanded}
              onToggle={(k) => setExpanded((prev) => ({ ...prev, [k]: !prev[k] }))}
              busy={busy}
              onMarkPaid={(row) => setDialog({ kind: 'markPaid', row })}
              onSendStatement={doSend}
              onHold={doHold}
              onRelease={doRelease}
              onUndo={(row) => setDialog({ kind: 'undo', row })}
              onPrint={(row) => setDialog({ kind: 'print', rows: [row] })}
            />
          )}
        </>
      )}

      {/* Earlier runs */}
      {priorRuns.length > 0 && (
        <section className="mt-8" aria-labelledby="prior-runs-title">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h2 id="prior-runs-title" className="text-lg font-bold text-warm-900 dark:text-white">
              Earlier payout runs
            </h2>
            {batchOverride && (
              <button type="button" onClick={() => setBatchOverride(null)} className={btnOutline}>
                Back to current
              </button>
            )}
          </div>
          <ul className="bg-white dark:bg-gray-800 rounded-xl border border-warm-200 dark:border-gray-700 divide-y divide-warm-200 dark:divide-gray-700">
            {priorRuns.map((run) => (
              <li key={run.id} className="p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-warm-900 dark:text-white">
                  <span className="font-medium">{fmtDate(run.createdAt) || 'Payout run'}</span>
                  <span className="text-warm-500 dark:text-warm-400">
                    {' '}
                    {batchStatusLabel(run.status)}, {fmtMoney(run.totalNet)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setBatchOverride(run.id);
                    setExpanded({});
                  }}
                  disabled={activeBatchId === run.id}
                  className={btnOutline}
                >
                  {activeBatchId === run.id ? 'Showing' : 'Open'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Dialogs */}
      {dialog.kind === 'approve' && (
        <ApproveDialog
          emailCount={emailCount}
          emailKnown={emailKnown}
          varianceCount={varianceCount}
          onClose={() => setDialog({ kind: 'none' })}
          onConfirm={doApprove}
        />
      )}
      {dialog.kind === 'cancelRun' && (
        <ReasonDialog
          title="Cancel this payout run?"
          body="Nothing has been paid in this run. Its sales go back to owed and can go into a new run."
          confirmLabel="Cancel run"
          cancelLabel="Keep run"
          danger
          onClose={() => setDialog({ kind: 'none' })}
          onConfirm={doCancelRun}
        />
      )}
      {dialog.kind === 'markPaid' && (
        <MarkPaidDialog
          row={dialog.row}
          onClose={() => setDialog({ kind: 'none' })}
          onConfirm={(body) => doMarkPaid(dialog.row, body)}
        />
      )}
      {dialog.kind === 'undo' && (
        <ReasonDialog
          title="Undo this payment record?"
          body={`${dialog.row.name} will show as owed again. This only changes your records. It does not move any money.`}
          confirmLabel="Undo payment record"
          onClose={() => setDialog({ kind: 'none' })}
          onConfirm={(reason) => doUndo(dialog.row, reason)}
        />
      )}
      {dialog.kind === 'print' && (
        <StatementPrintDialog
          payouts={dialog.rows.filter((r) => !!r.payoutId).map((r) => ({ id: r.payoutId as string, name: r.name }))}
          onClose={() => setDialog({ kind: 'none' })}
        />
      )}
    </>
  );
};

/** Page body. Handles auth and the TEAMS gate BEFORE anything that fetches is mounted. */
const ConsignorPayoutsView: React.FC<{ saleId?: string }> = ({ saleId }) => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { canAccess, tierLoading, tierKnown } = useOrganizerTier();

  const isOrganizer = !!user && !!user.roles && user.roles.indexOf('ORGANIZER') !== -1;

  useEffect(() => {
    if (!authLoading && !isOrganizer) {
      router.push('/login');
    }
  }, [authLoading, isOrganizer, router]);

  if (authLoading || tierLoading) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-warm-600 dark:text-warm-400">Loading...</p>
      </div>
    );
  }
  if (!isOrganizer) return null;

  if (!canAccess('TEAMS')) {
    return <LockedPlaceholder tierKnown={tierKnown} />;
  }

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <ConsignorPayoutsContent saleId={saleId} key={saleId || 'all'} />
      </div>
    </div>
  );
};

export default ConsignorPayoutsView;
