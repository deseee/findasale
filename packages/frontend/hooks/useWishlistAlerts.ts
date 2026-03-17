/**
 * Feature #32: Wishlist Alerts React Query Hooks
 *
 * - useWishlistAlerts() — list alerts
 * - useCreateAlert() — create alert mutation
 * - useUpdateAlert() — update alert mutation
 * - useDeleteAlert() — delete alert mutation
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = '/api/wishlist-alerts';

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
      const res = await fetch(`${API_BASE}/my`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<WishlistAlert[]>;
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
      const res = await fetch(API_BASE, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<WishlistAlert>;
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
      const res = await fetch(`${API_BASE}/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<WishlistAlert>;
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
      const res = await fetch(`${API_BASE}/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlistAlerts'] });
    },
  });
};
