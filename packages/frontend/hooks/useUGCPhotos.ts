import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface UGCPhoto {
  id: number;
  userId: string;
  itemId: number | null;
  saleId: number | null;
  photoUrl: string;
  caption: string | null;
  tags: string[];
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedAt: string | null;
  reviewedBy: string | null;
  likesCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Get approved photos for a specific sale
 */
export const usePhotosForSale = (saleId: number) => {
  return useQuery({
    queryKey: ['ugcPhotos', 'sale', saleId],
    queryFn: async () => {
      const response = await api.get(`/ugc-photos/sale/${saleId}`);
      return response.data as UGCPhoto[];
    },
    enabled: !!saleId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

/**
 * Get approved photos for a specific item
 */
export const usePhotosForItem = (itemId: number) => {
  return useQuery({
    queryKey: ['ugcPhotos', 'item', itemId],
    queryFn: async () => {
      const response = await api.get(`/ugc-photos/item/${itemId}`);
      return response.data as UGCPhoto[];
    },
    enabled: !!itemId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

/**
 * Get current user's submitted photos (all statuses)
 */
export const useMyPhotos = () => {
  return useQuery({
    queryKey: ['ugcPhotos', 'my'],
    queryFn: async () => {
      const response = await api.get('/ugc-photos/my');
      return response.data as UGCPhoto[];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};

/**
 * Submit a new UGC photo
 */
export const useSubmitPhoto = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      photoUrl: string;
      caption?: string;
      tags?: string[];
      itemId?: number;
      saleId?: number;
    }) => {
      const response = await api.post('/ugc-photos', data);
      return response.data as UGCPhoto;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ugcPhotos', 'my'] });
    },
  });
};

/**
 * Like a photo
 */
export const useLikePhoto = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (photoId: number) => {
      const response = await api.post(`/ugc-photos/${photoId}/like`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ugcPhotos'] });
    },
  });
};

/**
 * Unlike a photo
 */
export const useUnlikePhoto = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (photoId: number) => {
      const response = await api.delete(`/ugc-photos/${photoId}/like`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ugcPhotos'] });
    },
  });
};

/**
 * Get pending photos for moderation (organizer only)
 */
export const usePendingModerationPhotos = () => {
  return useQuery({
    queryKey: ['ugcPhotos', 'moderation', 'pending'],
    queryFn: async () => {
      const response = await api.get('/ugc-photos/moderation/pending');
      return response.data as UGCPhoto[];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};

/**
 * Moderate a photo (approve or reject)
 */
export const useModeratePhoto = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      photoId: number;
      status: 'APPROVED' | 'REJECTED';
    }) => {
      const response = await api.patch(`/ugc-photos/${data.photoId}/moderate`, {
        status: data.status,
      });
      return response.data as UGCPhoto;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ugcPhotos', 'moderation'] });
    },
  });
};
