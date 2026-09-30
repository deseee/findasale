import React, { useRef, useState } from 'react';
import Link from 'next/link';
import {
  csApi,
  MarkPaidBody,
  useSettlementPreview,
} from '../hooks/useConsignorSettlement';
import {
  Batch,
  LIVE_BATCH_STATUSES,
  errMsg,
  fmtDate,
  fmtMoney,
  methodLabel,
} from '../lib/types/consignorSettlement';
import MarkPaidFields from './consignor-payouts/MarkPaidFields';
import { ModalShell, btnOutline, btnPrimary } from './consignor-payouts/ui';

/**
 * Record a payment.
 *
 * You pay the consignor yourself (cash, check, Square, bank transfer, other) and record it here.
 * FindA.Sale does not send or hold any money. Recording a payment puts the consignor's unpaid sales
 * into a payout run, locks the amounts, and marks that payment as paid, using the same
 * mark-paid flow as the Consignor payouts page.
 *
 * Only open this for TEAMS organizers: it fetches as soon as it mounts.
 */

interface ConsignorPayoutModalProps {
  consignorId: string;
  consignorName: string;
  commissionRate: number;
  /** Stored payout preference, used to pre-fill "Paid by". */
  preferredPayoutMethod?: string | null;
  email?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface Recorded {
  amount: number;
  method: string;
  paidAt: string;
}

/** Marks an error that should be shown as a "go finish this in the run" message, not a failure. */
const blockedError = (message: string, href: string): Error => {
  const err: any = new Error(message);
  err.blockedHref = href;
  return err as Error;
};

const ConsignorPayoutModal: React.FC<ConsignorPayoutModalProps> = ({
  consignorId,
  consignorName,
  commissionRate,
  preferredPayoutMethod,
  email,
  onClose,
  onSuccess,
}) => {
  const preview = useSettlementPreview({ consignorId }, true);
  const [recorded, setRecorded] = useState<Recorded | null>(null);
  const [blocked, setBlocked] = useState<{ message: string; href: string } | null>(null);

  const lines = preview.data ? preview.data.unsettled : [];
  const line = lines.filter((l) => l.consignorId === consignorId)[0] || (lines.length === 1 ? lines[0] : null);
  const owed = line ? line.net : 0;
  const preferred = preferredPayoutMethod || (line ? line.preferredPayoutMethod : null);
  const hasEmail = !!email || (line ? !!line.email : false);
  const emailKnown = email !== undefined || (line ? line.emailKnown : false);

  // The focus trap can call onClose again while unmounting, so closing must be idempotent.
  const closedRef = useRef(false);
  const close = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (recorded) onSuccess();
    onClose();
  };

  const record = async (body: MarkPaidBody) => {
    setBlocked(null);
    try {
      // 1. Put this consignor's unpaid sales into a run (or find the run they are already in).
      const created = await csApi.createRun({ consignorIds: [consignorId] });
      const batch: Batch = await csApi.batch(created.batchId);
      const payout = batch.payouts.filter((p) => p.consignorId === consignorId)[0];
      if (!payout || !payout.id) {
        throw new Error('We could not find this consignor in the payout run. Please try again.');
      }
      if (payout.status === 'PAID') {
        throw new Error('This consignor is already recorded as paid in that payout run.');
      }
      if (Math.abs(payout.netPayout - owed) > 0.005) {
        throw new Error('The amount owed changed. Close this window and open it again to see the new amount.');
      }

      // 2. Lock the amounts if the run has not been approved yet.
      const runHref = batch.saleId
        ? `/organizer/consignor-settlement/${batch.saleId}`
        : '/organizer/consignor-settlement';
      if (batch.status === 'DRAFT') {
        if (batch.payouts.length > 1) {
          // Approving would lock other consignors' amounts too. Do not do that silently.
          throw blockedError(
            `${consignorName} is in a payout run with other consignors that has not been approved yet. Approve that run first, then record the payment there.`,
            runHref
          );
        }
        try {
          await csApi.approve(batch.id, { sendStatements: false });
        } catch (approveErr: any) {
          // A run with lines that sold for a different amount than the tag price needs an explicit
          // acknowledgement, which belongs on the run page, not silently inside a one-click payment.
          if (approveErr && approveErr.response && approveErr.response.data && approveErr.response.data.code === 'VARIANCE_ACK_REQUIRED') {
            throw blockedError(
              `${consignorName} has items that sold for a different amount than the tag price. Review and approve that run first, then record the payment there.`,
              runHref
            );
          }
          throw approveErr;
        }
      } else if (LIVE_BATCH_STATUSES.indexOf(batch.status) === -1) {
        throw new Error('That payout run cannot take payments right now.');
      }

      // 3. Record the payment.
      await csApi.markPaid(payout.id, body);
      setRecorded({ amount: payout.netPayout, method: body.method, paidAt: body.paidAt });
    } catch (e: any) {
      if (e && e.blockedHref) {
        setBlocked({ message: e.message, href: e.blockedHref });
        return;
      }
      throw new Error(errMsg(e, 'We could not record this payment. Please try again.'));
    }
  };

  return (
    <ModalShell titleId="consignor-payout-modal-title" onClose={close}>
      <h2 id="consignor-payout-modal-title" className="text-xl font-bold text-warm-900 dark:text-white mb-1">
        Record a payment
      </h2>
      <p className="text-sm text-warm-500 dark:text-warm-400 mb-4">
        {consignorName}, {Number(commissionRate).toFixed(1)}% to consignor
      </p>

      {recorded ? (
        <div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 mb-4">
            <p className="text-sm font-bold text-green-700 dark:text-green-400 mb-2">Payment recorded</p>
            <p className="text-2xl font-bold text-warm-900 dark:text-white">{fmtMoney(recorded.amount)}</p>
            <p className="text-sm text-warm-600 dark:text-warm-400 mt-1">
              {methodLabel(recorded.method)}
              {fmtDate(recorded.paidAt) ? `, ${fmtDate(recorded.paidAt)}` : ''}
            </p>
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <Link href="/organizer/consignor-settlement" className={btnOutline + ' flex-1'}>
              See all payouts
            </Link>
            <button type="button" onClick={close} className={btnPrimary + ' flex-1'}>
              Done
            </button>
          </div>
        </div>
      ) : preview.isLoading ? (
        <p className="text-sm text-warm-600 dark:text-warm-400" aria-busy="true">
          Loading what is owed...
        </p>
      ) : preview.isError ? (
        <div>
          <div
            role="alert"
            className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 mb-4"
          >
            <p className="text-sm text-red-700 dark:text-red-300">
              {errMsg(preview.error, 'We could not load what is owed to this consignor.')}
            </p>
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button type="button" onClick={close} className={btnOutline + ' flex-1'}>
              Close
            </button>
            <button type="button" onClick={() => preview.refetch()} className={btnPrimary + ' flex-1'}>
              Retry
            </button>
          </div>
        </div>
      ) : (!line || owed <= 0) && preview.data && (preview.data.openBatchId || preview.data.hasOpenPayout) ? (
        <div>
          <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
            {consignorName} is already in a payout run that is still open. Record the payment from that run.
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button type="button" onClick={close} className={btnOutline + ' flex-1'}>
              Close
            </button>
            <Link href="/organizer/consignor-settlement" className={btnPrimary + ' flex-1'}>
              Open payout runs
            </Link>
          </div>
        </div>
      ) : !line || owed <= 0 ? (
        <div>
          <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
            Nothing is owed to {consignorName} right now. When an item you are holding for them sells, it
            shows up here.
          </p>
          <button type="button" onClick={close} className={btnPrimary + ' w-full'}>
            Close
          </button>
        </div>
      ) : (
        <>
          <div className="bg-warm-50 dark:bg-gray-700/50 rounded-lg p-3 mb-4">
            <p className="text-xs font-bold uppercase text-warm-500 dark:text-warm-400">Unpaid sales</p>
            <p className="text-sm text-warm-700 dark:text-warm-300 mt-1">
              {line.itemCount} {line.itemCount === 1 ? 'item' : 'items'}, {fmtMoney(line.gross)} in sales
            </p>
            {line.items.length > 0 && (
              <ul className="mt-2 text-xs text-warm-600 dark:text-warm-400 space-y-1">
                {line.items.slice(0, 5).map((i) => (
                  <li key={i.id} className="flex justify-between gap-3">
                    <span className="min-w-0 break-words">{i.title}</span>
                    <span className="flex-shrink-0">{fmtMoney(i.salePrice)}</span>
                  </li>
                ))}
                {line.items.length > 5 && <li>and {line.items.length - 5} more</li>}
              </ul>
            )}
          </div>

          {blocked && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-200"
            >
              <p className="mb-2">{blocked.message}</p>
              <Link href={blocked.href} className="font-bold underline">
                Open that payout run
              </Link>
            </div>
          )}

          <MarkPaidFields
            idPrefix="record-payment"
            consignorName={consignorName}
            amount={owed}
            preferredPayoutMethod={preferred}
            hasEmail={hasEmail}
            emailKnown={emailKnown}
            onCancel={close}
            onSubmit={record}
            footnote="Recording a payment locks these amounts. You pay the consignor yourself. FindA.Sale does not send or hold any money."
          />
        </>
      )}
    </ModalShell>
  );
};

export default ConsignorPayoutModal;
