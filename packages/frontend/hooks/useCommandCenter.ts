import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import type { CommandCenterResponse } from '@findasale/shared';

type StatusFilter = 'active' | 'upcoming' | 'recent' | 'all';

/**
 * React Query hook to fetch Command Center summary for organizer
 * Provides aggregate stats and per-sale metrics with optional status filtering
 */
export function useCommandCenter(status: StatusFilter = 'active') {
  return useQuery({
    queryKey: ['command-center', status],
    queryFn: async () => {
      const response = await api.get('/organizer/command-center', {
        params: { status },
      });
      return response.data as CommandCenterResponse;
    },
    staleTime: 60 * 1000, // 60 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}
