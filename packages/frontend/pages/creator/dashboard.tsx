/**
 * Creator Dashboard
 *
 * Hub for creators to view affiliate/referral analytics and manage settings.
 * Accessible only to authenticated creators.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import Head from 'next/head';

interface CreatorStats {
  totalClicks: number;
  totalConversions: number;
  totalLinks: number;
}

interface ReferralData {
  totalReferrals: number;
  conversions: number;
  earnings: string;
  referrals: Array<{
    id: string;
    name: string;
    joinedAt: string;
  }>;
}

interface StripeStatus {
  onboarded: boolean;
  needsSetup: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
}

const CreatorDashboard = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'analytics' | 'settings'>('analytics');

  // Redirect if not authenticated or not a creator
  if (!isLoading && (!user || user.role !== 'CREATOR')) {
    router.push('/login');
    return null;
  }

  // Fetch creator affiliate stats
  const {
    data: creatorStats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats
  } = useQuery({
    queryKey: ['creator-stats', user?.id],
    queryFn: async () => {
      const response = await api.get('/affiliate/stats');
      return response.data as CreatorStats;
    },
    enabled: !!user?.id,
  });

  // Fetch referral dashboard data
  const {
    data: referralData,
    isLoading: referralLoading,
    error: referralError,
    refetch: refetchReferrals
  } = useQuery({
    queryKey: ['referral-dashboard', user?.id],
    queryFn: async () => {
      const response = await api.get('/referrals/dashboard');
      return response.data as ReferralData;
    },
    enabled: !!user?.id,
  });

  // Fetch Stripe connection status
  const {
    data: stripeStatus,
    isLoading: stripeLoading,
    error: stripeError,
    refetch: refetchStripe
  } = useQuery({
    queryKey: ['stripe-status', user?.id],
    queryFn: async () => {
      const response = await api.get('/stripe/account-status');
      return response.data as StripeStatus;
    },
    enabled: !!user?.id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
        <p className="text-warm-600 dark:text-warm-400">Loading...</p>
      </div>
    );
  }

  const handleConnectStripe = () => {
    router.push('/creator/connect-stripe');
  };

  return (
    <>
      <Head>
        <title>Creator Dashboard - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Creator Dashboard</h1>
          <p className="text-warm-600 dark:text-warm-400 mb-6">Manage your referrals and earnings</p>

          {/* Tab Navigation */}
          <div className="flex gap-4 mb-8 border-b border-warm-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('analytics')}
              className={`pb-2 font-medium ${
                activeTab === 'analytics'
                  ? 'border-b-2 border-amber-600 text-amber-600'
                  : 'text-warm-600 dark:text-warm-400 hover:text-warm-900'
              }`}
            >
              Analytics
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`pb-2 font-medium ${
                activeTab === 'settings'
                  ? 'border-b-2 border-amber-600 text-amber-600'
                  : 'text-warm-600 dark:text-warm-400 hover:text-warm-900'
              }`}
            >
              Settings
            </button>
          </div>

          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <div>
              {statsLoading || referralLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="card p-6 animate-pulse">
                      <div className="h-4 bg-warm-200 rounded w-1/2 mb-2" />
                      <div className="h-8 bg-warm-200 rounded" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {/* Key Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="card p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-100">
                      <p className="text-warm-600 dark:text-warm-400 text-sm font-medium">Referral Clicks</p>
                      <p className="text-4xl font-bold text-warm-900 dark:text-warm-100 mt-2">
                        {creatorStats?.totalClicks || 0}
                      </p>
                      <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">This month</p>
                    </div>

                    <div className="card p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-100">
                      <p className="text-warm-600 dark:text-warm-400 text-sm font-medium">Conversions</p>
                      <p className="text-4xl font-bold text-warm-900 dark:text-warm-100 mt-2">
                        {creatorStats?.totalConversions || referralData?.conversions || 0}
                      </p>
                      <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Sign-ups + purchases</p>
                    </div>

                    <div className="card p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-100">
                      <p className="text-warm-600 dark:text-warm-400 text-sm font-medium">Total Earnings</p>
                      <p className="text-4xl font-bold text-warm-900 dark:text-warm-100 mt-2">
                        ${referralData?.earnings || '0.00'}
                      </p>
                      <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Pending payout</p>
                    </div>
                  </div>

                  {/* Commission Rate Info */}
                  <div className="card p-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg mb-8">
                    <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-2">Commission Tier</h3>
                    <p className="text-warm-700 dark:text-warm-300">
                      You earn <span className="font-bold text-amber-600">10%</span> commission on all referral-driven purchases.
                      Increase your conversions to unlock higher tier rates.
                    </p>
                  </div>

                  {/* Recent Referral Activity */}
                  <div className="card p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-100">
                    <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">Recent Referrals</h3>
                    {referralData && referralData.referrals && referralData.referrals.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-warm-200 dark:border-gray-700">
                              <th className="text-left py-2 text-warm-600 dark:text-warm-400 font-medium">Name</th>
                              <th className="text-left py-2 text-warm-600 dark:text-warm-400 font-medium">Joined</th>
                              <th className="text-right py-2 text-warm-600 dark:text-warm-400 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {referralData.referrals.map((referral) => (
                              <tr key={referral.id} className="border-b border-warm-100 hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900">
                                <td className="py-3 text-warm-900 dark:text-warm-100">{referral.name}</td>
                                <td className="py-3 text-warm-600 dark:text-warm-400">
                                  {new Date(referral.joinedAt).toLocaleDateString()}
                                </td>
                                <td className="py-3 text-right">
                                  <span className="inline-block bg-green-100 text-green-800 dark:text-green-200 text-xs font-semibold px-2 py-1 rounded">
                                    Active
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-warm-600 dark:text-warm-400 text-center py-8">
                        No referral activity yet. Share your links to start earning.
                      </p>
                    )}
                  </div>
                </>
              )}

              {statsError && (
                <div className="card p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-red-800 mb-3">Failed to load analytics</p>
                  <button
                    onClick={() => {
                      refetchStats();
                      refetchReferrals();
                    }}
                    className="text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div>
              {stripeLoading ? (
                <div className="space-y-6">
                  <div className="card p-6 animate-pulse">
                    <div className="h-4 bg-warm-200 rounded w-1/3 mb-4" />
                    <div className="h-10 bg-warm-200 rounded" />
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Payment / Payout Info */}
                  <div className="card p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-100">
                    <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">Payment & Payouts</h3>

                    {stripeStatus?.needsSetup ? (
                      <div className="bg-warm-50 dark:bg-gray-900 border border-warm-200 dark:border-gray-700 rounded p-4">
                        <p className="text-warm-700 dark:text-warm-300 mb-4">
                          Connect your Stripe account to receive payouts for your referrals.
                        </p>
                        <button
                          onClick={handleConnectStripe}
                          className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded transition-colors"
                        >
                          Connect Stripe
                        </button>
                      </div>
                    ) : stripeStatus?.onboarded ? (
                      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-green-600">✓</span>
                          <p className="text-green-800 dark:text-green-200 font-semibold">Stripe Connected</p>
                        </div>
                        <p className="text-green-700 text-sm">
                          Your Stripe account is fully set up. You can receive payouts automatically.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-yellow-600">!</span>
                          <p className="text-yellow-800 font-semibold">Setup Incomplete</p>
                        </div>
                        <p className="text-yellow-700 text-sm mb-4">
                          Your Stripe account needs additional information before you can receive payouts.
                        </p>
                        <button
                          onClick={handleConnectStripe}
                          className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-6 rounded transition-colors text-sm"
                        >
                          Complete Setup
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Notification Preferences */}
                  <div className="card p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-100">
                    <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">Notifications</h3>
                    <div className="space-y-4">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          defaultChecked
                          className="w-4 h-4 rounded border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 text-amber-600"
                        />
                        <div>
                          <p className="font-medium text-warm-900 dark:text-warm-100">New Referrals</p>
                          <p className="text-xs text-warm-600 dark:text-warm-400">Get notified when someone signs up via your link</p>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          defaultChecked
                          className="w-4 h-4 rounded border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 text-amber-600"
                        />
                        <div>
                          <p className="font-medium text-warm-900 dark:text-warm-100">Earnings Updated</p>
                          <p className="text-xs text-warm-600 dark:text-warm-400">Notify when new commissions are earned</p>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 text-amber-600"
                        />
                        <div>
                          <p className="font-medium text-warm-900 dark:text-warm-100">Weekly Summary</p>
                          <p className="text-xs text-warm-600 dark:text-warm-400">Weekly digest of your referral activity</p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Creator Tier */}
                  <div className="card p-6 bg-gradient-to-r from-amber-50 to-warm-50 rounded-lg shadow-sm border border-amber-200">
                    <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-3">Creator Tier</h3>
                    <p className="text-warm-700 dark:text-warm-300 mb-4">
                      Your current tier: <span className="font-bold text-amber-600">Bronze</span>
                    </p>
                    <div className="bg-white dark:bg-gray-800 rounded p-4 mb-4">
                      <div className="flex justify-between mb-2">
                        <p className="text-xs text-warm-600 dark:text-warm-400">Progress to Silver</p>
                        <p className="text-xs font-semibold text-warm-900 dark:text-warm-100">3 / 10 referrals</p>
                      </div>
                      <div className="w-full bg-warm-200 rounded-full h-2">
                        <div
                          className="bg-amber-600 h-2 rounded-full"
                          style={{ width: '30%' }}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-warm-600 dark:text-warm-400">
                      Reach Silver tier for higher commission rates and exclusive features.
                    </p>
                  </div>
                </div>
              )}

              {stripeError && (
                <div className="card p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-red-800 mb-3">Failed to load settings</p>
                  <button
                    onClick={() => refetchStripe()}
                    className="text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CreatorDashboard;