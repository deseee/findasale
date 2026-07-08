import React, { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import api from '../lib/api';
import { useToast } from './ToastContext';

// ADR-023: Login-time prompt for Organizers still on a Stripe Express account.
// Framed as a Stripe account-requirements confirmation (accurate -- it genuinely
// ends on Stripe's own hosted confirmation/ToS screen), not "we made a mistake."
// Reuse via Stripe's Networked Onboarding avoids RE-TYPING business/bank/identity
// data -- it is NOT a single click; Stripe's own hosted UI still steps the
// organizer through several confirm screens.
//
// ADR-024 CONFIRMED ROOT CAUSE (2026-07-08, reproduced live by Patrick, not
// assumed): on Stripe's own identity-confirmation screen during this flow,
// choosing "Sign in with Google" reliably fails with Stripe's own
// "Multi region routing target not found" error. Choosing password login on
// the SAME screen, SAME account, succeeds every time. This is a Stripe-side
// bug in their Google auth path specifically -- there is no Stripe API
// parameter to hide/disable that button (checked), so the only real mitigation
// is telling the organizer which option to pick. The instruction text below
// is not optional decoration -- it is the actual fix for most organizers.
interface StripeMigrationBannerProps {
  needsStripeMigration?: boolean;
  migrationPending?: boolean;
}

const StripeMigrationBanner: React.FC<StripeMigrationBannerProps> = ({
  needsStripeMigration,
  migrationPending,
}) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || (!needsStripeMigration && !migrationPending)) {
    return null;
  }

  const startMigration = async (mode: 'reuse' | 'manual' = 'reuse', forceNew = false) => {
    setLoading(true);
    try {
      const response = await api.post('/organizers/me/stripe/start-standard-migration', {
        mode,
        forceNew,
      });
      if (response.data?.alreadyMigrated) {
        showToast('Your Stripe account is already up to date.', 'success');
        setDismissed(true);
        return;
      }
      if (response.data?.onboardingUrl) {
        window.location.href = response.data.onboardingUrl;
        return;
      }
      showToast('Something went wrong starting the confirmation. Please try again.', 'error');
    } catch (error) {
      console.error('Error starting Stripe standard migration:', error);
      showToast('Something went wrong starting the confirmation. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => startMigration('reuse');

  // ADR-024 CORRECTION (same session): forceNew does NOT fix the confirmed
  // Google-auth root cause above -- it only creates a new account object,
  // which does not change which login method Stripe's own screen offers.
  // Kept as a secondary option (harmless, zero cost) in case a given failure
  // turns out to be account-specific rather than the known Google-auth cause,
  // but the password-login instruction below is the real fix.
  const handleTryFreshReuse = () => startMigration('reuse', true);

  // Manual entry stays the last resort -- only after a fresh reuse attempt
  // has also failed. Requires re-adding the bank account (Stripe never
  // exposes full account numbers via the API to prefill it either way).
  const handleManualFallback = () => startMigration('manual');

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 flex items-start gap-3">
      <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
          Stripe account update needed
        </p>
        <p className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
          {migrationPending
            ? 'Your Stripe confirmation is still in progress. Finish it to keep payouts running without interruption.'
            : 'Stripe has updated its account requirements. Confirm your account to keep payouts running without interruption.'}
        </p>
        <p className="text-sm font-medium text-amber-900 dark:text-amber-200 mt-1.5 bg-amber-100 dark:bg-amber-900/40 rounded px-2 py-1.5">
          Important: on Stripe&apos;s confirmation page, when asked to sign in, choose
          &quot;log in with your password&quot; -- NOT &quot;Sign in with Google.&quot; The Google
          option currently fails with a Stripe-side error; password login works.
        </p>
        <button
          onClick={handleClick}
          disabled={loading}
          className="mt-2 text-sm font-medium px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Loading...' : migrationPending ? 'Continue' : 'Review & Confirm'}
        </button>
        {migrationPending && (
          <>
            <button
              onClick={handleTryFreshReuse}
              disabled={loading}
              className="mt-2 ml-3 text-sm font-medium px-3 py-1.5 rounded-md border border-amber-600 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50 transition-colors"
            >
              Try again (fresh, no re-entry)
            </button>
            <button
              onClick={handleManualFallback}
              disabled={loading}
              className="mt-2 ml-3 text-sm text-amber-700 dark:text-amber-400 underline hover:text-amber-900 dark:hover:text-amber-200 disabled:opacity-50 transition-colors"
            >
              Still stuck? Set up manually instead
            </button>
          </>
        )}
      </div>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default StripeMigrationBanner;
