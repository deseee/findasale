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
import Link from 'next/link';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import VendorBoothFeeBillingSetup from '../../components/VendorBoothFeeBillingSetup';

// Module-level singleton, same pattern as CheckoutModal.tsx / pos.tsx -- avoids
// re-creating the Stripe.js instance on every render.
let stripePromise: Promise<Stripe | null> | null = null;
const getStripePromise = () => {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  }
  return stripePromise;
};

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

interface FeeBillingStatus {
  configured: boolean;
  brand?: string;
  last4?: string;
}

interface FeeCharge {
  id: string;
  periodStart: string;
  periodEnd: string;
  amountCents: number;
  status: string;
  failureReason: string | null;
  createdAt: string;
}

/**
 * Live Stripe payout state for this booth, from GET /vendor-booth/:id/stripe/status
 * (vendorBoothController.ts getVendorBoothStripeStatus). That endpoint re-reads Stripe
 * and self-heals the stored VendorBooth.stripeOnboarded flag, so it -- not the possibly
 * stale boolean on /my-booths -- decides what this page shows.
 */
interface StripePayoutStatus {
  stripeOnboarded: boolean; // Stripe charges_enabled
  payoutsEnabled?: boolean; // Stripe payouts_enabled -- NOT the same thing
  status: string; // 'NOT_STARTED' | 'PENDING' | 'COMPLETE'
}

/**
 * 'loading'    nothing decided yet. Never render a setup button in this state.
 * 'notStarted' no Stripe account on this booth at all.
 * 'incomplete' an account exists but the vendor cannot actually be paid yet.
 * 'ready'      charges AND payouts enabled. No primary setup call to action.
 * 'unknown'    this booth is not one of the signed-in user's booths, or the lookup failed.
 */
type PayoutSetupState = 'loading' | 'notStarted' | 'incomplete' | 'ready' | 'unknown';

const VendorBoothTokenPage: React.FC = () => {
  const router = useRouter();
  const { boothToken } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [summary, setSummary] = useState<PublicBoothSummary | null>(null);
  const [payoutInfo, setPayoutInfo] = useState<PayoutInfo | null>(null);
  const [feeBillingStatus, setFeeBillingStatus] = useState<FeeBillingStatus | null>(null);
  const [feeCharges, setFeeCharges] = useState<FeeCharge[]>([]);
  const [myBoothId, setMyBoothId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<StripePayoutStatus | null>(null);
  const [payoutSetup, setPayoutSetup] = useState<PayoutSetupState>('loading');
  const [payoutCheckFailed, setPayoutCheckFailed] = useState(false);
  const [recheckingPayouts, setRecheckingPayouts] = useState(false);
  const [feeBillingFailed, setFeeBillingFailed] = useState(false);

  // charges_enabled and payouts_enabled are NOT the same thing. A Stripe account can be
  // allowed to take card payments while Stripe still refuses to pay the money out (bank
  // details missing, or an unmet requirement). Treating charges_enabled alone as "done"
  // is what made a half-finished booth look finished.
  const derivePayoutSetup = (s: StripePayoutStatus): PayoutSetupState => {
    if (s.status === 'NOT_STARTED') return 'notStarted';
    if (!s.stripeOnboarded) return 'incomplete';
    if (s.payoutsEnabled === false) return 'incomplete';
    if (s.status === 'PENDING') return 'incomplete';
    return 'ready';
  };

  const refreshStripeStatus = async (boothId: string, storedOnboarded?: boolean) => {
    try {
      const response = await api.get(`/vendor-booth/${boothId}/stripe/status`);
      setStripeStatus(response.data);
      setPayoutSetup(derivePayoutSetup(response.data));
      setPayoutCheckFailed(false);
    } catch (error: any) {
      // Live check unavailable. Fall back to the stored flag from /my-booths instead of
      // breaking the page -- and never fall back in the direction that shows a vendor who
      // is already set up a "Set Up Payouts" button.
      console.error('Error checking Stripe payout status:', error);
      setPayoutCheckFailed(true);
      setPayoutSetup(storedOnboarded ? 'ready' : 'notStarted');
    }
  };

  const handleRecheckPayouts = async () => {
    if (!myBoothId) return;
    setRecheckingPayouts(true);
    await refreshStripeStatus(myBoothId, payoutSetup === 'ready');
    setRecheckingPayouts(false);
  };

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
      // Local, not the myBoothId state: the catch below runs in the same closure and
      // would still see the pre-update state value, which would wrongly blank the payout
      // block for a booth we did in fact find.
      let matchFound = false;
      try {
        const response = await api.get('/vendor-booth/my-booths');
        const match = (response.data || []).find(
          (b: any) => b.boothNumber === summary.boothNumber && b.vendorName === summary.vendorName
        );
        if (match) {
          matchFound = true;
          setMyBoothId(match.id);
          // Not awaited on purpose: it has its own try/catch, and the payout state must
          // still resolve even if the /payouts or fee-billing calls below fail.
          refreshStripeStatus(match.id, match.stripeOnboarded);
          const payoutResponse = await api.get(`/vendor-booth/${match.id}/payouts`);
          setPayoutInfo(payoutResponse.data);
          // Own try/catch: if this fails, feeBillingStatus stays null, and null is the
          // "still checking" state -- without this the rent section would sit on
          // "Checking your auto-pay setup..." forever with no way out.
          try {
            const [feeBillingResponse, feeChargesResponse] = await Promise.all([
              api.get(`/vendor-booth/${match.id}/fee-billing/status`),
              api.get(`/vendor-booth/${match.id}/fee-charges`),
            ]);
            setFeeBillingStatus(feeBillingResponse.data);
            setFeeCharges(feeChargesResponse.data?.charges || []);
            setFeeBillingFailed(false);
          } catch (feeError: any) {
            console.error('Error loading booth rent auto-pay status:', feeError);
            setFeeBillingFailed(true);
          }
        } else {
          setPayoutSetup('unknown');
        }
      } catch (error: any) {
        console.error('Error loading vendor booth details:', error);
        if (!matchFound) setPayoutSetup('unknown');
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
        {/* Breaks the circle. Until now this page was the ONLY caller of
            /vendor-booth/my-booths, and you could only open it if you already held the
            booth token, so a vendor who lost the invite email had no way back in.
            /vendor/booths lists every booth this user has claimed and needs no token. */}
        {user && (
          <Link
            href="/vendor/booths"
            className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 font-medium mb-4 inline-block"
          >
            &larr; All your booths
          </Link>
        )}

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
                      <h2 className="text-sm font-bold text-warm-700 dark:text-warm-300 uppercase mb-3">Sales History</h2>
                      {payoutInfo.payouts.length === 0 ? (
                        <p className="text-sm text-warm-500 dark:text-warm-400">No sales recorded yet</p>
                      ) : (
                        <>
                        {/* Renders VendorBoothPayout.totalSales (gross sales for the period),
                            NOT netPayout. netPayout is still returned by the API
                            (vendorBoothController.ts getVendorBoothPayouts) and is deliberately
                            left untouched for back-compat, but it is not a true figure for a
                            vendor: it subtracts booth rent (billed separately by
                            vendorBoothFeeBillingCron.ts) and subtracts neither the platform fee
                            nor the revenue share, both of which are taken at capture time
                            (vendorBoothCartController.ts computeLegFeeSplit :84-111). totalSales
                            is the only stored figure here that is true on its own, so it is what
                            the vendor sees. Approved product decision, not a silent swap. */}
                        <p className="text-xs text-warm-500 dark:text-warm-400 mb-2">
                          This is the total that sold at your booth in each period, before fees. It is not
                          a deposit. Your money already arrived in your account at checkout, after the{' '}
                          {payoutInfo.platformFeePercent}% platform fee and the {payoutInfo.revenueSharePercent}%
                          revenue share listed above were taken out. Booth rent is billed separately.
                          {Number(payoutInfo.boothFee) > 0 ? ' See Booth Rent Auto-Pay below.' : ''}
                        </p>
                        <ul className="divide-y divide-warm-200 dark:divide-gray-700">
                          {payoutInfo.payouts.map((p) => (
                            <li key={p.id} className="py-2 flex justify-between text-sm">
                              <span className="text-warm-700 dark:text-warm-300">{p.status}</span>
                              <span className="text-right">
                                <span className="block font-bold text-warm-900 dark:text-white">
                                  ${Number(p.totalSales).toFixed(2)}
                                </span>
                                <span className="block text-xs text-warm-500 dark:text-warm-400">Total sold</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                        <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">
                          For every $100 that sells at your booth, about $
                          {Math.max(0, 100 - payoutInfo.platformFeePercent - payoutInfo.revenueSharePercent).toFixed(2)}{' '}
                          reaches your account.
                        </p>
                        </>
                      )}
                    </div>

                    {/* Booth-fee (rent) auto-pay -- only relevant when this booth actually
                        has a flat fee. VendorBooth.vendorPaymentMethodId is what
                        vendorBoothFeeBillingCron.ts checks before it can charge rent --
                        until it's set, real bookings sit at PENDING_PAYMENT_METHOD forever. */}
                    {Number(payoutInfo.boothFee) > 0 && (
                      <div className="mb-6 p-4 bg-warm-50 dark:bg-gray-700 rounded-lg">
                        <h2 className="text-sm font-bold text-warm-700 dark:text-warm-300 uppercase mb-3">
                          Booth Rent Auto-Pay
                        </h2>
                        {feeBillingFailed ? (
                          <p className="text-sm text-warm-500 dark:text-warm-400">
                            We could not check your auto-pay setup. Please refresh the page.
                          </p>
                        ) : feeBillingStatus === null ? (
                          <p className="text-sm text-warm-500 dark:text-warm-400">
                            Checking your auto-pay setup...
                          </p>
                        ) : feeBillingStatus.configured ? (
                          <p className="text-sm text-green-700 dark:text-green-400">
                            ✓ Auto-pay active
                            {feeBillingStatus.brand && feeBillingStatus.last4
                              ? ` — ${feeBillingStatus.brand} ending in ${feeBillingStatus.last4}`
                              : ''}
                          </p>
                        ) : myBoothId ? (
                          <Elements stripe={getStripePromise()}>
                            <VendorBoothFeeBillingSetup
                              vendorBoothId={myBoothId}
                              boothFee={payoutInfo.boothFee}
                              onConfigured={() => {
                                showToast('Booth rent auto-pay is set up', 'success');
                                setFeeBillingStatus({ configured: true });
                              }}
                            />
                          </Elements>
                        ) : null}

                        <div className="mt-4 pt-4 border-t border-warm-200 dark:border-gray-600">
                          <h3 className="text-xs font-bold text-warm-600 dark:text-warm-400 uppercase mb-2">
                            Charge History
                          </h3>
                          {feeCharges.length === 0 ? (
                            <p className="text-sm text-warm-500 dark:text-warm-400">No charges yet</p>
                          ) : (
                            <ul className="divide-y divide-warm-200 dark:divide-gray-600">
                              {feeCharges.map((c) => (
                                <li key={c.id} className="py-2 flex justify-between text-sm">
                                  <span className="text-warm-700 dark:text-warm-300">
                                    {new Date(c.periodStart).toLocaleDateString()} · {c.status}
                                  </span>
                                  <span className="font-bold text-warm-900 dark:text-white">
                                    ${(c.amountCents / 100).toFixed(2)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : payoutSetup === 'unknown' ? null : (
                  <p className="text-sm text-warm-500 dark:text-warm-400 mb-4">Loading your booth details...</p>
                )}

                {/* Payout setup. This used to be one unconditional primary blue button, so a
                    vendor who had ALREADY finished Stripe onboarding was still told to go and
                    do it. It is now driven by the live status endpoint. Hiding the button in
                    the states where it does not apply is the fix. */}
                {payoutSetup === 'loading' ? (
                  <p className="text-sm text-warm-500 dark:text-warm-400">Checking your payout setup...</p>
                ) : payoutSetup === 'unknown' ? (
                  <p className="text-sm text-warm-500 dark:text-warm-400">
                    We could not load your booth details. Please refresh the page.
                  </p>
                ) : payoutSetup === 'ready' ? (
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <p className="text-sm font-bold text-green-800 dark:text-green-300">Payouts are set up</p>
                    <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                      Card payments at your booth go to your own Stripe account. There is nothing
                      else for you to do.
                    </p>
                    {payoutCheckFailed && (
                      <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">
                        We could not reach Stripe just now. This is your last saved setup.
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-4">
                      <button
                        onClick={handleRecheckPayouts}
                        disabled={recheckingPayouts || !myBoothId}
                        className="text-sm font-medium text-warm-600 hover:text-warm-800 dark:text-warm-400 dark:hover:text-warm-200 underline disabled:opacity-50"
                      >
                        {recheckingPayouts ? 'Checking...' : 'Check again'}
                      </button>
                      <button
                        onClick={handleStartOnboarding}
                        disabled={onboarding || !myBoothId}
                        className="text-sm font-medium text-warm-600 hover:text-warm-800 dark:text-warm-400 dark:hover:text-warm-200 underline disabled:opacity-50"
                      >
                        {onboarding ? 'Opening Stripe...' : 'Change your bank details'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {payoutSetup === 'incomplete' ? (
                      <div className="mb-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800 rounded-lg">
                        <p className="text-sm font-bold text-amber-900 dark:text-amber-300">
                          Your payout setup is not finished
                        </p>
                        <p className="text-sm text-amber-800 dark:text-amber-400 mt-1">
                          {stripeStatus?.stripeOnboarded
                            ? 'Your booth can take card payments, but Stripe cannot send that money to your bank yet. Finish the last steps and you will be paid.'
                            : 'You cannot be paid until this is finished. Stripe still needs a few details from you.'}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-warm-600 dark:text-warm-400 mb-3">
                        Set up payouts so you get your money. Card payments at your booth cannot
                        reach you until this is done. It takes a few minutes.
                      </p>
                    )}
                    <button
                      onClick={handleStartOnboarding}
                      disabled={onboarding || !myBoothId}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                    >
                      {onboarding
                        ? 'Redirecting to Stripe...'
                        : payoutSetup === 'incomplete'
                        ? 'Finish Payout Setup (Stripe)'
                        : 'Set Up Payouts (Stripe)'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VendorBoothTokenPage;
