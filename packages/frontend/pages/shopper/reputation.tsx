/**
 * Shopper Reputation Dashboard
 *
 * Displays shopper's reputation score, trust metrics, and recommendations
 * to build reputation in the FindA.Sale community.
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import Skeleton from '../../components/Skeleton';
import EmptyState from '../../components/EmptyState';
import { ArrowUp, TrendingUp, AlertCircle, Check, Heart, Zap } from 'lucide-react';
import api from '../../lib/api';

interface ShopperReputationData {
  purchaseCount: number;
  totalSpent: number;
  favoriteCount: number;
  paymentCompletionRate: number; // 0-100
  accountAgeDays: number;
}

const ShopperReputationPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [reputation, setReputation] = useState<ShopperReputationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Fetch shopper reputation data
  useEffect(() => {
    if (user?.id) {
      Promise.all([
        api.get('/users/me/purchases'),
        api.get('/users/me'),
      ])
        .then(([purchasesRes, userRes]) => {
          const purchases = purchasesRes.data?.purchases || [];
          const favorites = userRes.data?.favorites || [];
          const userData = userRes.data;

          const paidPurchases = purchases.filter((p: any) => p.status === 'PAID').length;
          const paymentCompletionRate = purchases.length > 0
            ? Math.round((paidPurchases / purchases.length) * 100)
            : 0;

          const totalSpent = purchases
            .filter((p: any) => p.status === 'PAID')
            .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

          const createdAt = userData.createdAt ? new Date(userData.createdAt) : new Date();
          const accountAgeDays = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

          setReputation({
            purchaseCount: purchases.length,
            totalSpent,
            favoriteCount: favorites?.length || 0,
            paymentCompletionRate,
            accountAgeDays,
          });
          setIsLoading(false);
        })
        .catch(err => {
          console.error('Error fetching shopper reputation:', err);
          setError('Unable to load reputation data');
          setIsLoading(false);
        });
    }
  }, [user?.id]);

  if (!user) {
    return null;
  }

  const getReputationLevel = (paymentRate: number, purchaseCount: number) => {
    if (purchaseCount === 0) return { label: 'New Shopper', color: 'text-gray-600 dark:text-gray-400' };
    if (paymentRate === 100 && purchaseCount >= 5) return { label: 'Trusted Buyer', color: 'text-green-600 dark:text-green-400' };
    if (paymentRate === 100) return { label: 'Reliable Buyer', color: 'text-blue-600 dark:text-blue-400' };
    if (paymentRate >= 90) return { label: 'Good Standing', color: 'text-amber-600 dark:text-amber-400' };
    return { label: 'Building Trust', color: 'text-orange-600 dark:text-orange-400' };
  };

  const reputationLevel = getReputationLevel(reputation?.paymentCompletionRate || 0, reputation?.purchaseCount || 0);

  return (
    <>
      <Head>
        <title>Your Reputation | FindA.Sale</title>
      </Head>

      {authLoading || isLoading ? (
        <div className="min-h-screen bg-white dark:bg-gray-900">
          <div className="max-w-4xl mx-auto px-4 py-12">
            <Skeleton className="h-12 w-48 mb-6" />
            <Skeleton className="h-40 w-full mb-8" />
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      ) : error ? (
        <div className="min-h-screen bg-white dark:bg-gray-900 py-12">
          <EmptyState
            heading="Unable to Load Reputation"
            subtext="We couldn't fetch your reputation data. Please try again later."
            cta={{ label: 'Back to Dashboard', href: '/shopper/dashboard' }}
          />
        </div>
      ) : (
        <div className="min-h-screen bg-white dark:bg-gray-900">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-50 to-indigo-50/50 dark:from-gray-800 dark:to-gray-900 py-12 px-4">
            <div className="max-w-4xl mx-auto">
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                ⭐ Your Reputation
              </h1>
              <p className="text-lg text-gray-700 dark:text-gray-300">
                Build trust and unlock community perks as a valued buyer
              </p>
            </div>
          </div>

          {/* Main Content */}
          <div className="max-w-4xl mx-auto px-4 py-12">
            {/* Current Score Card */}
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-700 p-8 mb-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Your Status
                </h2>
                <TrendingUp className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>

              <div className="flex items-end gap-6 mb-6">
                <div>
                  <div className={`text-3xl font-bold mb-2 ${reputationLevel.color}`}>
                    {reputationLevel.label}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {reputation?.paymentCompletionRate}% payment completion
                  </div>
                </div>

                <div className="ml-auto text-right">
                  <div className="text-4xl font-bold text-indigo-600 dark:text-indigo-400 mb-1">
                    {reputation?.purchaseCount || 0}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">purchases</div>
                </div>
              </div>

              {reputation?.purchaseCount === 0 && (
                <div className="bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded-lg p-4 text-sm text-blue-900 dark:text-blue-200">
                  <div className="flex gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong>Welcome!</strong> Your reputation will grow as you complete purchases and participate in the community.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* Purchase History */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Purchase History</h3>
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    {reputation?.purchaseCount || 0}
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Total items purchased on FindA.Sale. More purchases = stronger reputation.
                </p>
              </div>

              {/* Total Spent */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Total Spent</h3>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    ${(reputation?.totalSpent || 0).toFixed(2)}
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Total value of completed purchases across all sales.
                </p>
              </div>

              {/* Payment Completion */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Completion Rate</h3>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {reputation?.paymentCompletionRate || 0}%
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Percentage of purchases completed. Keeps you trustworthy.
                </p>
              </div>

              {/* Favorites */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Favorite Sales</h3>
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {reputation?.favoriteCount || 0}
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Sales you've saved. Active participation builds your reputation.
                </p>
              </div>
            </div>

            {/* How to Build Reputation */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-8">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                <ArrowUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                How to Build Your Reputation
              </h2>

              <div className="space-y-4">
                <div className="flex gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30">
                      <Check className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                      Complete Your Purchases
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Finish payment and pickup/delivery for all items. A 100% completion rate shows organizers you're a reliable buyer.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30">
                      <Check className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                      Shop Frequently
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Regular purchases across different sales build a strong history. More activity = more trust.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30">
                      <Check className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                      Save Your Favorites
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Heart sales you're interested in. Active browsing and participation signal genuine interest to organizers.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30">
                      <Check className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                      Use Our Features (Coming Soon)
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Once available: bidding on auctions, requesting holds, and leaving reviews will boost your standing.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30">
                      <Check className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                      Keep a Clean Record
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Avoid disputes and chargeback claims. A trustworthy account makes you eligible for special perks and early access.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Features Preview */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg border border-amber-200 dark:border-amber-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                Coming Soon: Advanced Reputation Features
              </h3>
              <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 dark:text-amber-400 mt-0.5">•</span>
                  <span><strong>Dispute History:</strong> Track resolved conflicts and resolution outcomes</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 dark:text-amber-400 mt-0.5">•</span>
                  <span><strong>Hold Honor Rate:</strong> Percentage of reserved items you purchased after placing a hold</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 dark:text-amber-400 mt-0.5">•</span>
                  <span><strong>Community Standing:</strong> Badges for loyalty, activity, and positive interactions</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 dark:text-amber-400 mt-0.5">•</span>
                  <span><strong>Buyer Reviews:</strong> See what organizers say about you after each sale</span>
                </li>
              </ul>
            </div>

            {/* Call-to-Action */}
            <div className="mt-8 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-700 p-6 text-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Ready to find your next treasure?
              </h3>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                Browse sales, make purchases, and grow your reputation in the community.
              </p>
              <button
                onClick={() => router.push('/shopper/dashboard')}
                className="inline-block px-6 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors"
              >
                Back to Shopping
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ShopperReputationPage;
