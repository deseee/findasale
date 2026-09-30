import React, { useState } from 'react';
import {
  PAYMENT_METHODS,
  PaymentMethod,
  asPaymentMethod,
  fmtMoney,
  inputDateToIso,
  todayInputValue,
  errMsg,
} from '../../lib/types/consignorSettlement';
import { MarkPaidBody } from '../../hooks/useConsignorSettlement';
import { btnOutline, btnPrimary, helperClass, inputClass, labelClass } from './ui';

/**
 * The "Mark as paid" form body. Shared by the Mark as paid dialog on the payouts page and by the
 * Record a payment modal on the Consignors pages so the two never drift apart.
 *
 * Amount is read-only on purpose: it comes from the locked statement. The organizer records what
 * they paid by hand; nothing here moves money.
 */
export interface MarkPaidFieldsProps {
  consignorName: string;
  amount: number;
  /** Stored preference on the consignor. Pre-fills "Paid by". */
  preferredPayoutMethod?: string | null;
  hasEmail: boolean;
  /** When false the email checkbox stays usable even without a known address (server decides). */
  emailKnown?: boolean;
  onCancel: () => void;
  onSubmit: (body: MarkPaidBody) => Promise<void>;
  /** Optional extra text shown above the buttons (for example what will be locked). */
  footnote?: React.ReactNode;
  submitLabel?: string;
  idPrefix: string;
}

const MarkPaidFields: React.FC<MarkPaidFieldsProps> = ({
  consignorName,
  amount,
  preferredPayoutMethod,
  hasEmail,
  emailKnown = true,
  onCancel,
  onSubmit,
  footnote,
  submitLabel = 'Record payment',
  idPrefix,
}) => {
  const [method, setMethod] = useState<PaymentMethod>(asPaymentMethod(preferredPayoutMethod) || 'CASH');
  const [paidOn, setPaidOn] = useState<string>(todayInputValue());
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailDisabled = emailKnown && !hasEmail;

  const validate = (): string | null => {
    if (!paidOn) return 'Choose the date you paid.';
    if (paidOn > todayInputValue()) return 'The date paid cannot be in the future.';
    if (/\d{9,}/.test(reference.replace(/[\s-]/g, ''))) {
      return 'That looks like an account number. Enter a check number or a short note instead.';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const body: MarkPaidBody = {
        method,
        paidAt: inputDateToIso(paidOn),
        notifyConsignor: notify && !emailDisabled,
      };
      if (reference.trim()) body.reference = reference.trim();
      if (note.trim()) body.note = note.trim();
      await onSubmit(body);
    } catch (err: any) {
      setError(errMsg(err, 'We could not record this payment. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mb-4">
        <label htmlFor={`${idPrefix}-amount`} className={labelClass}>
          Amount
        </label>
        <input
          id={`${idPrefix}-amount`}
          type="text"
          readOnly
          value={fmtMoney(amount)}
          className={inputClass + ' font-bold'}
        />
        <p className={helperClass}>Worked out from the sold items. It cannot be edited here.</p>
      </div>

      <div className="mb-4">
        <label htmlFor={`${idPrefix}-method`} className={labelClass}>
          Paid by
        </label>
        <select
          id={`${idPrefix}-method`}
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          className={inputClass}
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label htmlFor={`${idPrefix}-date`} className={labelClass}>
          Date paid
        </label>
        <input
          id={`${idPrefix}-date`}
          type="date"
          value={paidOn}
          max={todayInputValue()}
          onChange={(e) => setPaidOn(e.target.value)}
          className={inputClass}
          required
        />
      </div>

      <div className="mb-4">
        <label htmlFor={`${idPrefix}-reference`} className={labelClass}>
          Reference (optional)
        </label>
        <input
          id={`${idPrefix}-reference`}
          type="text"
          value={reference}
          maxLength={120}
          onChange={(e) => setReference(e.target.value)}
          className={inputClass}
          autoComplete="off"
        />
        <p className={helperClass}>Check number or a short note. Do not enter bank account numbers.</p>
      </div>

      <div className="mb-4">
        <label htmlFor={`${idPrefix}-note`} className={labelClass}>
          Note
        </label>
        <textarea
          id={`${idPrefix}-note`}
          value={note}
          rows={2}
          maxLength={1000}
          onChange={(e) => setNote(e.target.value)}
          className={inputClass}
        />
      </div>

      <label
        className={`flex items-start gap-3 min-h-[44px] py-2 mb-4 ${
          emailDisabled ? 'opacity-60' : 'cursor-pointer'
        }`}
      >
        <input
          type="checkbox"
          checked={notify && !emailDisabled}
          disabled={emailDisabled}
          onChange={(e) => setNotify(e.target.checked)}
          className="mt-1 h-5 w-5 flex-shrink-0"
        />
        <span className="text-sm text-warm-700 dark:text-warm-300">
          Email {consignorName} that this payment was recorded
          {emailDisabled && (
            <span className="block text-xs text-warm-500 dark:text-warm-400">No email on file.</span>
          )}
        </span>
      </label>

      {footnote && <div className="mb-4 text-xs text-warm-500 dark:text-warm-400">{footnote}</div>}

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-3">
        <button type="button" onClick={onCancel} disabled={submitting} className={btnOutline + ' flex-1'}>
          Cancel
        </button>
        <button type="submit" disabled={submitting} className={btnPrimary + ' flex-1'}>
          {submitting ? 'Recording...' : submitLabel}
        </button>
      </div>
    </form>
  );
};

export default MarkPaidFields;
