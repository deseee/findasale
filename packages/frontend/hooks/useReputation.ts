import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface ReputationScore {
  score: number; // 0-5 stars
  isNew: boolean;
  responseTimeAvg: number;
  saleCount: number;
  photoQualityAvg: number;
}

export interface ReputationBreakdown extends ReputationScore {
  tips: string[];
}

/**
 * useReputation — Feature #71: Fetch organizer reputation score
 * @param organizerId - The organizer ID to fetch reputation for
 * @returns { score, isNew, responseTimeAvg, saleCount, photoQualityAvg, isLoading, error }
 */
export const useReputation = (organizerId: string) => {
  return useQuery<ReputationScore>({
    queryKey: ['reputation', organizerId],
    queryFn: async () => {
      const response = await api.get(`/organizers/${organizerId}/reputation/simple`);
      return response.data;
    },
    enabled: !!organizerId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

/**
 * useReputationBreakdown — Fetch detailed reputation breakdown for organizer dashboard
 */
export const useReputationBreakdown = (organizerId: string) => {
  return useQuery<ReputationBreakdown>({
    queryKey: ['reputation-breakdown', organizerId],
    queryFn: async () => {
      const response = await api.get(`/organizers/${organizerId}/reputation`);
      return response.data;
    },
    enabled: !!organizerId,
    staleTime: 15 * 60 * 1000, // 15 minutes
  });
};
