import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface LibraryItem {
  id: string;
  title: string;
  description?: string;
  category?: string;
  condition?: string;
  price?: number;
  photoUrls: string[];
  status: string;
  organizerId?: string;
  inLibrary: boolean;
  priceHistory?: Array<{ price: number; changedBy: string; createdAt: string }>;
}

export interface PriceHistoryItem {
  itemId: string;
  price: number;
  changedBy: string;
  note?: string;
  createdAt: string;
}

export interface PricingSuggestion {
  suggested: number;
  min: number;
  max: number;
}

export interface LibraryFilters {
  search?: string;
  category?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  status?: string;
}

interface ListLibraryResponse {
  items: LibraryItem[];
  total: number;
}

interface PriceHistoryResponse {
  history: PriceHistoryItem[];
}

interface PricingSuggestionResponse {
  suggestion: PricingSuggestion;
}

/**
 * useItemLibrary — Feature #25: Manage organizer's item library (consignment rack).
 * Provides hooks for adding/removing items, pulling from library, and pricing.
 */
const useItemLibrary = (organizerId?: string) => {
  const queryClient = useQueryClient();

  // List library items
  const listQuery = useQuery<ListLibraryResponse>({
    queryKey: ['item-library', organizerId],
    queryFn: async () => {
      const response = await api.get('/item-library');
      return response.data as ListLibraryResponse;
    },
    enabled: !!organizerId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Add to library mutation
  const addToLibrary = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await api.post('/item-library/add', { itemId });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-library'] });
    },
  });

  // Remove from library mutation
  const removeFromLibrary = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await api.delete(`/item-library/${itemId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-library'] });
    },
  });

  // Pull from library mutation
  const pullFromLibrary = useMutation({
    mutationFn: async (params: { libraryItemId: string; saleId: string; priceOverride?: number }) => {
      const response = await api.post(`/item-library/${params.libraryItemId}/pull`, {
        saleId: params.saleId,
        priceOverride: params.priceOverride,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-library'] });
    },
  });

  // Get price history
  const getPriceHistory = async (itemId: string): Promise<PriceHistoryItem[]> => {
    try {
      const response = await api.get(`/item-library/${itemId}/price-history`);
      return (response.data as PriceHistoryResponse).history;
    } catch (error) {
      console.error('Error fetching price history:', error);
      return [];
    }
  };

  // Get pricing suggestion
  const getPricingSuggestion = async (itemId: string, saleId: string): Promise<PricingSuggestion | null> => {
    try {
      const response = await api.get(`/item-library/${itemId}/pricing-advice`, {
        params: { saleId },
      });
      return (response.data as PricingSuggestionResponse).suggestion;
    } catch (error) {
      console.error('Error fetching pricing suggestion:', error);
      return null;
    }
  };

  // Search/filter library items
  const searchLibraryItems = async (filters: LibraryFilters): Promise<LibraryItem[]> => {
    try {
      const response = await api.get('/item-library', {
        params: filters,
      });
      return (response.data as ListLibraryResponse).items;
    } catch (error) {
      console.error('Error searching library items:', error);
      return [];
    }
  };

  return {
    // Query data
    libraryItems: listQuery.data?.items ?? [],
    loading: listQuery.isLoading,
    error: listQuery.error,

    // Mutations
    addToLibrary: (itemId: string) => addToLibrary.mutate(itemId),
    removeFromLibrary: (itemId: string) => removeFromLibrary.mutate(itemId),
    pullFromLibrary: (libraryItemId: string, saleId: string, priceOverride?: number) =>
      pullFromLibrary.mutate({ libraryItemId, saleId, priceOverride }),

    // Functions
    getPriceHistory,
    getPricingSuggestion,
    searchLibraryItems,

    // Mutation states
    isAddingToLibrary: addToLibrary.isPending,
    isRemovingFromLibrary: removeFromLibrary.isPending,
    isPullingFromLibrary: pullFromLibrary.isPending,

    // Refetch
    refetch: listQuery.refetch,
  };
};

export default useItemLibrary;
