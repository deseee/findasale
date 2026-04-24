import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface EbayComp {
  id: string;
  ebayListingId?: string;
  ebayPrice?: number;
  ebayCondition?: string;
  ebayImageUrl?: string;
  fetchedAt?: string;
}

/**
 * useItemEbayComps — Fetch top 3 eBay comparable sales for an item.
 *
 * Returns the most recent eBay comp listings with images and prices.
 * Only fires if itemId is provided.
 *
 * @param itemId - The item ID to fetch comps for
 * @returns { comps, isLoading, isError }
 */
export const useItemEbayComps = (itemId?: string) => {
  const { data, isLoading, isError } = useQuery<{ comps: EbayComp[] }>({
    queryKey: ['item-ebay-comps', itemId],
    queryFn: async () => {
      const response = await api.get(`/items/${itemId}/ebay-comps`);
      return response.data;
    },
    enabled: !!itemId, // Only fetch if itemId is provided
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  return {
    comps: data?.comps || [],
    isLoading,
    isError,
  };
};
