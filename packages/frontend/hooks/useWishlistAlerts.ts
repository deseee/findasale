/**
 * Feature #32: Wishlist Alerts React Query Hooks
 *
 * - useWishlistAlerts() — list alerts
 * - useCreateAlert() — create alert mutation
 * - useUpdateAlert() — update alert mutation
 * - useDeleteAlert() — delete alert mutation
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

const API_BASE = '/wishlist-alerts';

interface WishlistAlert {
  id: string;
  userId: string;
  name: string;
  query: {
    q?: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    radiusMiles?: number;
    lat?: number;
    lng?: number;
    tags?: string[];
  };
  notifyEmail: boolean;
  notifyPush: boolean;
  isActive: boolean;
  lastNotifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface AlertInput {
  name: string;
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  radiusMiles?: number;
  lat?: number;
  lng?: number;
  tags?: string[];
}

/**
 * List user's wishlist alerts
 */
export const useWishlistAlerts = () => {
  return useQuery({
    queryKey: ['wishlistAlerts'],
    queryFn: async () => {
      const res = await api.get(`${API_BASE}/my`);
      return res.data as WishlistAlert[];
    },
  });
};

/**
 * Create a wishlist alert
 */
export const useCreateAlert = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AlertInput) => {
      const res = await api.post(API_BASE, input);
      return res.data as WishlistAlert;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlistAlerts'] });
    },
  });
};

/**
 * Update a wishlist alert
 */
export const useUpdateAlert = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: AlertInput & { id: string }) => {
      const res = await api.patch(`${API_BASE}/${id}`, input);
      return res.data as WishlistAlert;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlistAlerts'] });
    },
  });
};

/**
 * Delete a wishlist alert
 */
export const useDeleteAlert = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`${API_BASE}/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlistAlerts'] });
    },
  });
};
