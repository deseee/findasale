import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import api from '../../lib/api';
import { useOrganizerTier, type SubscriptionTier } from '../../hooks/useOrganizerTier';
import DowngradePreviewModal from '../../components/DowngradePreviewModal';

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
  const [showDowngradePreview, setShowDowngradePreview] = useState(false);
  const [downgradePreview, setDowngradePreview] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    // Admin users don't have billing accounts — skip the API call
    if (user?.roles?.includes('ADMIN')) {
      setLoading(false);
      return;
    }
    try {
      const response = await api.get('/billing/subscription');
      setSubscription(response.data);
    } catch (error) {
      console.error('Error fetching subscription:', error);
      if (!tier) {
        showToast('Failed to load subscription', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setCanceling(true);
    try {
      const updated = await api.post('/billing/cancel');
      setSubscription(updated.data);
      setShowCancelConfirm(false);
      showToast('Subscription canceled. Your plan will remain active until the end of the current period.', 'success');
      setTimeout(fetchSubscription, 1000);
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
      const data = await api.post('/billing/portal');
      if (data.data?.url) {
        window.location.href = data.data.url;
      } else {
        showToast('Failed to open billing portal', 'error');
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
              <div className="space-y-8 mb-8">
                {/* Free Tier Status Card */}
                <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
                  <h2 className="font-semibold text-blue-900 dark:text-blue-200 mb-3">You're on the Free Plan</h2>
                  <p className="text-blue-800 dark:text-blue-300 mb-4">
                    You get 200 items per sale, 5 photos each, and 100 auto tags per month. Pay 10% when items sell.
                  </p>
                </div>

                {/* Upgrade to PRO Section */}
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-8">
                  <h3 className="text-2xl font-bold text-amber-900 dark:text-amber-100 mb-2">
                    Ready to Scale?
                  </h3>
                  <p className="text-amber-800 dark:text-amber-200 mb-6">
                    Upgrade to PRO ($29/month) and unlock powerful tools for running multiple sales.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                      <p className="font-semibold text-amber-900 dark:text-amber-100 mb-1">3 concurrent sales</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">Run multiple sales at the same time.</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                      <p className="font-semibold text-amber-900 dark:text-amber-100 mb-1">500 items per sale</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">5x the items vs. Free. Sell more without limits.</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                      <p className="font-semibold text-amber-900 dark:text-amber-100 mb-1">2,000 auto tags/month</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">Every item tagged and described automatically.</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                      <p className="font-semibold text-amber-900 dark:text-amber-100 mb-1">Lower fees (8%)</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">Save 2% on every sale. Breakeven after 14 sales/month.</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                      <p className="font-semibold text-amber-900 dark:text-amber-100 mb-1">Advanced analytics</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">Flip Report shows exactly what sold and what didn't.</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                      <p className="font-semibold text-amber-900 dark:text-amber-100 mb-1">24/7 support</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">AI-powered support assistant whenever you need help.</p>
                    </div>
                  </div>

                  <Link href="/organizer/pricing" className="inline-block bg-amber-600 dark:bg-amber-700 text-white px-8 py-3 rounded-lg font-semibold hover:bg-amber-700 dark:hover:bg-amber-600 transition">
                    Upgrade to PRO
                  </Link>
                </div>

                {/* À La Carte Option */}
                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-8">
                  <h3 className="text-2xl font-bold text-purple-900 dark:text-purple-100 mb-2">
                    Just one big sale?
                  </h3>
                  <p className="text-purple-800 dark:text-purple-200 mb-6">
                    Upgrade that sale for $9.99 to unlock PRO-level capacity without a monthly subscription.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                      <p className="font-semibold text-purple-900 dark:text-purple-100 mb-1">500 items & 10 photos each</p>
                      <p className="text-sm text-purple-700 dark:text-purple-300">Everything you need for a large sale.</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                      <p className="font-semibold text-purple-900 dark:text-purple-100 mb-1">500 auto tags included</p>
                      <p className="text-sm text-purple-700 dark:text-purple-300">Descriptions write themselves. Save hours of work.</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                      <p className="font-semibold text-purple-900 dark:text-purple-100 mb-1">Flip Report</p>
                      <p className="text-sm text-purple-700 dark:text-purple-300">See what sold, what didn't, and your earnings.</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                      <p className="font-semibold text-purple-900 dark:text-purple-100 mb-1">Virtual Queue</p>
                      <p className="text-sm text-purple-700 dark:text-purple-300">Manage early birds and long lines automatically.</p>
                    </div>
                  </div>

                  <p className="text-sm text-purple-700 dark:text-purple-300 mb-6">
                    One-time $9.99 charge when you publish the sale. Same 10% platform fee applies.
                  </p>

                  <Link href="/organizer/pricing" className="inline-block bg-purple-600 dark:bg-purple-700 text-white px-8 py-3 rounded-lg font-semibold hover:bg-purple-700 dark:hover:bg-purple-600 transition">
                    Learn about À La Carte
                  </Link>
                </div>
              </div>
            ) : tier === 'TEAMS' ? (
              /* TEAMS users: show tier info even without Stripe subscription */
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Your TEAMS Plan</h2>

                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-8">
                    <p className="text-green-900 dark:text-green-200">
                      Your TEAMS plan was set up directly. For billing questions or changes, contact{' '}
                      <a href="mailto:support@finda.sale" className="underline font-medium">support@finda.sale</a>.
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
              /* PRO users: show tier info even without Stripe subscription */
              <div className="space-y-8">
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                  <div className="p-8 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Your PRO Plan</h2>

                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-8">
                      <p className="text-green-900 dark:text-green-200">
                        You are on the PRO plan with access to all PRO features.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Plan Tier</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">PRO</p>
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
                          <p className="font-semibold text-gray-900 dark:text-gray-100">Up to 500 Items per Sale</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Manage larger inventories</p>
                        </div>
                      </li>
                      <li className="flex items-start">
                        <span className="text-green-600 mr-3 mt-0.5">✓</span>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-gray-100">Up to 10 Photos per Item</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Showcase your items in detail</p>
                        </div>
                      </li>
                      <li className="flex items-start">
                        <span className="text-green-600 mr-3 mt-0.5">✓</span>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-gray-100">Batch Operations</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Edit multiple items at once</p>
                        </div>
                      </li>
                      <li className="flex items-start">
                        <span className="text-green-600 mr-3 mt-0.5">✓</span>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-gray-100">Analytics & Reporting</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Track sales performance and trends</p>
                        </div>
                      </li>
                      <li className="flex items-start">
                        <span className="text-green-600 mr-3 mt-0.5">✓</span>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-gray-100">Data Exports</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Export your inventory and sales data</p>
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

                {/* Upgrade to TEAMS Section */}
                <div className="bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-8">
                  <h3 className="text-2xl font-bold text-teal-900 dark:text-teal-100 mb-2">
                    Growing Your Team?
                  </h3>
                  <p className="text-teal-800 dark:text-teal-200 mb-6">
                    Upgrade to TEAMS ($79/month) to unlock team management, unlimited sales, and command center controls.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                      <p className="font-semibold text-teal-900 dark:text-teal-100 mb-1">Unlimited concurrent sales</p>
                      <p className="text-sm text-teal-700 dark:text-teal-300">Run as many sales as you need simultaneously.</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                      <p className="font-semibold text-teal-900 dark:text-teal-100 mb-1">Up to 12 team members</p>
                      <p className="text-sm text-teal-700 dark:text-teal-300">Add members, set custom roles & permissions. Add more at $20/mo each.</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                      <p className="font-semibold text-teal-900 dark:text-teal-100 mb-1">Unlimited items & photos</p>
                      <p className="text-sm text-teal-700 dark:text-teal-300">No per-sale limits. Auto tags unlimited too.</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                      <p className="font-semibold text-teal-900 dark:text-teal-100 mb-1">Command Center</p>
                      <p className="text-sm text-teal-700 dark:text-teal-300">Manage all your sales from one dashboard.</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                      <p className="font-semibold text-teal-900 dark:text-teal-100 mb-1">Webhooks & API access</p>
                      <p className="text-sm text-teal-700 dark:text-teal-300">Connect to your other business systems.</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                      <p className="font-semibold text-teal-900 dark:text-teal-100 mb-1">Same 8% platform fee</p>
                      <p className="text-sm text-teal-700 dark:text-teal-300">Save 2% per sale vs. Free. ROI on team coordination.</p>
                    </div>
                  </div>

                  <p className="text-sm text-teal-700 dark:text-teal-300 mb-6">
                    TEAMS is designed for organizers running flea markets, auction houses, or multi-location operations with team members.
                  </p>

                  <Link href="/organizer/pricing" className="inline-block bg-teal-600 dark:bg-teal-700 text-white px-8 py-3 rounded-lg font-semibold hover:bg-teal-700 dark:hover:bg-teal-600 transition">
                    Upgrade to TEAMS
                  </Link>
                </div>
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
            <div className="space-y-8 mb-8">
              {/* Free Tier Status Card */}
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
                <h2 className="font-semibold text-blue-900 dark:text-blue-200 mb-3">You're on the Free Plan</h2>
                <p className="text-blue-800 dark:text-blue-300">
                  You get 200 items per sale, 5 photos each, and 100 auto tags per month. Pay 10% when items sell.
                </p>
              </div>

              {/* Upgrade to PRO Section */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-8">
                <h3 className="text-2xl font-bold text-amber-900 dark:text-amber-100 mb-2">
                  Ready to Scale?
                </h3>
                <p className="text-amber-800 dark:text-amber-200 mb-6">
                  Upgrade to PRO ($29/month) and unlock powerful tools for running multiple sales.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                    <p className="font-semibold text-amber-900 dark:text-amber-100 mb-1">3 concurrent sales</p>
                    <p className="text-sm text-amber-700 dark:text-amber-300">Run multiple sales at the same time.</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                    <p className="font-semibold text-amber-900 dark:text-amber-100 mb-1">500 items per sale</p>
                    <p className="text-sm text-amber-700 dark:text-amber-300">5x the items vs. Free. Sell more without limits.</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                    <p className="font-semibold text-amber-900 dark:text-amber-100 mb-1">2,000 auto tags/month</p>
                    <p className="text-sm text-amber-700 dark:text-amber-300">Every item tagged and described automatically.</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                    <p className="font-semibold text-amber-900 dark:text-amber-100 mb-1">Lower fees (8%)</p>
                    <p className="text-sm text-amber-700 dark:text-amber-300">Save 2% on every sale. Breakeven after 14 sales/month.</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                    <p className="font-semibold text-amber-900 dark:text-amber-100 mb-1">Advanced analytics</p>
                    <p className="text-sm text-amber-700 dark:text-amber-300">Flip Report shows exactly what sold and what didn't.</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                    <p className="font-semibold text-amber-900 dark:text-amber-100 mb-1">24/7 support</p>
                    <p className="text-sm text-amber-700 dark:text-amber-300">AI-powered support assistant whenever you need help.</p>
                  </div>
                </div>

                <Link href="/organizer/pricing" className="inline-block bg-amber-600 dark:bg-amber-700 text-white px-8 py-3 rounded-lg font-semibold hover:bg-amber-700 dark:hover:bg-amber-600 transition">
                  Upgrade to PRO
                </Link>
              </div>

              {/* À La Carte Option */}
              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-8">
                <h3 className="text-2xl font-bold text-purple-900 dark:text-purple-100 mb-2">
                  Just one big sale?
                </h3>
                <p className="text-purple-800 dark:text-purple-200 mb-6">
                  Upgrade that sale for $9.99 to unlock PRO-level capacity without a monthly subscription.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                    <p className="font-semibold text-purple-900 dark:text-purple-100 mb-1">500 items & 10 photos each</p>
                    <p className="text-sm text-purple-700 dark:text-purple-300">Everything you need for a large sale.</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                    <p className="font-semibold text-purple-900 dark:text-purple-100 mb-1">500 auto tags included</p>
                    <p className="text-sm text-purple-700 dark:text-purple-300">Descriptions write themselves. Save hours of work.</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                    <p className="font-semibold text-purple-900 dark:text-purple-100 mb-1">Flip Report</p>
                    <p className="text-sm text-purple-700 dark:text-purple-300">See what sold, what didn't, and your earnings.</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                    <p className="font-semibold text-purple-900 dark:text-purple-100 mb-1">Virtual Queue</p>
                    <p className="text-sm text-purple-700 dark:text-purple-300">Manage early birds and long lines automatically.</p>
                  </div>
                </div>

                <p className="text-sm text-purple-700 dark:text-purple-300 mb-6">
                  One-time $9.99 charge when you publish the sale. Same 10% platform fee applies.
                </p>

                <Link href="/organizer/pricing" className="inline-block bg-purple-600 dark:bg-purple-700 text-white px-8 py-3 rounded-lg font-semibold hover:bg-purple-700 dark:hover:bg-purple-600 transition">
                  Learn about À La Carte
                </Link>
              </div>
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
                      {subscription.billingInterval
                        ? subscription.billingInterval
                        : tier === 'TEAMS'
                          ? <span className="text-gray-500 dark:text-gray-500 text-base">Organization billing</span>
                          : <span className="text-gray-500 dark:text-gray-500 text-base">Unavailable</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Status</p>
                    <div className="flex items-center">
                      <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                        subscription.status === 'active' ? 'bg-green-500' :
                        subscription.status === 'past_due' ? 'bg-yellow-500' :
                        subscription.status === 'canceled' ? 'bg-gray-400' :
                        !subscription.status && tier === 'TEAMS' ? 'bg-green-500' :
                        'bg-blue-500'
                      }`}></span>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 capitalize">
                        {subscription.status || (tier === 'TEAMS' ? 'Active' : 'Unknown')}
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
                        : tier === 'TEAMS'
                          ? <span className="text-gray-500 dark:text-gray-500 text-base">Contact support</span>
                          : <span className="text-gray-500 dark:text-gray-500 text-base">Unavailable</span>}
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

              {/* Plan Limits Section */}
              {(tier === 'PRO' || tier === 'TEAMS') && (
                <div className="p-8 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Plan Limits</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm text-gray-700 dark:text-gray-300">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">Items per sale</p>
                      <p>{tier === 'PRO' ? '500' : 'Unlimited'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">Photos per item</p>
                      <p>{tier === 'PRO' ? '10' : 'Unlimited'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">Concurrent sales</p>
                      <p>{tier === 'PRO' ? '3' : 'Unlimited'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">Platform fee</p>
                      <p>8%</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
                    For detailed analytics, visit your{' '}
                    <Link href="/organizer/dashboard" className="text-sage-600 hover:text-sage-700 font-semibold">
                      dashboard
                    </Link>.
                  </p>
                </div>
              )}


              {/* Payment Method & Actions */}
              <div className="p-8">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Plan Actions</h3>

                <div className="space-y-4">
                  {subscription.billingInterval ? (
                    <button
                      onClick={handleManagePlan}
                      disabled={managingPlan}
                      className="block w-full text-center bg-sage-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-sage-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {managingPlan ? 'Opening Portal...' : 'Manage Plan'}
                    </button>
                  ) : (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                      <p className="text-green-800 dark:text-green-200 text-sm">
                        Your TEAMS plan was set up directly. For billing questions or changes, contact{' '}
                        <a href="mailto:support@finda.sale" className="underline font-medium">support@finda.sale</a>.
                      </p>
                    </div>
                  )}

                  <Link
                    href="/pricing"
                    className="block w-full text-center bg-gray-200 text-gray-900 py-3 px-4 rounded-lg font-semibold hover:bg-gray-300 transition dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
                  >
                    Change Plan
                  </Link>

                  {(tier === 'PRO' || tier === 'TEAMS') && (
                    <button
                      onClick={async () => {
                        setLoadingPreview(true);
                        try {
                          const res = await api.get('/billing/downgrade-preview');
                          setDowngradePreview(res.data);
                        } catch {
                          setDowngradePreview(null);
                        } finally {
                          setLoadingPreview(false);
                          setShowDowngradePreview(true);
                        }
                      }}
                      disabled={loadingPreview}
                      className="block w-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 py-3 px-4 rounded-lg font-semibold hover:bg-amber-100 transition border border-amber-200 dark:border-amber-800 disabled:opacity-50"
                    >
                      {loadingPreview ? 'Loading...' : 'Downgrade to SIMPLE'}
                    </button>
                  )}

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
                    className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg font-semibold hover:bg-gray-200 dark:hover:bg-gray-600 transition disabled:opacity-50"
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

          {/* Downgrade Preview Modal — shows when user initiates downgrade to SIMPLE */}
          <DowngradePreviewModal
            isOpen={showDowngradePreview}
            onClose={() => setShowDowngradePreview(false)}
            preview={{
              currentTier: downgradePreview?.currentTier || tier || 'PRO',
              itemsHidden: downgradePreview?.itemsHidden ?? 0,
              photosAffected: downgradePreview?.photosAffected ?? 0,
              graceEndDate: downgradePreview?.graceEndDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              teamMembersLosing: downgradePreview?.teamMembersLosing ?? 0,
              totalItems: downgradePreview?.totalItems ?? 0,
            }}
            onConfirm={async () => {
              await handleCancel();
            }}
          />
        </div>
      </div>
    </>
  );
}
