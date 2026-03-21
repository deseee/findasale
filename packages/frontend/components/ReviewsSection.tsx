import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import api from '../lib/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import StarRating from './StarRating';

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  user: { name: string };
  sale?: { id: string; title: string };
}

interface ReviewsResponse {
  reviews: Review[];
  total: number;
  page: number;
  pages: number;
}

interface ReviewsSectionProps {
  mode: 'sale' | 'organizer';
  saleId?: string;
  organizerId?: string;
  saleStatus?: string;
  avgRating?: number;
  totalReviews?: number;
}

const ReviewsSection: React.FC<ReviewsSectionProps> = ({
  mode,
  saleId,
  organizerId,
  saleStatus,
  avgRating,
  totalReviews,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [page, setPage] = useState(1);

  const queryKey = mode === 'sale'
    ? ['reviews', 'sale', saleId, page]
    : ['reviews', 'organizer', organizerId, page];

  const apiPath = mode === 'sale'
    ? `/reviews/sale/${saleId}`
    : `/reviews/organizer/${organizerId}`;

  const { data, isLoading } = useQuery<ReviewsResponse>({
    queryKey,
    queryFn: async () => {
      const res = await api.get(apiPath, { params: { page, limit: 5 } });
      return res.data;
    },
    enabled: !!(saleId || organizerId),
  });

  const submitMutation = useMutation({
    mutationFn: () => api.post('/reviews', { saleId, rating, comment }),
    onSuccess: () => {
      showToast('🏆 Review submitted! +5 pts', 'points');
      setRating(0);
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['reviews', 'sale', saleId] });
      queryClient.invalidateQueries({ queryKey: ['sale', saleId] });
      queryClient.invalidateQueries({ queryKey: ['organizer'] });
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to submit review.', 'error');
    },
  });

  const canReview =
    mode === 'sale' &&
    !!user &&
    !user.roles?.includes('ORGANIZER') &&
    saleStatus &&
    ['PUBLISHED', 'ENDED'].includes(saleStatus);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      showToast('Please select a star rating.', 'error');
      return;
    }
    submitMutation.mutate();
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mt-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-warm-900">
          {mode === 'sale' ? 'Reviews' : 'Customer Reviews'}
        </h2>
        {(avgRating !== undefined && avgRating > 0) && (
          <div className="flex items-center gap-2">
            <StarRating value={avgRating} size="md" />
            <span className="font-semibold text-warm-800">{avgRating.toFixed(1)}</span>
            <span className="text-sm text-warm-500">({totalReviews ?? data?.total ?? 0})</span>
          </div>
        )}
      </div>

      {canReview && (
        <form onSubmit={handleSubmit} className="mb-8 bg-warm-50 rounded-lg p-4 border border-warm-200">
          <p className="font-semibold text-warm-800 mb-3">Leave a review</p>
          <div className="flex items-center gap-3 mb-3">
            <StarRating value={rating} interactive onChange={setRating} size="lg" />
            {rating > 0 && (
              <span className="text-sm text-warm-600">
                {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][rating]}
              </span>
            )}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share your experience (optional)"
            rows={3}
            maxLength={500}
            className="w-full border border-warm-300 rounded-md px-3 py-2 text-sm text-warm-900 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-warm-400">{comment.length}/500</span>
            <button
              type="submit"
              disabled={submitMutation.isPending || rating === 0}
              className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-5 py-2 rounded disabled:opacity-50"
            >
              {submitMutation.isPending ? 'Submitting…' : 'Submit Review'}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse h-16 bg-warm-100 rounded-md" />
          ))}
        </div>
      ) : !data || data.reviews.length === 0 ? (
        <p className="text-warm-500 text-sm py-4 text-center">
          No reviews yet. {canReview ? 'Be the first!' : ''}
        </p>
      ) : (
        <div className="space-y-4">
          {data.reviews.map((review) => (
            <div key={review.id} className="border-b border-warm-100 pb-4 last:border-0">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <span className="font-semibold text-sm text-warm-800">{review.user.name}</span>
                  {review.sale && (
                    <span className="text-xs text-warm-400 ml-2">on {review.sale.title}</span>
                  )}
                </div>
                <span className="text-xs text-warm-400">
                  {format(new Date(review.createdAt), 'MMM d, yyyy')}
                </span>
              </div>
              <StarRating value={review.rating} size="sm" className="mb-1" />
              {review.comment && (
                <p className="text-sm text-warm-700 mt-1">{review.comment}</p>
              )}
            </div>
          ))}

          {data.pages > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="text-sm text-amber-600 hover:text-amber-800 disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="text-sm text-warm-500">{page} / {data.pages}</span>
              <button
                onClick={() => setPage(p => Math.min(data.pages, p + 1))}
                disabled={page === data.pages}
                className="text-sm text-amber-600 hover:text-amber-800 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReviewsSection;
