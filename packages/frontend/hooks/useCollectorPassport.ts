/**
 * Feature #45: Collector Passport Hooks
 *
 * useMyPassport — fetch authenticated user's collector passport
 * useUpdatePassport — update passport (bio, specialties, categories, keywords)
 * useMyMatches — fetch items from recent sales matching passport
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface CollectorPassport {
  id: string;
  userId: string;
  bio: string | null;
  specialties: string[];
  categories: string[];
  keywords: string[];
  notifyEmail: boolean;
  notifyPush: boolean;
  totalFinds: number;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicCollectorPassport {
  id: string;
  bio: string | null;
  specialties: string[];
  categories: string[];
  totalFinds: number;
  isPublic: boolean;
  createdAt: string;
  user: {
    id: string;
    name: string;
  };
}

export interface CollectorItem {
  id: string;
  title: string;
  category: string | null;
  tags: string[];
  price: number | null;
  photoUrls: string[];
  sale: {
    id: string;
    title: string;
    organizerId: string;
  };
}

export interface MatchesResponse {
  totalMatches: number;
  items: CollectorItem[];
}

/**
 * Fetch authenticated user's collector passport
 * Automatically creates an empty passport if not found
 */
export function useMyPassport() {
  const { data, isLoading, error, refetch } = useQuery<CollectorPassport>({
    queryKey: ['collector-passport', 'my'],
    queryFn: async () => {
      const response = await api.get('/collector-passport/my');
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    passport: data,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Update authenticated user's collector passport
 */
export function useUpdatePassport() {
  const queryClient = useQueryClient();

  const { mutate, isPending, error } = useMutation({
    mutationFn: async (updates: Partial<CollectorPassport>) => {
      const response = await api.patch('/collector-passport/my', updates);
      return response.data;
    },
    onSuccess: (data) => {
      // Invalidate and refetch passport
      queryClient.setQueryData(['collector-passport', 'my'], data);
      queryClient.invalidateQueries({ queryKey: ['collector-passport'] });
      // Invalidate matches since passport changed
      queryClient.invalidateQueries({ queryKey: ['collector-passport', 'matches'] });
    },
  });

  return {
    updatePassport: mutate,
    isUpdating: isPending,
    error,
  };
}

/**
 * Fetch items from recent sales (30 days) matching user's passport
 */
export function useMyMatches() {
  const { data, isLoading, error, refetch } = useQuery<MatchesResponse>({
    queryKey: ['collector-passport', 'matches'],
    queryFn: async () => {
      const response = await api.get('/collector-passport/matches');
      return response.data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes (matches don't change often)
  });

  return {
    matches: data?.items || [],
    totalMatches: data?.totalMatches || 0,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Fetch public collector profile by user ID
 * Returns null if profile doesn't exist or is private
 */
export function usePublicPassport(userId: string | null) {
  const { data, isLoading, error } = useQuery<PublicCollectorPassport>({
    queryKey: ['collector-passport', 'public', userId],
    queryFn: async () => {
      if (!userId) throw new Error('User ID required');
      const response = await api.get(`/collector-passport/users/${userId}`);
      return response.data;
    },
    enabled: !!userId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    profile: data,
    isLoading,
    error,
  };
}
