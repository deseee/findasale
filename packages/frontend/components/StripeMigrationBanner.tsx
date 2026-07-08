import React, { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import api from '../lib/api';
import { useToast } from './ToastContext';

// ADR-023: Login-time prompt for Organizers still on a Stripe Express account.
// Framed as a Stripe account-requirements confirmation (accurate -- it genuinely
// ends on Stripe's own hosted confirmation/ToS screen), not "we made a mistake."
// One-click reuse via Stripe's Networked Onboarding -- no re-entered business,
// bank, or identity data.
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

  // ADR-024: if the reuse path got stuck on Stripe's "Multi region routing
  // target not found" bug (root-caused 2026-07-08), a fresh one-click attempt
  // on a BRAND NEW account object is tried FIRST -- the old "Continue" always
  // re-links the same possibly-tainted account, so this is the first real
  // test of whether the failure is account-specific or a hard block. Still
  // zero re-entry if it works.
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
            : "Stripe has updated its account requirements. Confirm your account to keep payouts running without interruption -- it's a single confirmation, nothing to re-enter."}
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
