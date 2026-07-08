/**
 * Vendor Booth Payments — Vendor-Facing Booth View (2026-07-07)
 * ADR-015/016/017. Public/token-gated read + claim CTA. Once claimed, shows
 * itemized fee disclosure (platform's flat 10% + THIS booth's boothFee + THIS
 * booth's revenueSharePercent — never a blended number, since one vendor can
 * have different terms at different malls) and Stripe onboarding status.
 * Functional over polished — correctness and full state coverage prioritized.
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';

interface PublicBoothSummary {
  boothNumber: string;
  vendorName: string;
  status: string;
  alreadyClaimed: boolean;
}

interface PayoutInfo {
  boothFee: string;
  revenueSharePercent: number;
  platformFeePercent: number;
  payouts: Array<{
    id: string;
    totalSales: string;
    boothFeeCharged: string;
    revenueShareOwed: string;
    netPayout: string;
    status: string;
    paidAt: string | null;
  }>;
}

const VendorBoothTokenPage: React.FC = () => {
  const router = useRouter();
  const { boothToken } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [summary, setSummary] = useState<PublicBoothSummary | null>(null);
  const [payoutInfo, setPayoutInfo] = useState<PayoutInfo | null>(null);
  const [myBoothId, setMyBoothId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [onboarding, setOnboarding] = useState(false);

  const fetchSummary = async () => {
    if (!boothToken || typeof boothToken !== 'string') return;
    try {
      setLoading(true);
      setLoadError(null);
      const response = await api.get(`/vendor-booth/${boothToken}`);
      setSummary(response.data);
    } catch (error: any) {
      console.error('Error fetching booth summary:', error);
      setLoadError(error.response?.data?.error || 'Booth not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (boothToken) fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boothToken]);

  // Once claimed AND the logged-in user is viewing, fetch their booths to find
  // this one's id (needed for payout/onboarding calls, which require the real
  // booth id + real auth, not the token).
  useEffect(() => {
    const loadMyBooth = async () => {
      if (!user || !summary?.alreadyClaimed) return;
      try {
        const response = await api.get('/vendor-booth/my-booths');
        const match = (response.data || []).find(
          (b: any) => b.boothNumber === summary.boothNumber && b.vendorName === summary.vendorName
        );
        if (match) {
          setMyBoothId(match.id);
          const payoutResponse = await api.get(`/vendor-booth/${match.id}/payouts`);
          setPayoutInfo(payoutResponse.data);
        }
      } catch (error: any) {
        console.error('Error loading vendor booth details:', error);
      }
    };
    loadMyBooth();
  }, [user, summary]);

  const handleClaim = async () => {
    if (!boothToken || typeof boothToken !== 'string') return;
    if (!user) {
      showToast('Please log in first to claim this booth', 'error');
      router.push(`/login?redirect=/vendor-booth/${boothToken}`);
      return;
    }
    setClaiming(true);
    try {
      await api.post(`/vendor-booth/${boothToken}/claim`);
      showToast('Booth claimed!', 'success');
      fetchSummary();
    } catch (error: any) {
      console.error('Error claiming booth:', error);
      showToast(error.response?.data?.error || 'Failed to claim booth', 'error');
    } finally {
      setClaiming(false);
    }
  };

  const handleStartOnboarding = async () => {
    if (!myBoothId) return;
    setOnboarding(true);
    try {
      const response = await api.post(`/vendor-booth/${myBoothId}/stripe/onboard`, {});
      // ADR-021 (2026-07-08): when the claiming user already has a working
      // Stripe Connect account (e.g. as an Organizer), the backend links it
      // directly instead of sending them through onboarding a second time --
      // there is no onboardingUrl in that case, so don't redirect.
      if (response.data.linkedExistingAccount) {
        showToast(
          response.data.chargesEnabled && response.data.payoutsEnabled
            ? 'Linked to your existing Stripe account — you can start taking payments.'
            : 'Linked to your existing Stripe account. Finish setup in your organizer Stripe settings to enable payouts.',
          'success'
        );
        setOnboarding(false);
        fetchSummary();
        return;
      }
      window.location.href = response.data.onboardingUrl;
    } catch (error: any) {
      console.error('Error starting onboarding:', error);
      showToast(error.response?.data?.error || 'Failed to start Stripe onboarding', 'error');
      setOnboarding(false);
    }
  };

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4 md:p-8">
      <Head>
        <title>Vendor Booth | FindA.Sale</title>
      </Head>

      <div className="max-w-lg mx-auto">
        {loading || authLoading ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center">
            <p className="text-warm-600 dark:text-warm-400">Loading booth details...</p>
          </div>
        ) : loadError ? (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-8 text-center">
            <p className="text-red-700 dark:text-red-400">{loadError}</p>
          </div>
        ) : !summary ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center">
            <p className="text-warm-600 dark:text-warm-400">Booth not found</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-warm-200 dark:border-gray-700 p-6">
            <h1 className="text-2xl font-bold text-warm-900 dark:text-white mb-1">Booth {summary.boothNumber}</h1>
            <p className="text-warm-600 dark:text-warm-400 mb-4">{summary.vendorName}</p>
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 mb-6">
              {summary.status}
            </span>

            {!summary.alreadyClaimed ? (
              <div>
                <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
                  Claim this booth to start tracking your sales and set up payouts.
                </p>
                <button
                  onClick={handleClaim}
                  disabled={claiming}
                  className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                >
                  {claiming ? 'Claiming...' : user ? 'Claim This Booth' : 'Log In to Claim'}
                </button>
              </div>
            ) : !user ? (
              <div>
                <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
                  This booth has already been claimed. Log in with the account that claimed it to view details.
                </p>
                <button
                  onClick={() => router.push(`/login?redirect=/vendor-booth/${boothToken}`)}
                  className="w-full bg-warm-900 dark:bg-warm-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                >
                  Log In
                </button>
              </div>
            ) : (
              <div>
                {payoutInfo ? (
                  <>
                    {/* Fee disclosure requirement: itemize per-booth, never blended */}
                    <div className="mb-6 p-4 bg-warm-50 dark:bg-gray-700 rounded-lg">
                      <h2 className="text-sm font-bold text-warm-700 dark:text-warm-300 uppercase mb-3">
                        Fees for this booth
                      </h2>
                      <dl className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-warm-600 dark:text-warm-400">Platform fee (flat, all sales)</dt>
                          <dd className="font-bold text-warm-900 dark:text-white">{payoutInfo.platformFeePercent}%</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-warm-600 dark:text-warm-400">Booth fee (this booth)</dt>
                          <dd className="font-bold text-warm-900 dark:text-white">${Number(payoutInfo.boothFee).toFixed(2)}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-warm-600 dark:text-warm-400">Revenue share (this booth)</dt>
                          <dd className="font-bold text-warm-900 dark:text-white">{payoutInfo.revenueSharePercent}%</dd>
                        </div>
                      </dl>
                      <p className="text-xs text-warm-500 dark:text-warm-400 mt-3">
                        These terms apply only to this booth — you may have different terms at other malls or markets.
                      </p>
                    </div>

                    <div className="mb-6">
                      <h2 className="text-sm font-bold text-warm-700 dark:text-warm-300 uppercase mb-3">Payout History</h2>
                      {payoutInfo.payouts.length === 0 ? (
                        <p className="text-sm text-warm-500 dark:text-warm-400">No payouts yet</p>
                      ) : (
                        <ul className="divide-y divide-warm-200 dark:divide-gray-700">
                          {payoutInfo.payouts.map((p) => (
                            <li key={p.id} className="py-2 flex justify-between text-sm">
                              <span className="text-warm-700 dark:text-warm-300">{p.status}</span>
                              <span className="font-bold text-warm-900 dark:text-white">${Number(p.netPayout).toFixed(2)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-warm-500 dark:text-warm-400 mb-4">Loading your booth details...</p>
                )}

                <button
                  onClick={handleStartOnboarding}
                  disabled={onboarding || !myBoothId}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                >
                  {onboarding ? 'Redirecting to Stripe...' : 'Set Up Payouts (Stripe)'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VendorBoothTokenPage;
