import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import type { HeatmapResponse } from '../types/heatmap';

interface UseHeatmapTilesProps {
  enabled?: boolean;
  days?: number;
  refetchInterval?: number; // milliseconds
}

/**
 * useHeatmapTiles — React Query hook to fetch heatmap data from backend
 * Supports debouncing and error handling
 */
export const useHeatmapTiles = ({
  enabled = true,
  days = 7,
  refetchInterval = undefined,
}: UseHeatmapTilesProps = {}) => {
  return useQuery<HeatmapResponse, Error>({
    queryKey: ['heatmap', { days }],
    queryFn: async () => {
      const response = await api.get('/sales/heatmap', {
        params: { days },
      });
      return response.data;
    },
    enabled,
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval,
  });
};
