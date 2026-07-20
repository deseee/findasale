/**
 * ADR-090 Phase 1: Hub Owner Stripe Connect Onboarding banner.
 * Shown on the Vendor Booths admin page so a hub-owning Organizer can complete
 * Stripe Standard-account onboarding specifically in the context of "you own a hub
 * with vendor booths and need to be able to receive hub owner revenue-share /
 * booth-fee payouts." Mirrors ACHPayoutButton.tsx's status-fetch + onboard-link
 * pattern (same shape: GET status, POST onboard, window.open the returned URL).
 *
 * Only relevant when at least one booth in this hub has revenueSharePercent > 0 or
 * boothFee > 0 (checkout is blocked for revenue-share booths until onboarding is
 * complete, ADR-090 §6) — the parent page decides whether to render this at all.
 */

import React, { useEffect, useState } from 'react';
import api from '../lib/api';

interface HubOwnerStripeStatus {
  onboarded: boolean;
  needsAccount: boolean;
  needsStandardUpgrade: boolean;
  stripeAccountType: string | null;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
}

const HubOwnerStripeOnboarding: React.FC = () => {
  const [status, setStatus] = useState<HubOwnerStripeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/organizers/me/hub-owner/stripe/status');
      setStatus(response.data);
    } catch (err: any) {
      // 404 here just means "you don't own a hub" -- not an error worth surfacing.
      if (err?.response?.status !== 404) {
        setError(err?.response?.data?.message || 'Failed to load Stripe status');
      }
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    try {
      setStarting(true);
      setError(null);
      const response = await api.post('/organizers/me/hub-owner/stripe/onboard');
      if (response.data?.onboardingUrl) {
        window.open(response.data.onboardingUrl, '_blank');
        setTimeout(fetchStatus, 3000);
      }
    } catch (err: any) {
      if (err?.response?.status === 409 && err.response?.data?.needsStandardMigration) {
        setError(err.response.data.message || 'Your existing Stripe account needs to be upgraded first.');
      } else {
        setError(err?.response?.data?.message || 'Failed to start Stripe onboarding');
      }
    } finally {
      setStarting(false);
    }
  };

  if (loading || !status) return null; // no hub owned, or still loading -- render nothing
  if (status.onboarded) return null; // fully connected -- nothing to prompt

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-6">
      <p className="text-amber-800 dark:text-amber-300 font-semibold mb-1">
        Connect Stripe to receive hub owner payouts
      </p>
      <p className="text-amber-700 dark:text-amber-400 text-sm mb-3">
        {status.needsStandardUpgrade && !status.needsAccount
          ? "Your existing Stripe account needs to be upgraded before it can receive booth revenue-share or booth-fee payouts."
          : "Booths with a revenue-share agreement can't check out until you connect Stripe to receive your cut."}
      </p>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 mb-2">{error}</p>
      )}
      <button
        onClick={handleConnect}
        disabled={starting}
        className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
      >
        {starting ? 'Starting...' : 'Connect Stripe'}
      </button>
    </div>
  );
};

export default HubOwnerStripeOnboarding;
