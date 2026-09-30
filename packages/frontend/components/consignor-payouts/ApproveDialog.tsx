import React, { useState } from 'react';
import { errMsg } from '../../lib/types/consignorSettlement';
import { ModalShell, btnOutline, btnPrimary } from './ui';

const ApproveDialog: React.FC<{
  emailCount: number;
  /** False when the server did not include email addresses, so we cannot count them. */
  emailKnown: boolean;
  onClose: () => void;
  onConfirm: (sendStatements: boolean) => Promise<void>;
}> = ({ emailCount, emailKnown, onClose, onConfirm }) => {
  const [send, setSend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = emailKnown && emailCount === 0;

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(send && !disabled);
    } catch (e: any) {
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
        <button type="button" onClick={submit} disabled={busy} className={btnPrimary + ' flex-1'}>
          {busy ? 'Approving...' : 'Approve'}
        </button>
      </div>
    </ModalShell>
  );
};

export default ApproveDialog;
