/**
 * ADR-090 Phase 1: Hub Owner Square Connect Onboarding banner.
 * Shown on the Vendor Booths admin page so a hub-owning Organizer can complete
 * Square onboarding specifically in the context of "you own a hub with vendor
 * booths and need to be able to receive hub owner revenue-share / booth-fee
 * payouts." Status-fetch + onboard-link pattern
 * (same shape: GET status, POST onboard, window.open the returned URL).
 *
 * Stripe onboarding removed 2026-09-09 -- the Stripe platform account is
 * permanently closed. Supersedes the 2026-09-07 "Stripe stays available"
 * decision this banner previously implemented alongside Square.
 *
 * Only relevant when at least one booth in this hub has revenueSharePercent > 0 or
 * boothFee > 0 (checkout is blocked for revenue-share booths until onboarding is
 * complete, ADR-090 §6) — the parent page decides whether to render this at all.
 */

import React, { useEffect, useState } from 'react';
import api from '../lib/api';

// Square hub-owner status (GET /api/square-connect/hub-owner/status). Deliberately does NOT
// carry needsStandardUpgrade -- that was a Stripe-account-type-migration concept (ADR-023,
// now moot since Stripe onboarding is removed) with no Square equivalent (confirmed via
// direct read of squareConnectController.ts's getHubOwnerSquareStatus -- its response is
// only these three fields, no payoutsFlaggedForReview either, unlike the organizer/consignor
// Square status endpoints).
interface HubOwnerSquareStatus {
  onboarded: boolean;
  needsAccount: boolean;
  squareMerchantId: string | null;
}

const HubOwnerSquareOnboarding: React.FC = () => {
  // Square is the sole processor for hub-owner payouts. Stripe onboarding removed
  // 2026-09-09 -- the Stripe platform account is permanently closed. Supersedes the
  // 2026-09-07 "Stripe stays available" decision.
  const [squareStatus, setSquareStatus] = useState<HubOwnerSquareStatus | null>(null);
  const [squareLoading, setSquareLoading] = useState(true);
  const [squareStarting, setSquareStarting] = useState(false);
  const [squareError, setSquareError] = useState<string | null>(null);

  const fetchSquareStatus = async () => {
    try {
      setSquareLoading(true);
      setSquareError(null);
      const response = await api.get('/square-connect/hub-owner/status');
      setSquareStatus(response.data);
    } catch (err: any) {
      // 404 here just means "you don't own a hub" -- not an error worth surfacing.
      if (err?.response?.status !== 404) {
        setSquareError(err?.response?.data?.message || 'Failed to load Square status');
      }
      setSquareStatus(null);
    } finally {
      setSquareLoading(false);
    }
  };

  useEffect(() => {
    fetchSquareStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnectSquare = async () => {
    try {
      setSquareStarting(true);
      setSquareError(null);
      const response = await api.post('/square-connect/hub-owner/onboard');
      if (response.data?.onboardingUrl) {
        window.open(response.data.onboardingUrl, '_blank');
        setTimeout(fetchSquareStatus, 3000);
      } else if (response.data?.alreadyOnboarded) {
        fetchSquareStatus();
      }
    } catch (err: any) {
      setSquareError(err?.response?.data?.message || "We couldn't start connecting Square. Please try again.");
    } finally {
      setSquareStarting(false);
    }
  };

  const showSquareBanner = !squareLoading && !!squareStatus && !squareStatus.onboarded;

  if (!showSquareBanner) return null;

  return (
    <>
      {showSquareBanner && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-6">
          <p className="text-amber-800 dark:text-amber-300 font-semibold mb-1">
            Connect Square to receive hub owner payouts
          </p>
          <p className="text-amber-700 dark:text-amber-400 text-sm mb-3">
            Booths with a revenue-share agreement can't check out until you connect Square to
            receive your cut.
          </p>
          {squareError && (
            <p className="text-xs text-red-600 dark:text-red-400 mb-2">{squareError}</p>
          )}
          <button
            onClick={handleConnectSquare}
            disabled={squareStarting}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            {squareStarting ? 'Starting...' : 'Connect Square'}
          </button>
        </div>
      )}
    </>
  );
};

export default HubOwnerSquareOnboarding;
