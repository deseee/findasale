/**
 * Organizer Reviews Management — Respond to customer reviews
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import Head from 'next/head';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import StarRating from '../../components/StarRating';
import Skeleton from '../../components/Skeleton';

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

export default function OrganizerReviews() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState<Record<string, string>>({});

  // Redirect if not authenticated or not an organizer
  React.useEffect(() => {
    if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  const { data, isLoading } = useQuery<ReviewsResponse>({
    queryKey: ['reviews', 'organizer', 'me', user?.id, page],
    queryFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');
      const res = await api.get(`/reviews/organizer/me`, {
        params: { page, limit: 10 }
      });
      return res.data;
    },
    enabled: !!user?.id && user.roles?.includes('ORGANIZER'),
  });

  const respondMutation = useMutation({
    mutationFn: async ({ reviewId, response }: { reviewId: string; response: string }) => {
      const res = await api.patch(`/reviews/${reviewId}/respond`, { response });
      return res.data;
    },
    onSuccess: (updated) => {
      showToast('Response submitted successfully!', 'success');
      setExpandedReviewId(null);
      setResponseText(prev => {
        const newState = { ...prev };
        delete newState[updated.id];
        return newState;
      });
      queryClient.invalidateQueries({
        queryKey: ['reviews', 'organizer', 'me', user?.id]
      });
    },
    onError: (err: any) => {
      showToast(err.response?.data?.error || 'Failed to submit response', 'error');
    },
  });

  const handleRespond = (reviewId: string) => {
    const text = (responseText[reviewId] || '').trim();
    if (!text) {
      showToast('Please enter a response', 'error');
      return;
    }
    respondMutation.mutate({ reviewId, response: text });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <Skeleton className="h-12 w-64 mb-8" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!user?.organizerId) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <p className="text-center text-gray-600 dark:text-gray-400">Not authorized</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Customer Reviews — FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50 mb-2">
              Customer Reviews
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Respond to customer reviews and build trust
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          ) : !data || data.reviews.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
              <p className="text-gray-500 dark:text-gray-400 text-lg">
                No reviews yet. Once customers leave reviews, you can respond here.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-4 mb-6">
                {data.reviews.map((review) => (
                  <div
                    key={review.id}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700"
                  >
                    {/* Review Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-50">
                          {review.user.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          on {review.sale.title}
                        </p>
                      </div>
                      <div className="text-right">
                        <StarRating value={review.rating} size="sm" />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {format(new Date(review.createdAt), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>

                    {/* Review Comment */}
                    {review.comment && (
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-4 bg-gray-50 dark:bg-gray-700 p-3 rounded">
                        {review.comment}
                      </p>
                    )}

                    {/* Existing Response */}
                    {review.respondedAt && review.response && (
                      <div className="mb-4 pl-4 border-l-2 border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/20 p-3 rounded">
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                          Your response:
                        </p>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                          {review.response}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {format(new Date(review.respondedAt), 'MMM d, yyyy')}
                        </p>
                      </div>
                    )}

                    {/* Respond Form */}
                    {expandedReviewId === review.id ? (
                      <div className="mt-4 space-y-3">
                        <textarea
                          value={responseText[review.id] || review.response || ''}
                          onChange={(e) =>
                            setResponseText(prev => ({
                              ...prev,
                              [review.id]: e.target.value
                            }))
                          }
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
                              onClick={() => {
                                setExpandedReviewId(null);
                                setResponseText(prev => {
                                  const newState = { ...prev };
                                  delete newState[review.id];
                                  return newState;
                                });
                              }}
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
                        onClick={() => {
                          setExpandedReviewId(review.id);
                          setResponseText(prev => ({
                            ...prev,
                            [review.id]: review.response || ''
                          }));
                        }}
                        className="text-sm font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
                      >
                        {review.response ? 'Edit response' : 'Respond'}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {data.pages > 1 && (
                <div className="flex justify-center gap-3 pt-4">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
                  >
                    ← Previous
                  </button>
                  <span className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                    Page {page} of {data.pages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(data.pages, p + 1))}
                    disabled={page === data.pages}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
