import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import UsageBar from '../../components/UsageBar';

interface Subscription {
  tier: 'SIMPLE' | 'PRO' | 'TEAMS';
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

  if (loading) {
    return (
      <>
        <Head>
          <title>Subscription Settings | FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading subscription...</p>
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
        <div className="min-h-screen bg-white p-8">
          <div className="max-w-2xl mx-auto">
            <h1 className="font-fraunces text-3xl font-bold text-gray-900 mb-8">Subscription Settings</h1>
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <p className="text-red-900">Failed to load subscription information</p>
            </div>
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

      <div className="min-h-screen bg-gradient-to-br from-sage-50 to-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <h1 className="font-fraunces text-3xl font-bold text-gray-900 mb-8">Subscription Settings</h1>

          {/* SIMPLE Plan Message */}
          {subscription.tier === 'SIMPLE' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
              <h2 className="font-semibold text-blue-900 mb-3">You're on the Free Plan</h2>
              <p className="text-blue-800 mb-4">
                Upgrade to PRO to unlock batch operations, analytics, exports, and more.
              </p>
              <Link href="/organizer/upgrade" className="inline-block bg-sage-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-sage-700 transition">
                Upgrade to PRO
              </Link>
            </div>
          )}

          {/* PRO/TEAMS Plan Details */}
          {(subscription.tier === 'PRO' || subscription.tier === 'TEAMS') && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              {/* Current Plan Section */}
              <div className="p-8 border-b border-gray-200">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Current Plan</h2>

                <div className="grid grid-cols-2 gap-6 mb-8">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Plan</p>
                    <p className="text-lg font-semibold text-gray-900">{subscription.tier}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Billing Interval</p>
                    <p className="text-lg font-semibold text-gray-900 capitalize">
                      {subscription.billingInterval || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Status</p>
                    <div className="flex items-center">
                      <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                        subscription.status === 'active' ? 'bg-green-500' :
                        subscription.status === 'past_due' ? 'bg-yellow-500' :
                        subscription.status === 'canceled' ? 'bg-gray-400' :
                        'bg-blue-500'
                      }`}></span>
                      <p className="text-lg font-semibold text-gray-900 capitalize">
                        {subscription.status || 'Unknown'}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Renews On</p>
                    <p className="text-lg font-semibold text-gray-900">
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
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8">
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
              {(subscription.tier === 'PRO' || subscription.tier === 'TEAMS') && (
                <div className="p-8 border-t border-gray-200">
                  <h3 className="text-xl font-bold text-gray-900 mb-6">Usage Overview</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Items per Sale */}
                    <div>
                      <UsageBar
                        label="Items per Sale Limit"
                        current={0}
                        limit={subscription.tier === 'PRO' ? 500 : 9999}
                        unit="items"
                        showPercent={false}
                      />
                      <p className="text-xs text-gray-500 mt-2">
                        {subscription.tier === 'PRO'
                          ? 'PRO: 500 items per sale'
                          : 'TEAMS: Unlimited items per sale'}
                      </p>
                    </div>

                    {/* Photos per Item */}
                    <div>
                      <UsageBar
                        label="Photos per Item Limit"
                        current={0}
                        limit={subscription.tier === 'PRO' ? 10 : 9999}
                        unit="photos"
                        showPercent={false}
                      />
                      <p className="text-xs text-gray-500 mt-2">
                        {subscription.tier === 'PRO'
                          ? 'PRO: 10 photos per item'
                          : 'TEAMS: Unlimited photos per item'}
                      </p>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 mt-6">
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
                <h3 className="text-xl font-bold text-gray-900 mb-6">Plan Actions</h3>

                <div className="space-y-4">
                  <Link
                    href="/organizer/upgrade"
                    className="block w-full text-center bg-sage-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-sage-700 transition"
                  >
                    Change Plan
                  </Link>

                  {!subscription.cancelAtPeriodEnd && (
                    <button
                      onClick={() => setShowCancelConfirm(true)}
                      className="block w-full bg-red-50 text-red-700 py-3 px-4 rounded-lg font-semibold hover:bg-red-100 transition border border-red-200"
                    >
                      Cancel Subscription
                    </button>
                  )}

                  {subscription.cancelAtPeriodEnd && (
                    <button
                      disabled
                      className="block w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-semibold cursor-not-allowed"
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
              <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Cancel Subscription?</h2>
                <p className="text-gray-600 mb-4">
                  Your {subscription.tier} subscription will remain active until{' '}
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
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-900 rounded-lg font-semibold hover:bg-gray-200 transition disabled:opacity-50"
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
