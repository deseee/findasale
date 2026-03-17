import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

interface TrailStop {
  saleId: string;
  order: number;
  timeEstimateMin?: number;
  highlightItemIds?: string[];
}

interface Trail {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  stops: TrailStop[];
  totalDistanceKm?: number | null;
  totalDurationMin?: number | null;
  isPublic: boolean;
  shareToken?: string | null;
  completedSaleIds: string[];
  isCompleted: boolean;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fetch user's trails
 */
export const useMyTrails = (page = 1, limit = 20) => {
  return useQuery({
    queryKey: ['trails', 'my', page, limit],
    queryFn: async () => {
      const { data } = await axios.get(`/api/trails?page=${page}&limit=${limit}`);
      return data;
    },
  });
};

/**
 * Create a new trail
 */
export const useCreateTrail = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      name: string;
      description?: string;
      stops: TrailStop[];
    }) => {
      const { data } = await axios.post('/api/trails', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trails'] });
    },
  });
};

/**
 * Update a trail
 */
export const useUpdateTrail = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      trailId,
      ...payload
    }: {
      trailId: string;
      name?: string;
      description?: string;
      stops?: TrailStop[];
      isPublic?: boolean;
    }) => {
      const { data } = await axios.put(`/api/trails/${trailId}`, payload);
      return data;
    },
    onSuccess: (_, { trailId }) => {
      queryClient.invalidateQueries({ queryKey: ['trails'] });
      queryClient.invalidateQueries({ queryKey: ['trail', trailId] });
    },
  });
};

/**
 * Delete a trail
 */
export const useDeleteTrail = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (trailId: string) => {
      const { data } = await axios.delete(`/api/trails/${trailId}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trails'] });
    },
  });
};

/**
 * Get public trail by share token
 */
export const usePublicTrail = (shareToken: string | null) => {
  return useQuery({
    queryKey: ['trail', 'public', shareToken],
    queryFn: async () => {
      const { data } = await axios.get(`/api/trails/public/${shareToken}`);
      return data;
    },
    enabled: !!shareToken,
  });
};

/**
 * Mark trail as completed
 */
export const useCompleteTrail = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (trailId: string) => {
      const { data } = await axios.post(`/api/trails/${trailId}/complete`);
      return data;
    },
    onSuccess: (_, trailId) => {
      queryClient.invalidateQueries({ queryKey: ['trails'] });
      queryClient.invalidateQueries({ queryKey: ['trail', trailId] });
    },
  });
};
