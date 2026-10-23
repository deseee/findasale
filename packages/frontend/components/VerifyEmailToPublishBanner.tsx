/**
 * VerifyEmailToPublishBanner (2026-10-23): verification is required to PUBLISH, not to set up a sale.
 * Shown wherever an unverified organizer works (dashboard, add-items, edit-sale) until User.emailVerified is
 * true, with a one-tap resend (POST /auth/resend-verification, rate limited server-side). Not dismissable.
 * VerifyEmailResendButton is the same resend control, reused inside the publish dialogs.
 */
import React, { useState } from 'react';
import { MailCheck } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

export function useResendVerification() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const resend = async () => {
    if (!user?.email || state === 'sending') return;
    setState('sending');
    try {
      await api.post('/auth/resend-verification', { email: user.email });
      setState('sent');
      showToast(`New verification link sent to ${user.email}. Check your inbox and spam folder.`, 'success');
    } catch (error: unknown) {
      setState('idle');
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      showToast(msg || 'Could not send a new link. Please try again in a few minutes.', 'error');
    }
  };
  return { resend, state, email: user?.email ?? null };
}

export const VerifyEmailResendButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { resend, state } = useResendVerification();
  return (
    <button
      type="button"
      onClick={resend}
      disabled={state !== 'idle'}
      className={`inline-flex items-center justify-center min-h-[44px] px-4 rounded-lg border border-amber-600 text-amber-800 dark:text-amber-200 dark:border-amber-500 text-sm font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${className}`}
    >
      {state === 'sending' ? 'Sending…' : state === 'sent' ? 'New link sent' : 'Send a new link'}
    </button>
  );
};

const VerifyEmailToPublishBanner: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { user } = useAuth();
  if (!user || user.emailVerified !== false) return null;
  return (
    <div
      role="region"
      aria-label="Verify your email to publish"
      className={`rounded-lg border p-4 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 ${className}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <MailCheck className="h-5 w-5 mt-0.5 flex-shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold text-warm-900 dark:text-warm-100">Verify your email to publish</p>
            <p className="text-sm text-warm-700 dark:text-warm-300 break-words">
              You can set up your sale and add items now. To publish, open the link we sent to{' '}
              <strong>{user.email}</strong>. Check your spam folder too.
            </p>
          </div>
        </div>
        <VerifyEmailResendButton className="w-full sm:w-auto flex-shrink-0" />
      </div>
    </div>
  );
};

export default VerifyEmailToPublishBanner;
