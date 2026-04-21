import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface InventoryItem {
  id: string;
  title: string;
  description?: string;
  category?: string;
  condition?: string;
  price?: number;
  photoUrls: string[];
  status: string;
  organizerId?: string;
  locationId?: string | null;
  tagColor?: string | null;
  inInventory: boolean;
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

export interface InventoryFilters {
  search?: string;
  category?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  status?: string;
}

interface ListInventoryResponse {
  items: InventoryItem[];
  total: number;
}

interface PriceHistoryResponse {
  history: PriceHistoryItem[];
}

interface PricingSuggestionResponse {
  suggestion: PricingSuggestion;
}

/**
 * useInventory — Feature #25: Manage organizer's item inventory (consignment rack).
 * Provides hooks for adding/removing items, pulling from inventory, and pricing.
 */
const useInventory = (organizerId?: string) => {
  const queryClient = useQueryClient();

  // List inventory items
  const listQuery = useQuery<ListInventoryResponse>({
    queryKey: ['item-inventory', organizerId],
    queryFn: async () => {
      const response = await api.get('/item-inventory');
      return response.data as ListInventoryResponse;
    },
    enabled: !!organizerId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Add to inventory mutation
  const addToInventory = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await api.post('/item-inventory/add', { itemId });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-inventory'] });
    },
  });

  // Remove from inventory mutation
  const removeFromInventory = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await api.delete(`/item-inventory/${itemId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-inventory'] });
    },
  });

  // Pull from inventory mutation
  const pullFromInventory = useMutation({
    mutationFn: async (params: { inventoryItemId: string; saleId: string; priceOverride?: number }) => {
      const response = await api.post(`/item-inventory/${params.inventoryItemId}/pull`, {
        saleId: params.saleId,
        priceOverride: params.priceOverride,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-inventory'] });
    },
  });

  // Get price history
  const getPriceHistory = async (itemId: string): Promise<PriceHistoryItem[]> => {
    try {
      const response = await api.get(`/item-inventory/${itemId}/price-history`);
      return (response.data as PriceHistoryResponse).history;
    } catch (error) {
      console.error('Error fetching price history:', error);
      return [];
    }
  };

  // Get pricing suggestion
  const getPricingSuggestion = async (itemId: string, saleId: string): Promise<PricingSuggestion | null> => {
    try {
      const response = await api.get(`/item-inventory/${itemId}/pricing-advice`, {
        params: { saleId },
      });
      return (response.data as PricingSuggestionResponse).suggestion;
    } catch (error) {
      console.error('Error fetching pricing suggestion:', error);
      return null;
    }
  };

  // Search/filter inventory items
  const searchInventoryItems = async (filters: InventoryFilters): Promise<InventoryItem[]> => {
    try {
      const response = await api.get('/item-inventory', {
        params: filters,
      });
      return (response.data as ListInventoryResponse).items;
    } catch (error) {
      console.error('Error searching inventory items:', error);
      return [];
    }
  };

  return {
    // Query data
    inventoryItems: listQuery.data?.items ?? [],
    loading: listQuery.isLoading,
    error: listQuery.error,

    // Mutations
    addToInventory: (itemId: string) => addToInventory.mutate(itemId),
    removeFromInventory: (itemId: string) => removeFromInventory.mutate(itemId),
    pullFromInventory: (
      inventoryItemId: string,
      saleId: string,
      priceOverride?: number,
      callbacks?: { onSuccess?: () => void; onError?: (err: Error) => void }
    ) =>
      pullFromInventory.mutate({ inventoryItemId, saleId, priceOverride }, callbacks),

    // Functions
    getPriceHistory,
    getPricingSuggestion,
    searchInventoryItems,

    // Mutation states
    isAddingToInventory: addToInventory.isPending,
    isRemovingFromInventory: removeFromInventory.isPending,
    isPullingFromInventory: pullFromInventory.isPending,

    // Refetch
    refetch: listQuery.refetch,
  };
};

export default useInventory;
