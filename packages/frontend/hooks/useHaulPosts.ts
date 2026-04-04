import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../components/AuthContext';
import api from '../lib/api';

export interface HaulPostUser {
  id: string;
  name: string;
}

export interface HaulPost {
  id: number;
  userId: string;
  user: HaulPostUser;
  photoUrl: string;
  caption?: string;
  linkedItemIds: string[];
  likesCount: number;
  isHaulPost: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fetch paginated list of approved haul posts (public feed)
 */
export const useHaulPosts = (page: number = 1, limit: number = 20) => {
  return useQuery({
    queryKey: ['haul-posts', page, limit],
    queryFn: async (): Promise<HaulPost[]> => {
      const response = await api.get('/ugc-photos/haul-posts', {
        params: { page, limit },
      });
      return response.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Create a new haul post (authenticated)
 */
export const useCreateHaulPost = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      photoUrl: string;
      caption?: string;
      saleId?: string;
      linkedItemIds?: string[];
    }) => {
      const response = await api.post('/ugc-photos/haul-posts', data);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate haul posts list
      queryClient.invalidateQueries({
        queryKey: ['haul-posts'],
      });
    },
  });
};

/**
 * Like/react to a haul post (authenticated)
 */
export const useAddHaulReaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (photoId: number) => {
      const response = await api.post(`/ugc-photos/${photoId}/reactions`);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate haul posts to refresh counts
      queryClient.invalidateQueries({
        queryKey: ['haul-posts'],
      });
    },
  });
};

/**
 * Unlike/remove reaction from a haul post (authenticated)
 */
export const useRemoveHaulReaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (photoId: number) => {
      const response = await api.delete(`/ugc-photos/${photoId}/reactions`);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate haul posts to refresh counts
      queryClient.invalidateQueries({
        queryKey: ['haul-posts'],
      });
    },
  });
};
