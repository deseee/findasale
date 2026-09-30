/**
 * HuntPassManage: self-serve Hunt Pass cancel and undo, in-app.
 *
 * Follows the FTC click-to-cancel standard: cancelling is as easy as signing up, needs no
 * phone call or email, takes one confirm, states exactly when access ends (the end of the
 * billing period already paid for), confirms the result, and can be undone until that date.
 * No retention offers or guilt copy on purpose.
 *
 * Renders nothing for shoppers without an active Hunt Pass. Used on /shopper/hunt-pass
 * (variant "page") and the Hunt Pass card on /profile (variant "card").
 */

import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import AccessibleModal from './AccessibleModal';
import {
  useCancelHuntPass,
  useHuntPassStatus,
  useResumeHuntPass,
} from '../hooks/useHuntPassSubscription';

interface Props {
  variant?: 'page' | 'card';
}

function formatLongDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

const HuntPassManage: React.FC<Props> = ({ variant = 'card' }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data: status, isLoading, isError, refetch } = useHuntPassStatus(!!user?.huntPassActive);
  const cancel = useCancelHuntPass();
  const resume = useResumeHuntPass();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!user?.huntPassActive) return null;

  const box =
    variant === 'page'
      ? 'mt-6 border-t border-green-200 dark:border-green-700 pt-6 text-left'
      : 'mt-4 border-t border-warm-200 dark:border-gray-700 pt-4';

  if (isLoading) {
    return (
      <div className={box} aria-busy="true">
        <div className="h-4 w-2/3 rounded bg-warm-200 dark:bg-gray-700 animate-pulse" />
      </div>
    );
  }

  if (isError || !status) {
    return (
      <div className={box}>
        <p className="text-sm text-red-700 dark:text-red-300">We could not load your subscription details.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-2 text-sm font-semibold text-red-700 dark:text-red-300 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const endDate = formatLongDate(status.huntPassExpiry);
  const canManage = status.huntPassBillingProcessor === 'square' || !!status.huntPassSubscriptionId;
  const scheduled = !!status.huntPassCancelAtPeriodEnd;

  const handleConfirmCancel = () => {
    setErrorMessage(null);
    cancel.mutate(undefined, {
      onSuccess: (res) => {
        setConfirmOpen(false);
        showToast?.(res.message || 'Your Hunt Pass is canceled.', 'success');
      },
      onError: (err: any) => {
        setErrorMessage(
          err?.response?.data?.message ?? 'We could not cancel your Hunt Pass. Nothing was changed. Please try again.'
        );
      },
    });
  };

  const handleResume = () => {
    setErrorMessage(null);
    resume.mutate(undefined, {
      onSuccess: (res) => {
        showToast?.(res.message || 'Your Hunt Pass is on.', 'success');
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.message ?? 'We could not turn your Hunt Pass back on. Please try again.';
        setErrorMessage(msg);
        showToast?.(msg, 'error');
        refetch();
      },
    });
  };

  if (!canManage) {
    return (
      <div className={box}>
        <p className="text-sm text-warm-600 dark:text-warm-300">
          This Hunt Pass has no recurring billing, so there is nothing to cancel.
          {endDate ? ` It ends on ${endDate}.` : ''}
        </p>
      </div>
    );
  }

  return (
    <div className={box}>
      {scheduled ? (
        <div>
          <div className="rounded-lg border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 p-3">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Your Hunt Pass is canceled.</p>
            <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">
              {endDate
                ? `You keep every Hunt Pass perk until ${endDate}. You will not be charged again.`
                : 'You will not be charged again.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleResume}
            disabled={resume.isPending}
            className="mt-3 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white"
          >
            {resume.isPending ? 'Turning back on...' : 'Keep my Hunt Pass'}
          </button>
          {endDate && (
            <p className="mt-2 text-xs text-warm-500 dark:text-warm-400">
              Changed your mind? Keep your Hunt Pass any time before {endDate} and it will renew as usual.
            </p>
          )}
        </div>
      ) : (
        <div>
          <p className="text-sm text-warm-700 dark:text-warm-200">
            {endDate ? `Renews on ${endDate} for $4.99.` : 'Renews monthly for $4.99.'} Cancel any time, right here.
          </p>
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setConfirmOpen(true);
            }}
            className="mt-3 rounded-lg border border-red-300 dark:border-red-700 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 px-4 py-2 text-sm font-semibold text-red-700 dark:text-red-300"
          >
            Cancel Hunt Pass
          </button>
        </div>
      )}

      {errorMessage && !confirmOpen && (
        <p className="mt-3 text-sm text-red-700 dark:text-red-300" role="alert">
          {errorMessage}
        </p>
      )}

      <AccessibleModal isOpen={confirmOpen} onClose={() => !cancel.isPending && setConfirmOpen(false)} ariaLabelledBy="cancel-hunt-pass-title">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
          <h2 id="cancel-hunt-pass-title" className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-3">
            Cancel your Hunt Pass?
          </h2>
          <p className="text-sm text-warm-700 dark:text-warm-200">
            {endDate
              ? `You keep every Hunt Pass perk until ${endDate}, the end of the period you already paid for. After that it stops and you will not be charged again.`
              : 'Your Hunt Pass will stop at the end of the period you already paid for, and you will not be charged again.'}
          </p>
          <p className="text-sm text-warm-600 dark:text-warm-300 mt-2">
            You can undo this any time before then from this page.
          </p>

          {errorMessage && (
            <div className="mt-4 rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300" role="alert">
              {errorMessage}
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={cancel.isPending}
              className="rounded-lg border border-warm-300 dark:border-gray-600 px-4 py-2 text-sm font-semibold text-warm-800 dark:text-warm-100 hover:bg-warm-50 dark:hover:bg-gray-700 disabled:opacity-60"
            >
              Keep Hunt Pass
            </button>
            <button
              type="button"
              onClick={handleConfirmCancel}
              disabled={cancel.isPending}
              className="rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white"
            >
              {cancel.isPending ? 'Canceling...' : 'Cancel Hunt Pass'}
            </button>
          </div>
        </div>
      </AccessibleModal>
    </div>
  );
};

export default HuntPassManage;
