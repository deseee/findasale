import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import { useOrganizerTier, type SubscriptionTier } from '../../hooks/useOrganizerTier';
import UsageBar from '../../components/UsageBar';

interface Subscription {
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  priceId: string | null;
  billingInterval: 'monthly' | 'annual' | null;
}

export default function SubscriptionPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { tier } = useOrganizerTier();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [managingPlan, setManagingPlan] = useState(false);

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      const response = await fetch('/api/billing/subscription', {
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        setSubscription(data);
      } else {
        showToast('Failed to load subscription', 'error');
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
      showToast('Failed to load subscription', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setCanceling(true);
    try {
      const response = await fetch('/api/billing/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const updated = await response.json();
        setSubscription(updated);
        setShowCancelConfirm(false);
        showToast('Subscription canceled. Your plan will remain active until the end of the current period.', 'success');
        // Refresh to get updated data
        setTimeout(fetchSubscription, 1000);
      } else {
        showToast('Failed to cancel subscription', 'error');
      }
    } catch (error) {
      console.error('Error canceling subscription:', error);
      showToast('Failed to cancel subscription', 'error');
    } finally {
      setCanceling(false);
    }
  };

  const handleManagePlan = async () => {
    setManagingPlan(true);
    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          showToast('Failed to open billing portal', 'error');
        }
      } else {
        showToast('Failed to access billing portal', 'error');
      }
    } catch (error) {
      console.error('Error accessing billing portal:', error);
      showToast('Failed to access billing portal', 'error');
    } finally {
      setManagingPlan(false);
    }
  };

  if (loading) {
    return (
      <>
        <Head>
          <title>Subscription Settings | FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-white dark:bg-gray-800 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading subscription...</p>
          </div>
        </div>
      </>
    );
  }

  if (!subscription) {
    return (
      <>
        <Head>
          <title>Subscription Settings | FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-white dark:bg-gray-800 p-8">
          <div className="max-w-2xl mx-auto">
            <h1 className="font-fraunces text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">Subscription Settings</h1>

            {/* SIMPLE tier users: show friendly message */}
            {tier === 'SIMPLE' ? (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-8">
                <h2 className="font-semibold text-blue-900 mb-3">You're on the Free Plan</h2>
                <p className="text-blue-800 mb-4">
                  Upgrade to PRO to unlock batch operations, analytics, exports, and more.
                </p>
                <Link href="/pricing" className="inline-block bg-sage-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-sage-700 transition">
                  Upgrade to PRO
                </Link>
              </div>
            ) : tier === 'TEAMS' ? (
              /* TEAMS users: show tier info even without Stripe subscription */
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Your TEAMS Plan</h2>

                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-8">
                    <p className="text-green-900 dark:text-green-200">
                      Your TEAMS plan is managed by your organization admin. Contact your account administrator for billing inquiries.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Plan Tier</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">TEAMS</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Status</p>
                      <div className="flex items-center">
                        <span className="inline-block w-2 h-2 rounded-full mr-2 bg-green-500"></span>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">Active</p>
                      </div>
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Included Features</h3>
                  <ul className="space-y-3 mb-8">
                    <li className="flex items-start">
                      <span className="text-green-600 mr-3 mt-0.5">✓</span>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">Unlimited Items per Sale</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">No limits on inventory</p>
                      </div>
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-600 mr-3 mt-0.5">✓</span>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">Unlimited Photos per Item</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Showcase your items fully</p>
                      </div>
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-600 mr-3 mt-0.5">✓</span>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">Multi-User Team Workspace</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Invite and manage team members with custom roles</p>
                      </div>
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-600 mr-3 mt-0.5">✓</span>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">API Access & Webhooks</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Integrate with your systems</p>
                      </div>
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-600 mr-3 mt-0.5">✓</span>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">Advanced Analytics & Insights</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Data export, reports, and detailed metrics</p>
                      </div>
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-600 mr-3 mt-0.5">✓</span>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">Priority Support</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">24-hour response time</p>
                      </div>
                    </li>
                  </ul>

                  <div className="flex gap-4">
                    <Link
                      href="/pricing"
                      className="inline-block bg-sage-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-sage-700 transition"
                    >
                      Compare All Plans
                    </Link>
                  </div>
                </div>
              </div>
            ) : tier === 'PRO' ? (
              /* PRO users: show support message if subscription failed to load */
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6">
                <p className="text-amber-900 dark:text-amber-200">
                  Subscription managed externally or not yet configured. Contact support@finda.sale if you need help.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Subscription Settings | FindA.Sale</title>
        <meta name="description" content="Manage your FindA.Sale subscription" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-sage-50 to-white dark:from-gray-900 dark:to-gray-800 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <h1 className="font-fraunces text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">Subscription Settings</h1>

          {/* SIMPLE Plan Message */}
          {tier === 'SIMPLE' && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-8">
              <h2 className="font-semibold text-blue-900 mb-3">You're on the Free Plan</h2>
              <p className="text-blue-800 mb-4">
                Upgrade to PRO to unlock batch operations, analytics, exports, and more.
              </p>
              <Link href="/pricing" className="inline-block bg-sage-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-sage-700 transition">
                Upgrade to PRO
              </Link>
            </div>
          )}

          {/* PRO/TEAMS Plan Details */}
          {(tier === 'PRO' || tier === 'TEAMS') && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              {/* Current Plan Section */}
              <div className="p-8 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Current Plan</h2>

                <div className="grid grid-cols-2 gap-6 mb-8">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Plan</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{tier}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Billing Interval</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 capitalize">
                      {subscription.billingInterval || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Status</p>
                    <div className="flex items-center">
                      <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                        subscription.status === 'active' ? 'bg-green-500' :
                        subscription.status === 'past_due' ? 'bg-yellow-500' :
                        subscription.status === 'canceled' ? 'bg-gray-400' :
                        'bg-blue-500'
                      }`}></span>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 capitalize">
                        {subscription.status || 'Unknown'}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Renews On</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {subscription.currentPeriodEnd
                        ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })
                        : 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Cancellation Status */}
                {subscription.cancelAtPeriodEnd && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg p-4 mb-8">
                    <p className="text-amber-900">
                      ⚠️ Your subscription is scheduled to end on{' '}
                      <strong>
                        {subscription.currentPeriodEnd
                          ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })
                          : 'the end of your current period'}
                      </strong>
                      . You can reactivate anytime.
                    </p>
                  </div>
                )}
              </div>

              {/* Usage Stats Section */}
              {(tier === 'PRO' || tier === 'TEAMS') && (
                <div className="p-8 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Usage Overview</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Items per Sale */}
                    <div>
                      <UsageBar
                        label="Items per Sale Limit"
                        current={0}
                        limit={tier === 'PRO' ? 500 : 9999}
                        unit="items"
                        showPercent={false}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        {tier === 'PRO'
                          ? 'PRO: 500 items per sale'
                          : 'TEAMS: Unlimited items per sale'}
                      </p>
                    </div>

                    {/* Photos per Item */}
                    <div>
                      <UsageBar
                        label="Photos per Item Limit"
                        current={0}
                        limit={tier === 'PRO' ? 10 : 9999}
                        unit="photos"
                        showPercent={false}
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        {tier === 'PRO'
                          ? 'PRO: 10 photos per item'
                          : 'TEAMS: Unlimited photos per item'}
                      </p>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-6">
                    💡 Usage stats are computed from your sales data. Check your{' '}
                    <Link href="/organizer/dashboard" className="text-sage-600 hover:text-sage-700 font-semibold">
                      dashboard
                    </Link>
                    {' '}for detailed analytics.
                  </p>
                </div>
              )}


              {/* Payment Method & Actions */}
              <div className="p-8">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Plan Actions</h3>

                <div className="space-y-4">
                  <button
                    onClick={handleManagePlan}
                    disabled={managingPlan}
                    className="block w-full text-center bg-sage-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-sage-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {managingPlan ? 'Opening Portal...' : 'Manage Plan'}
                  </button>

                  <Link
                    href="/pricing"
                    className="block w-full text-center bg-gray-200 text-gray-900 py-3 px-4 rounded-lg font-semibold hover:bg-gray-300 transition dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
                  >
                    Change Plan
                  </Link>

                  {!subscription.cancelAtPeriodEnd && (
                    <button
                      onClick={() => setShowCancelConfirm(true)}
                      className="block w-full bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 py-3 px-4 rounded-lg font-semibold hover:bg-red-100 transition border border-red-200 dark:border-red-800"
                    >
                      Cancel Subscription
                    </button>
                  )}

                  {subscription.cancelAtPeriodEnd && (
                    <button
                      disabled
                      className="block w-full bg-gray-100 text-gray-700 dark:text-gray-300 py-3 px-4 rounded-lg font-semibold cursor-not-allowed"
                    >
                      Subscription Ending
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Cancel Confirmation Modal */}
          {showCancelConfirm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-md w-full p-8">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Cancel Subscription?</h2>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Your {tier} subscription will remain active until{' '}
                  <strong>
                    {subscription.currentPeriodEnd
                      ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                      : 'the end of your current period'}
                  </strong>
                  . You can reactivate your subscription anytime.
                </p>
                <div className="flex gap-4">
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    disabled={canceling}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-900 dark:text-gray-100 rounded-lg font-semibold hover:bg-gray-200 transition disabled:opacity-50"
                  >
                    Keep Subscription
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={canceling}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition disabled:opacity-50"
                  >
                    {canceling ? 'Canceling...' : 'Cancel'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
