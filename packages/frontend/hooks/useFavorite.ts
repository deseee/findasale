/**
 * useFavorite.ts — React Query hooks for Feature #26: Favorite Items
 *
 * Hooks:
 *   useFavoriteItem(itemId)     — Get/toggle favorite status for single item
 *   useFavorites(category?)     — Get all favorited items for current user
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface FavoriteItem {
  id: string;
  title: string;
  price?: number;
  category?: string;
  photoUrl?: string;
  status?: string;
  sale: {
    id: string;
    title: string;
    organizer?: {
      businessName: string;
    };
  };
  createdAt: string;
}

export interface FavoriteStatusResponse {
  isFavorited: boolean;
  createdAt?: string;
}

export interface FavoritesListResponse {
  favorites: FavoriteItem[];
  total: number;
  category?: string;
}

// ─── GET /api/favorites/item/:id ────────────────────────────────────
/**
 * useFavoriteItem — Get favorite status and toggle mutation for single item
 *
 * Returns: { isFavorited, isLoading, error, toggle }
 * - toggle(): Promise<void> — async function to toggle favorite status
 */
export function useFavoriteItem(itemId: string | null) {
  const queryClient = useQueryClient();

  const queryResult = useQuery<FavoriteStatusResponse>({
    queryKey: ['favorite', itemId],
    queryFn: async () => {
      if (!itemId) throw new Error('itemId required');
      const res = await api.get(`/favorites/item/${itemId}`);
      return res.data;
    },
    enabled: !!itemId,
    staleTime: 30 * 1000, // 30 seconds
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!itemId) throw new Error('itemId required');
      const res = await api.post(`/favorites/item/${itemId}`, {});
      return res.data;
    },
    onSuccess: (data) => {
      // Update the single-item query
      queryClient.setQueryData(['favorite', itemId], data);
      // Invalidate the list query to refetch all favorites
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });

  return {
    isFavorited: queryResult.data?.isFavorited ?? false,
    isLoading: queryResult.isLoading || mutation.isPending,
    error: queryResult.error || mutation.error,
    toggle: mutation.mutateAsync,
  };
}

// ─── GET /api/favorites ─────────────────────────────────────────────
/**
 * useFavorites — List all favorited items for current user
 *
 * Returns: { favorites, total, isLoading, error }
 * Optional category filter (e.g., 'Furniture', 'Collectibles')
 */
export function useFavorites(category?: string) {
  return useQuery<FavoritesListResponse>({
    queryKey: ['favorites', category],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (category) params.append('category', category);
      const res = await api.get(`/favorites${params.toString() ? `?${params}` : ''}`);
      return res.data;
    },
    staleTime: 60 * 1000, // 60 seconds
  });
}
