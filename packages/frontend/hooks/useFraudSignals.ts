/**
 * Feature #17: Fraud Signals Hook
 * React Query hook for fetching fraud signals for an organizer's sale
 */

import { useQuery, QueryKey } from '@tanstack/react-query';

export interface FraudSignal {
  id: string;
  userId: string;
  userName: string;
  itemId: string | null;
  itemTitle: string | null;
  signalType: string;
  confidenceScore: number;
  detectedAt: string;
  reviewedAt: string | null;
  reviewOutcome: string | null;
  notes: string | null;
}

export interface FraudSignalsResponse {
  signals: FraudSignal[];
  total: number;
  page: number;
  hasMore: boolean;
}

export interface UseFraudSignalsOptions {
  minScore?: number;
  status?: 'PENDING' | 'DISMISSED' | 'CONFIRMED';
  page?: number;
  limit?: number;
}

/**
 * Fetch fraud signals for a sale (PRO tier organizer only)
 */
export const useSaleFraudSignals = (
  saleId: string,
  options: UseFraudSignalsOptions = {}
) => {
  const { minScore = 30, status, page = 1, limit = 20 } = options;

  const queryKey: QueryKey = [
    'fraudSignals',
    saleId,
    { minScore, status, page, limit },
  ];

  return useQuery<FraudSignalsResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('minScore', minScore.toString());
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      if (status) {
        params.append('status', status);
      }

      const response = await fetch(`/api/fraud/sale/${saleId}?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch fraud signals');
      }

      return response.json();
    },
    enabled: !!saleId,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });
};
