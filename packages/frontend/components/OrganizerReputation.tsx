import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

interface ReputationData {
  score: number | null;
  breakdown: {
    holdResponseTime: number;
    saleFrequency: number;
    photoQuality: number;
    disputeRate: number;
  };
  badge: 'new' | 'established' | null;
  salesCount: number;
}

interface OrganizerReputationProps {
  organizerId: string;
}

/**
 * Render reputation score as stars (0-5 scale)
 * Uses full stars (★), half-stars (½) for 0.5 increments, and empty stars (☆)
 */
const StarRating: React.FC<{ score: number }> = ({ score }) => {
  const fullStars = Math.floor(score);
  const hasHalf = score % 1 !== 0;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

  return (
    <span className="text-lg text-amber-500 tracking-tight">
      {'★'.repeat(fullStars)}
      {hasHalf && '½'}
      {'☆'.repeat(emptyStars)}
    </span>
  );
};

const OrganizerReputation: React.FC<OrganizerReputationProps> = ({ organizerId }) => {
  const { data: reputation, isLoading, error } = useQuery<ReputationData>({
    queryKey: ['organizer-reputation', organizerId],
    queryFn: async () => {
      const res = await api.get(`/organizers/${organizerId}/reputation`);
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-6 w-32 bg-warm-100 rounded animate-pulse" />
      </div>
    );
  }

  if (error || !reputation) {
    return null;
  }

  // New Organizer badge
  if (reputation.score === null) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-full">
        <span className="text-sm font-medium text-blue-700">New Organizer</span>
        {reputation.salesCount > 0 && (
          <span className="text-xs text-blue-600">
            ({reputation.salesCount} sale{reputation.salesCount !== 1 ? 's' : ''} so far)
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Score Display */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-1">
          <StarRating score={reputation.score} />
          <span className="text-sm text-warm-600 dark:text-gray-400">
            {reputation.score.toFixed(1)} out of 5 • {reputation.salesCount} sales
          </span>
        </div>
        {reputation.badge === 'established' && (
          <span className="inline-block px-2 py-1 bg-green-50 border border-green-200 rounded text-xs font-medium text-green-700">
            Established
          </span>
        )}
      </div>

      {/* Breakdown Details (optional expandable, but shown on hover tooltip in full version) */}
      <div className="text-xs text-warm-500 dark:text-gray-400 grid grid-cols-2 gap-2 pt-2 border-t border-warm-200 dark:border-gray-700">
        <div>
          <span className="block font-medium text-warm-700 dark:text-gray-300">Response Time</span>
          <span className="text-warm-600 dark:text-gray-400">{reputation.breakdown.holdResponseTime.toFixed(1)}/5</span>
        </div>
        <div>
          <span className="block font-medium text-warm-700 dark:text-gray-300">Sale Frequency</span>
          <span className="text-warm-600 dark:text-gray-400">{reputation.breakdown.saleFrequency.toFixed(1)}/5</span>
        </div>
        <div>
          <span className="block font-medium text-warm-700 dark:text-gray-300">Photo Quality</span>
          <span className="text-warm-600 dark:text-gray-400">{reputation.breakdown.photoQuality.toFixed(1)}/5</span>
        </div>
        <div>
          <span className="block font-medium text-warm-700 dark:text-gray-300">Reliability</span>
          <span className="text-warm-600 dark:text-gray-400">{reputation.breakdown.disputeRate.toFixed(1)}/5</span>
        </div>
      </div>
    </div>
  );
};

export default OrganizerReputation;
