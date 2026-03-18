/**
 * Organizer Reputation Dashboard
 *
 * Feature #71: Displays organizer's reputation score, breakdown, and actionable tips
 * to improve. Accessible only to authenticated organizers.
 */

import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import { useReputationBreakdown } from '../../hooks/useReputation';
import ReputationBadge from '../../components/ReputationBadge';
import Layout from '../../components/Layout';
import Skeleton from '../../components/Skeleton';
import EmptyState from '../../components/EmptyState';
import { ArrowUp, TrendingUp, AlertCircle, Check } from 'lucide-react';

const OrganizerReputationPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  // Redirect if not authenticated or not an organizer
  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'ORGANIZER')) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const { data: reputation, isLoading, error } = useReputationBreakdown(user?.id || '');

  if (authLoading || isLoading) {
    return (
      <Layout>
        <Head>
          <title>Reputation | FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-white dark:bg-gray-900">
          <div className="max-w-4xl mx-auto px-4 py-12">
            <Skeleton className="h-12 w-48 mb-6" />
            <Skeleton className="h-40 w-full mb-8" />
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!user || user.role !== 'ORGANIZER') {
    return null;
  }

  if (error) {
    return (
      <Layout>
        <Head>
          <title>Reputation | FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-white dark:bg-gray-900 py-12">
          <EmptyState
            heading="Unable to Load Reputation"
            subtext="We couldn't fetch your reputation data. Please try again later."
            cta={{ label: 'Back to Dashboard', href: '/organizer/dashboard' }}
          />
        </div>
      </Layout>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 4.5) return 'text-green-600 dark:text-green-400';
    if (score >= 3.5) return 'text-blue-600 dark:text-blue-400';
    if (score >= 2.5) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreBg = (score: number) => {
    if (score >= 4.5) return 'bg-green-50 dark:bg-green-900/20';
    if (score >= 3.5) return 'bg-blue-50 dark:bg-blue-900/20';
    if (score >= 2.5) return 'bg-amber-50 dark:bg-amber-900/20';
    return 'bg-red-50 dark:bg-red-900/20';
  };

  const scoreColor = getScoreColor(reputation?.score || 0);
  const scoreBg = getScoreBg(reputation?.score || 0);

  return (
    <Layout>
      <Head>
        <title>Reputation | FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-white dark:bg-gray-900">
        {/* Header */}
        <div className="bg-gradient-to-r from-sage-green/10 to-sage-green/5 dark:from-gray-800 dark:to-gray-900 py-12 px-4">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              ⭐ Your Reputation Score
            </h1>
            <p className="text-lg text-gray-700 dark:text-gray-300">
              Build trust with shoppers and unlock premium features
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto px-4 py-12">
          {/* Current Score Card */}
          <div className={`${scoreBg} rounded-lg border border-gray-200 dark:border-gray-700 p-8 mb-8`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Current Score
              </h2>
              <TrendingUp className={`w-6 h-6 ${scoreColor}`} />
            </div>

            <div className="flex items-end gap-6 mb-6">
              <div>
                <div className={`text-6xl font-bold ${scoreColor} mb-2`}>
                  {reputation?.score.toFixed(1) || '0.0'}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">out of 5.0 stars</div>
              </div>

              <div className="ml-auto">
                {reputation && (
                  <ReputationBadge
                    score={reputation.score}
                    isNew={reputation.isNew}
                    size="large"
                    showCount
                    saleCount={reputation.saleCount}
                  />
                )}
              </div>
            </div>

            {reputation?.isNew && (
              <div className="bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded-lg p-4 text-sm text-blue-900 dark:text-blue-200">
                <div className="flex gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong>New Organizer Badge:</strong> You'll earn this badge until you've completed 3 sales.
                    It helps shoppers identify newer organizers while building your track record.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Sales Count */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-white">Total Sales</h3>
                <div className="text-2xl font-bold text-sage-green">
                  {reputation?.saleCount || 0}
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                More sales = higher reputation. Host your next sale to build credibility.
              </p>
            </div>

            {/* Photo Quality */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-white">Photo Quality</h3>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {(reputation?.photoQualityAvg || 0).toFixed(1)}
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Average photos per item. Better photos = higher appeal to shoppers.
              </p>
            </div>

            {/* Response Time */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-white">Avg Response Time</h3>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {(reputation?.responseTimeAvg || 0).toFixed(0)}
                  <span className="text-sm text-gray-600 dark:text-gray-400 ml-1">hrs</span>
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                How quickly you respond to inquiries. Faster = more trustworthy.
              </p>
            </div>

            {/* Dispute Rate */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-white">Dispute Rate</h3>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  0%
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Keep this low. Disputes hurt your reputation score.
              </p>
            </div>
          </div>

          {/* Tips to Improve */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <ArrowUp className="w-5 h-5 text-sage-green" />
              How to Improve Your Score
            </h2>

            <div className="space-y-4">
              <div className="flex gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-sage-green/20 dark:bg-sage-green/30">
                    <Check className="w-5 h-5 text-sage-green" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                    Take High-Quality Photos
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Add at least 3–5 photos per item. Clear, well-lit photos increase perceived item value
                    and reduce buyer hesitation.
                  </p>
                </div>
              </div>

              <div className="flex gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-sage-green/20 dark:bg-sage-green/30">
                    <Check className="w-5 h-5 text-sage-green" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                    Respond Quickly to Inquiries
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Answer shopper questions within 2 hours. Fast responses show you're attentive and professional.
                  </p>
                </div>
              </div>

              <div className="flex gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-sage-green/20 dark:bg-sage-green/30">
                    <Check className="w-5 h-5 text-sage-green" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                    Host More Sales
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Each successful sale boosts your reputation. Aim for at least one sale per month.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-sage-green/20 dark:bg-sage-green/30">
                    <Check className="w-5 h-5 text-sage-green" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                    Avoid Disputes
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Accurate descriptions, fair pricing, and transparent policies minimize buyer complaints.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Call-to-Action */}
          <div className="mt-8 bg-sage-green/10 dark:bg-sage-green/20 rounded-lg border border-sage-green/30 dark:border-sage-green/50 p-6 text-center">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Ready to boost your sales?
            </h3>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              High-reputation organizers get featured placement, verified badges, and access to premium features.
            </p>
            <button
              onClick={() => router.push('/organizer/create-sale')}
              className="inline-block px-6 py-3 bg-sage-green hover:bg-sage-green/90 text-white font-semibold rounded-lg transition-colors"
            >
              Create Your Next Sale
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default OrganizerReputationPage;
