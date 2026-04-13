/**
 * Organizer Reputation Dashboard
 *
 * Feature #71: Displays organizer's reputation score, breakdown, and actionable tips
 * to improve. Accessible only to authenticated organizers.
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import { useReputationBreakdown } from '../../hooks/useReputation';
import ReputationBadge from '../../components/ReputationBadge';
import StarRating from '../../components/StarRating';
import Skeleton from '../../components/Skeleton';
import EmptyState from '../../components/EmptyState';
import { ArrowUp, TrendingUp, AlertCircle, Check } from 'lucide-react';
import api from '../../lib/api';

// --- Review Types ---
interface Review {
  id: string;
  rating: number;
  comment: string | null;
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
  user: { name: string; id: string };
  sale: { id: string; title: string };
}

interface ReviewsResponse {
  reviews: Review[];
  total: number;
  page: number;
  pages: number;
}

const OrganizerReputationPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [organizerId, setOrganizerId] = useState<string>('');

  // Tab routing
  const activeTab = (router.query.tab as string) === 'reviews' ? 'reviews' : 'reputation';
  const setTab = (tab: string) => {
    router.replace({ pathname: router.pathname, query: tab === 'reputation' ? {} : { tab } }, undefined, { shallow: true });
  };

  // --- Review state ---
  const [reviewPage, setReviewPage] = useState(1);
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState<Record<string, string>>({});

  // Redirect if not authenticated or not an organizer
  useEffect(() => {
    if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Fetch organizer ID from /organizers/me
  useEffect(() => {
    if (user?.id) {
      api.get('/organizers/me')
        .then(res => setOrganizerId(res.data.id))
        .catch(err => console.error('Failed to fetch organizer ID', err));
    }
  }, [user?.id]);

  const { data: reputation, isLoading, error } = useReputationBreakdown(organizerId);

  // --- Reviews query ---
  const { data: reviewsData, isLoading: reviewsLoading } = useQuery<ReviewsResponse>({
    queryKey: ['reviews', 'organizer', 'me', user?.id, reviewPage],
    queryFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');
      const res = await api.get('/reviews/organizer/me', { params: { page: reviewPage, limit: 10 } });
      return res.data;
    },
    enabled: !!user?.id && user.roles?.includes('ORGANIZER') && activeTab === 'reviews',
  });

  const respondMutation = useMutation({
    mutationFn: async ({ reviewId, response }: { reviewId: string; response: string }) => {
      const res = await api.patch(`/reviews/${reviewId}/respond`, { response });
      return res.data;
    },
    onSuccess: (updated) => {
      showToast('Response submitted successfully!', 'success');
      setExpandedReviewId(null);
      setResponseText(prev => { const s = { ...prev }; delete s[updated.id]; return s; });
      queryClient.invalidateQueries({ queryKey: ['reviews', 'organizer', 'me', user?.id] });
    },
    onError: (err: any) => {
      showToast(err.response?.data?.error || 'Failed to submit response', 'error');
    },
  });

  const handleRespond = (reviewId: string) => {
    const text = (responseText[reviewId] || '').trim();
    if (!text) { showToast('Please enter a response', 'error'); return; }
    respondMutation.mutate({ reviewId, response: text });
  };

  if (!user || !user.roles?.includes('ORGANIZER')) {
    return null;
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
    <>
      <Head>
        <title>Reputation & Reviews | FindA.Sale</title>
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
            cta={{ label: 'Back to Dashboard', href: '/organizer/dashboard' }}
          />
        </div>
      ) : (
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

        {/* Tab Navigation */}
        <div className="max-w-4xl mx-auto px-4 pt-8">
          <div className="flex border-b border-gray-200 dark:border-gray-700 mb-8">
            <button
              onClick={() => setTab('reputation')}
              className={`px-6 py-3 text-sm font-semibold transition-colors ${
                activeTab === 'reputation'
                  ? 'text-[#8FB897] border-b-2 border-[#8FB897]'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Reputation
            </button>
            <button
              onClick={() => setTab('reviews')}
              className={`px-6 py-3 text-sm font-semibold transition-colors ${
                activeTab === 'reviews'
                  ? 'text-[#8FB897] border-b-2 border-[#8FB897]'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Reviews
              {reviewsData?.total ? (
                <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                  {reviewsData.total}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="max-w-4xl mx-auto px-4 pb-12">
          {activeTab === 'reputation' ? (
          <>
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
                  {(reputation?.score || 0).toFixed(1)}
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
          </>
          ) : (
          /* ===== REVIEWS TAB ===== */
          <div>
            {reviewsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full" />)}
              </div>
            ) : !reviewsData || reviewsData.reviews.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                <p className="text-gray-500 dark:text-gray-400 text-lg">
                  No reviews yet. Once customers leave reviews, you can respond here.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  {reviewsData.reviews.map((review) => (
                    <div key={review.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-gray-50">{review.user.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">on {review.sale.title}</p>
                        </div>
                        <div className="text-right">
                          <StarRating value={review.rating} size="sm" />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {format(new Date(review.createdAt), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </div>

                      {review.comment && (
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-4 bg-gray-50 dark:bg-gray-700 p-3 rounded">
                          {review.comment}
                        </p>
                      )}

                      {review.respondedAt && review.response && (
                        <div className="mb-4 pl-4 border-l-2 border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/20 p-3 rounded">
                          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Your response:</p>
                          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{review.response}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {format(new Date(review.respondedAt), 'MMM d, yyyy')}
                          </p>
                        </div>
                      )}

                      {expandedReviewId === review.id ? (
                        <div className="mt-4 space-y-3">
                          <textarea
                            value={responseText[review.id] || review.response || ''}
                            onChange={(e) => setResponseText(prev => ({ ...prev, [review.id]: e.target.value }))}
                            placeholder="Share your response..."
                            maxLength={500}
                            rows={4}
                            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm text-gray-900 dark:bg-gray-700 dark:text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                          />
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {(responseText[review.id] || review.response || '').length}/500
                            </span>
                            <div className="flex gap-2">
                              <button
                                onClick={() => { setExpandedReviewId(null); setResponseText(prev => { const s = { ...prev }; delete s[review.id]; return s; }); }}
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleRespond(review.id)}
                                disabled={respondMutation.isPending}
                                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded disabled:opacity-50"
                              >
                                {respondMutation.isPending ? 'Submitting…' : 'Submit Response'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setExpandedReviewId(review.id); setResponseText(prev => ({ ...prev, [review.id]: review.response || '' })); }}
                          className="text-sm font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
                        >
                          {review.response ? 'Edit response' : 'Respond'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {reviewsData.pages > 1 && (
                  <div className="flex justify-center gap-3 pt-4">
                    <button
                      onClick={() => setReviewPage(p => Math.max(1, p - 1))}
                      disabled={reviewPage === 1}
                      className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
                    >
                      ← Previous
                    </button>
                    <span className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                      Page {reviewPage} of {reviewsData.pages}
                    </span>
                    <button
                      onClick={() => setReviewPage(p => Math.min(reviewsData.pages, p + 1))}
                      disabled={reviewPage === reviewsData.pages}
                      className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          )}
        </div>
      </div>
      )}
    </>
  );
};

export default OrganizerReputationPage;
