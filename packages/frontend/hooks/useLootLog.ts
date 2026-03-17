import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface LootLogStats {
  totalFinds: number;
  totalSpent: number;
  favoriteCategory: string | null;
  uniqueSales: number;
}

export interface LootLogItem {
  id: string;
  title: string;
  price: number;
  category: string;
  imageUrl?: string;
}

export interface LootLogPurchase {
  id: string;
  userId: string;
  saleId: string;
  itemId: string;
  amount: number;
  status: string;
  createdAt: string;
  item: LootLogItem;
  sale: {
    id: string;
    title: string;
  };
}

export interface LootLogResponse {
  purchases: LootLogPurchase[];
  total: number;
  page: number;
  totalPages: number;
}

export interface PublicLootLogResponse extends LootLogResponse {
  user: {
    id: string;
    name: string;
  };
}

/**
 * Fetch authenticated user's loot log with pagination
 */
export const useLootLog = (page: number = 1) => {
  return useQuery<LootLogResponse>({
    queryKey: ['lootLog', page],
    queryFn: async () => {
      const { data } = await api.get('/api/loot-log', {
        params: { page, limit: 12 },
      });
      return data;
    },
  });
};

/**
 * Fetch authenticated user's loot log statistics
 */
export const useLootLogStats = () => {
  return useQuery<LootLogStats>({
    queryKey: ['lootLogStats'],
    queryFn: async () => {
      const { data } = await api.get('/api/loot-log/stats');
      return data;
    },
  });
};

/**
 * Fetch public loot log for a specific user
 */
export const usePublicLootLog = (userId: string, page: number = 1) => {
  return useQuery<PublicLootLogResponse>({
    queryKey: ['publicLootLog', userId, page],
    queryFn: async () => {
      const { data } = await api.get(`/api/loot-log/public/${userId}`, {
        params: { page, limit: 12 },
      });
      return data;
    },
    enabled: !!userId,
  });
};
