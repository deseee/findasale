import React, { useState } from 'react';
import { errMsg } from '../../lib/types/consignorSettlement';
import { ModalShell, btnOutline, btnPrimary } from './ui';

const ApproveDialog: React.FC<{
  emailCount: number;
  /** False when the server did not include email addresses, so we cannot count them. */
  emailKnown: boolean;
  onClose: () => void;
  /** Number of lines that sold for a different amount than the tag price. Approving needs an explicit acknowledgement when above 0. */
  varianceCount?: number;
  onConfirm: (sendStatements: boolean, acknowledgeVariance: boolean) => Promise<void>;
}> = ({ emailCount, emailKnown, varianceCount = 0, onClose, onConfirm }) => {
  const [send, setSend] = useState(false);
  const [ackVariance, setAckVariance] = useState(false);
  // The server is the authority: if it asks for the acknowledgement, show the checkbox even when we counted none.
  const [serverWantsAck, setServerWantsAck] = useState(false);
  const needsAck = varianceCount > 0 || serverWantsAck;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = emailKnown && emailCount === 0;

  const submit = async () => {
    if (busy) return;
    if (needsAck && !ackVariance) {
      setError('Please confirm you have reviewed the lines that sold for a different amount than the tag price.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(send && !disabled, needsAck && ackVariance);
    } catch (e: any) {
      if (e && e.response && e.response.data && e.response.data.code === 'VARIANCE_ACK_REQUIRED') setServerWantsAck(true);
      setError(errMsg(e, 'We could not approve these statements. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell titleId="approve-title" onClose={onClose}>
      <h2 id="approve-title" className="text-xl font-bold text-warm-900 dark:text-white mb-2">
        Approve these statements?
      </h2>
      <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
        Amounts lock once you approve. Sales made after this go into a new run.
      </p>

      {needsAck && (
        <label className="flex items-start gap-3 min-h-[44px] py-2 mb-4 cursor-pointer rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3">
          <input
            type="checkbox"
            checked={ackVariance}
            onChange={(e) => setAckVariance(e.target.checked)}
            className="mt-1 h-5 w-5 flex-shrink-0"
          />
          <span className="text-sm text-warm-800 dark:text-warm-200">
            {varianceCount > 0
              ? `${varianceCount} ${varianceCount === 1 ? 'item sold' : 'items sold'} for a different amount than the tag price (for example a markdown or a partial refund). I have reviewed ${varianceCount === 1 ? 'it' : 'them'} and the amounts are right.`
              : 'Some items sold for a different amount than the tag price. I have reviewed them and the amounts are right.'}
          </span>
        </label>
      )}

      <label
        className={`flex items-start gap-3 min-h-[44px] py-2 mb-4 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}
      >
        <input
          type="checkbox"
          checked={send && !disabled}
          disabled={disabled}
          onChange={(e) => setSend(e.target.checked)}
          className="mt-1 h-5 w-5 flex-shrink-0"
        />
        <span className="text-sm text-warm-700 dark:text-warm-300">
          {emailKnown
            ? `Email each consignor their statement (${emailCount} ${emailCount === 1 ? 'has' : 'have'} an email on file)`
            : 'Email each consignor their statement (consignors without an email on file are skipped)'}
        </span>
      </label>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-3">
        <button type="button" onClick={onClose} disabled={busy} className={btnOutline + ' flex-1'}>
          Cancel
        </button>
        <button type="button" onClick={submit} disabled={busy || (needsAck && !ackVariance)} className={btnPrimary + ' flex-1'}>
          {busy ? 'Approving...' : 'Approve'}
        </button>
      </div>
    </ModalShell>
  );
};

export default ApproveDialog;
