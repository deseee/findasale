import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type { RippleSummaryDTO, RippleTrendDTO } from '@findasale/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

/**
 * Hook to fetch ripple summary for a sale.
 * @param saleId - ID of the sale
 * @param enabled - Whether to enable the query (default: true)
 */
export const useRippleSummary = (saleId: string | null, enabled: boolean = true) => {
  return useQuery<RippleSummaryDTO, Error>({
    queryKey: ['ripples', 'summary', saleId],
    queryFn: async () => {
      if (!saleId) throw new Error('saleId is required');
      const res = await axios.get(`${API_BASE}/sales/${saleId}/ripples/summary`);
      return res.data;
    },
    enabled: enabled && !!saleId,
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // Refetch every 60 seconds for live updates
  });
};

/**
 * Hook to fetch ripple trend data for a sale.
 * @param saleId - ID of the sale
 * @param hours - Number of hours to look back (default: 24)
 * @param enabled - Whether to enable the query (default: true)
 */
export const useRippleTrend = (
  saleId: string | null,
  hours: number = 24,
  enabled: boolean = true
) => {
  return useQuery<RippleTrendDTO, Error>({
    queryKey: ['ripples', 'trend', saleId, hours],
    queryFn: async () => {
      if (!saleId) throw new Error('saleId is required');
      const res = await axios.get(`${API_BASE}/sales/${saleId}/ripples/trend`, {
        params: { hours },
      });
      return res.data;
    },
    enabled: enabled && !!saleId,
    staleTime: 60_000, // 60 seconds
    refetchInterval: 120_000, // Refetch every 2 minutes
  });
};

/**
 * Hook to record a ripple event (view, share, save, bid).
 */
export const useRecordRipple = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      saleId,
      type,
      metadata,
    }: {
      saleId: string;
      type: 'VIEW' | 'SHARE' | 'SAVE' | 'BID';
      metadata?: Record<string, any>;
    }) => {
      const res = await axios.post(`${API_BASE}/sales/${saleId}/ripples`, {
        type,
        metadata,
      });
      return res.data;
    },
    onSuccess: (data) => {
      // Invalidate both summary and trend queries for this sale
      queryClient.invalidateQueries({
        queryKey: ['ripples', 'summary', data.saleId],
      });
      queryClient.invalidateQueries({
        queryKey: ['ripples', 'trend', data.saleId],
      });
    },
  });
};
