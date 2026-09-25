/**
 * Vendor Booth Payments — Vendor-Facing Booth View (2026-07-07)
 * ADR-015/016/017. Public/token-gated read + claim CTA. Once claimed, shows
 * itemized fee disclosure (platform's flat 10% + THIS booth's boothFee + THIS
 * booth's revenueSharePercent — never a blended number, since one vendor can
 * have different terms at different malls) and Square onboarding status. Stripe
 * onboarding removed 2026-09-09 -- the Stripe platform account is permanently closed.
 * Functional over polished — correctness and full state coverage prioritized.
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import VendorBoothFeeBillingSetup from '../../components/VendorBoothFeeBillingSetup';
import FinixBoothOnboardingForm from '../../components/FinixBoothOnboardingForm';

// Booth rent auto-pay (2026-09-14, claude_docs/feature-notes/
// booth-rent-autopay-square-design-2026-09-13.md): the Stripe SetupIntent-based stopgap
// described in this flag's history (audit sweep, 2026-09-10 -- Stripe's platform account
// permanently closed 2026-09-12) is gone. VendorBoothFeeBillingSetup now uses Square's Web
// Payments SDK (no Stripe Elements provider needed here anymore) and
// vendorBoothFeeBillingCron.ts charges directly on the hub owner's own connected Square
// account using the vendor's platform-account shared card -- see the design doc for the
// full architecture. Flipped on now that steps 1-7 of that doc's task breakdown are built.
const ENABLE_BOOTH_FEE_AUTOPAY = true;

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
  // 2026-09-25 (Patrick correction): the real min/max of the platform's channel-dependent
  // fee schedule (6-7.5% for PRO/TEAMS, 8-9.5% for SIMPLE), not just the single IN_PERSON
  // number this booth's own register happens to charge.
  platformFeePercentMin: number;
  platformFeePercentMax: number;
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
  /** Whether the HUB OWNER has finished connecting Square -- gates whether the
   *  square-setup card-entry form can render at all (2026-09-14 Square design §7). */
  squareReady?: boolean;
  squareLocationId?: string | null;
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
 * Square status for this booth, from GET /vendor-booth/:id/square/status
 * (vendorBoothController.ts getVendorBoothSquareStatus). Cache-only -- confirmed via direct
 * read of that controller's own comment: there is no live re-verify against Square on every
 * poll. Square is the sole payout processor for vendor booths -- Stripe onboarding removed
 * 2026-09-09 (the Stripe platform account is permanently closed, superseding the 2026-09-07
 * "Stripe stays available" decision).
 */
interface SquarePayoutStatus {
  squareAccountId: string | null;
  squareOnboarded: boolean;
  payoutsFlaggedForReview: boolean;
}

/**
 * 'loading'    nothing decided yet. Never render a setup button in this state.
 * 'notStarted' no Square account on this booth at all.
 * 'incomplete' an account exists but Square hasn't reported it as onboarded yet -- this is
 *              cache-only, there is no live re-verify against Square on every poll.
 * 'ready'      Square reports the account onboarded.
 * 'unknown'    this booth is not one of the signed-in user's booths, or the lookup failed.
 */
type SquarePayoutSetupState = 'loading' | 'notStarted' | 'incomplete' | 'ready' | 'unknown';

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
  const [feeBillingFailed, setFeeBillingFailed] = useState(false);
  const [cancellingAutopay, setCancellingAutopay] = useState(false);

  // Square is the sole payout processor for vendor booths. Stripe onboarding removed
  // 2026-09-09 -- the Stripe platform account is permanently closed. Supersedes the
  // 2026-09-07 "Stripe stays available" decision. (Booth Rent Auto-Pay below also moved to
  // Square, 2026-09-14 -- no Stripe.js/Elements usage remains on this page.)
  const [squareStatus, setSquareStatus] = useState<SquarePayoutStatus | null>(null);
  const [squarePayoutSetup, setSquarePayoutSetup] = useState<SquarePayoutSetupState>('loading');
  const [squareOnboarding, setSquareOnboarding] = useState(false);

  // Cache-only -- no live re-verify against Square (see SquarePayoutStatus's comment above).
  const deriveSquarePayoutSetup = (s: SquarePayoutStatus): SquarePayoutSetupState => {
    if (!s.squareAccountId) return 'notStarted';
    if (!s.squareOnboarded) return 'incomplete';
    return 'ready';
  };

  const refreshSquareStatus = async (boothId: string) => {
    try {
      const response = await api.get(`/vendor-booth/${boothId}/square/status`);
      setSquareStatus(response.data);
      setSquarePayoutSetup(deriveSquarePayoutSetup(response.data));
    } catch (error: any) {
      console.error('Error checking Square payout status:', error);
      setSquarePayoutSetup('unknown');
    }
  };

  // Booth rent auto-pay "Cancel" affordance (2026-09-14 Square design §7/§8.2) -- the
  // Stripe-era UI never needed this: auto-pay never actually worked in production, so
  // nobody had ever turned it off. Calls the new cancel endpoint, then re-fetches
  // fee-billing/status from the server (rather than optimistically setting local state)
  // so the UI reflects exactly what the backend now believes, same as the initial load.
  const handleCancelAutopay = async () => {
    if (!myBoothId) return;
    setCancellingAutopay(true);
    try {
      await api.post(`/vendor-booth/${myBoothId}/fee-billing/cancel`);
      const response = await api.get(`/vendor-booth/${myBoothId}/fee-billing/status`);
      setFeeBillingStatus(response.data);
      showToast('Booth rent auto-pay turned off', 'success');
    } catch (error: any) {
      console.error('Error cancelling booth rent auto-pay:', error);
      showToast(error?.response?.data?.error || 'Failed to turn off auto-pay', 'error');
    } finally {
      setCancellingAutopay(false);
    }
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
          // Not awaited on purpose: it has its own try/catch, and the Square payout state
          // must still resolve even if the /payouts or fee-billing calls below fail.
          refreshSquareStatus(match.id);
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
          setSquarePayoutSetup('unknown');
        }
      } catch (error: any) {
        console.error('Error loading vendor booth details:', error);
        if (!matchFound) {
          setSquarePayoutSetup('unknown');
        }
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

  const handleStartSquareOnboarding = async () => {
    if (!myBoothId) return;
    setSquareOnboarding(true);
    try {
      const response = await api.post(`/vendor-booth/${myBoothId}/square/onboard`, {});
      // Same reuse-resolution as Stripe's linkedExistingAccount above, Square's version --
      // see startVendorBoothSquareOnboarding's own comment (vendorBoothController.ts): if the
      // claiming user already has a working Square identity as an Organizer, the backend
      // copies it over directly instead of sending them through OAuth a second time.
      if (response.data.linkedExistingAccount) {
        showToast('Linked to your existing Square account. You can start taking payments.', 'success');
        setSquareOnboarding(false);
        refreshSquareStatus(myBoothId);
        return;
      }
      if (response.data.alreadyOnboarded) {
        setSquareOnboarding(false);
        refreshSquareStatus(myBoothId);
        return;
      }
      // Open in a new tab and poll for the result instead of a same-tab redirect. Square has
      // one fixed OAuth callback URL with no per-request return_url the way Stripe's
      // accountLinks have, and that callback's REDIRECT_TARGET map has no entry for
      // VENDOR_BOOTH -- it falls through to "close this tab and return to your booth" copy
      // that assumes a new tab, not this tab, left for the callback. A same-tab redirect here
      // would strand the vendor with no way back to this exact booth page (see
      // square-oauth-callback.tsx's own REDIRECT_TARGET map and this page's spec notes).
      window.open(response.data.onboardingUrl, '_blank');
      window.setTimeout(() => refreshSquareStatus(myBoothId), 3000);
      setSquareOnboarding(false);
    } catch (error: any) {
      console.error('Error starting Square onboarding:', error);
      showToast(error.response?.data?.error || "We couldn't start connecting Square. Please try again.", 'error');
      setSquareOnboarding(false);
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
                          <dt className="text-warm-600 dark:text-warm-400">Platform fee</dt>
                          <dd className="font-bold text-warm-900 dark:text-white">
                            {payoutInfo.platformFeePercentMin === payoutInfo.platformFeePercentMax
                              ? `${payoutInfo.platformFeePercentMin}%`
                              : `${payoutInfo.platformFeePercentMin}-${payoutInfo.platformFeePercentMax}%`}
                          </dd>
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
                        The platform fee is {payoutInfo.platformFeePercentMin}% on a sale rung up in person at
                        your booth's register and {payoutInfo.platformFeePercentMax}% on a sale completed
                        remotely (for example, a hosted checkout link) -- it is FindA.Sale's fee, not the
                        mall's, and applies either way.
                      </p>
                      {payoutInfo.revenueSharePercent > 0 && (
                        <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">
                          The {payoutInfo.revenueSharePercent}% revenue share only comes out when someone
                          else checks the customer out for you -- a team member, the mall owner, or another
                          booth. Ring up your own sale yourself and this booth's revenue share is waived for
                          that sale.
                        </p>
                      )}
                      <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">
                        These terms apply only to this booth. You may have different terms at other malls or markets.
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
                          {payoutInfo.platformFeePercent}% platform fee (in-person rate) and, on sales someone
                          else checked out for you, the {payoutInfo.revenueSharePercent}% revenue share
                          listed above were taken out. Booth rent is billed separately.
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
                          <div>
                            <p className="text-sm text-green-700 dark:text-green-400">
                              ✓ Auto-pay active
                              {feeBillingStatus.brand && feeBillingStatus.last4
                                ? `. ${feeBillingStatus.brand} ending in ${feeBillingStatus.last4}`
                                : ''}
                            </p>
                            <button
                              type="button"
                              onClick={handleCancelAutopay}
                              disabled={cancellingAutopay}
                              className="mt-2 text-xs font-medium text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                            >
                              {cancellingAutopay ? 'Turning off...' : 'Cancel auto-pay'}
                            </button>
                          </div>
                        ) : !ENABLE_BOOTH_FEE_AUTOPAY ? (
                          <p className="text-sm text-warm-500 dark:text-warm-400">
                            Booth rent auto-pay isn&apos;t available right now. Contact your hub
                            organizer to arrange paying your booth rent directly.
                          </p>
                        ) : !feeBillingStatus.squareReady || !feeBillingStatus.squareLocationId ? (
                          <p className="text-sm text-warm-500 dark:text-warm-400">
                            Your hub organizer hasn&apos;t finished connecting Square yet, so booth
                            rent auto-pay isn&apos;t available. Contact them to arrange paying your
                            booth rent directly for now.
                          </p>
                        ) : myBoothId ? (
                          <VendorBoothFeeBillingSetup
                            vendorBoothId={myBoothId}
                            boothFee={payoutInfo.boothFee}
                            squareLocationId={feeBillingStatus.squareLocationId}
                            onConfigured={() => {
                              showToast('Booth rent auto-pay is set up', 'success');
                              setFeeBillingStatus({ ...feeBillingStatus, configured: true });
                            }}
                          />
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
                ) : squarePayoutSetup === 'unknown' ? null : (
                  <p className="text-sm text-warm-500 dark:text-warm-400 mb-4">Loading your booth details...</p>
                )}

                {/* Payout setup -- Square is the sole processor. Stripe onboarding removed
                    2026-09-09 (the Stripe platform account is permanently closed; supersedes
                    the 2026-09-07 "Stripe stays available" decision). Square's status here is
                    cache-only (no live re-verify), so there is no "Check again" button -- there
                    is nothing new for it to check (see getVendorBoothSquareStatus's own
                    comment). */}
                {squarePayoutSetup === 'loading' ? (
                  <p className="text-sm text-warm-500 dark:text-warm-400 mt-4">
                    Checking your Square payout setup...
                  </p>
                ) : squarePayoutSetup === 'unknown' ? null : squarePayoutSetup === 'ready' ? (
                  <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <p className="text-sm font-bold text-green-800 dark:text-green-300">
                      Square payouts are set up
                    </p>
                    <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                      Card payments at your booth can go to your Square account. There is nothing
                      else for you to do.
                    </p>
                    {squareStatus?.payoutsFlaggedForReview && (
                      <div className="mt-3 rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 p-3">
                        <p className="text-xs text-blue-800 dark:text-blue-200">
                          As a routine precaution, our team is taking a quick look at this account
                          before payouts begin. You'll be notified as soon as that's done. No
                          action is needed from you.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-4">
                    {squarePayoutSetup === 'incomplete' ? (
                      <div className="mb-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800 rounded-lg">
                        <p className="text-sm font-bold text-amber-900 dark:text-amber-300">
                          Your Square setup is not finished
                        </p>
                        <p className="text-sm text-amber-800 dark:text-amber-400 mt-1">
                          Your Square account setup isn't fully finished on Square's side yet. You
                          may need to complete a few more steps in Square before payouts can go
                          through.
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-warm-600 dark:text-warm-400 mb-3">
                        Set up payouts through Square so you get your money. Card payments at
                        your booth cannot reach you until this is done.
                      </p>
                    )}
                    <button
                      onClick={handleStartSquareOnboarding}
                      disabled={squareOnboarding || !myBoothId}
                      className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                    >
                      {squareOnboarding
                        ? 'Connecting…'
                        : squarePayoutSetup === 'incomplete'
                        ? 'Finish Payout Setup (Square)'
                        : 'Set Up Payouts (Square)'}
                    </button>
                  </div>
                )}

                {/* Finix hub payments (ADR-127 SS5.3, 2026-09-19) -- additive, sandbox-only,
                    separate from the Square payout setup above. Only rendered once we know
                    which booth this vendor operates. */}
                {myBoothId && <FinixBoothOnboardingForm vendorBoothId={myBoothId} />}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VendorBoothTokenPage;
