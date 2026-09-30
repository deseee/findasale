import React, { useState } from 'react';
import { errMsg } from '../../lib/types/consignorSettlement';
import { ModalShell, btnDanger, btnOutline, btnPrimary, helperClass, inputClass, labelClass } from './ui';

/** Small "why?" dialog used to undo a payment record or cancel a run. A reason is required. */
const ReasonDialog: React.FC<{
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}> = ({ title, body, confirmLabel, cancelLabel = 'Keep it', danger, onClose, onConfirm }) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!reason.trim()) {
      setError('Add a short reason so the record makes sense later.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
    } catch (err: any) {
      setError(errMsg(err, 'That did not go through. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell titleId="reason-title" onClose={onClose}>
      <h2 id="reason-title" className="text-xl font-bold text-warm-900 dark:text-white mb-2">
        {title}
      </h2>
      <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">{body}</p>
      <form onSubmit={submit} noValidate>
        <label htmlFor="reason-text" className={labelClass}>
          Reason
        </label>
        <textarea
          id="reason-text"
          value={reason}
          rows={3}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
          className={inputClass}
        />
        <p className={helperClass}>This is kept in the paper trail.</p>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-3 mt-5">
          <button type="button" onClick={onClose} disabled={busy} className={btnOutline + ' flex-1'}>
            {cancelLabel}
          </button>
          <button
            type="submit"
            disabled={busy}
            className={(danger ? btnDanger : btnPrimary) + ' flex-1'}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

export default ReasonDialog;
