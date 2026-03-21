import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface PointsTransaction {
  id: string;
  type: string;
  points: number;
  saleId: string | null;
  itemId: string | null;
  description: string | null;
  createdAt: string;
}

export interface PointsData {
  points: number;
  tier: string; // "Scout" | "Hunter" | "Estate Pro"
  transactions: PointsTransaction[];
}

/**
 * usePoints — Phase 19: fetches the authenticated user's points total, tier, and recent transactions.
 * Returns null data when unauthenticated (query is disabled).
 */
const usePoints = (enabled = true) => {
  return useQuery<PointsData>({
    queryKey: ['points'],
    queryFn: async () => {
      const response = await api.get('/points');
      return response.data as PointsData;
    },
    enabled,
    staleTime: 300_000, // 300 seconds
  });
};

export default usePoints;
