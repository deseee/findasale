import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface ItemSocialProof {
  itemId: string;
  favoriteCount: number;
  activeBidCount: number;
  activeHoldCount: number;
  totalEngagement: number;
}

export interface SaleSocialProof {
  saleId: string;
  totalFavorites: number;
  totalActiveHolds: number;
  totalActiveBids: number;
  totalEngagement: number;
}

/**
 * useSocialProof — Feature 67: Fetch social proof metrics for an item or sale.
 * Requires authentication. Returns engagement counts and aggregates.
 * Query is disabled when unauthenticated or ID is missing.
 */
export const useItemSocialProof = (itemId?: string | null, enabled = true) => {
  const query = useQuery<ItemSocialProof>({
    queryKey: ['social-proof', 'item', itemId],
    queryFn: async () => {
      const response = await api.get(`/social-proof/item/${itemId}`);
      return response.data as ItemSocialProof;
    },
    enabled: enabled && !!itemId,
    staleTime: 30_000, // 30 seconds
  });

  return {
    socialProof: query.data ?? null,
    loading: query.isLoading,
    ...query,
  };
};

/**
 * useSocialProof for a sale (aggregated across all items).
 */
export const useSaleSocialProof = (saleId?: string | null, enabled = true) => {
  const query = useQuery<SaleSocialProof>({
    queryKey: ['social-proof', 'sale', saleId],
    queryFn: async () => {
      const response = await api.get(`/social-proof/sale/${saleId}`);
      return response.data as SaleSocialProof;
    },
    enabled: enabled && !!saleId,
    staleTime: 30_000, // 30 seconds
  });

  return {
    socialProof: query.data ?? null,
    loading: query.isLoading,
    ...query,
  };
};
