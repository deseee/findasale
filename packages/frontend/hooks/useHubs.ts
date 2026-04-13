/**
 * Feature #40+#44: Sale Hubs & Neighborhood Sale Day
 * React Query hooks for hub operations
 */

import { useQuery, useMutation, QueryKey, UseQueryOptions } from '@tanstack/react-query';

export interface SaleHubInfo {
  id: string;
  name: string;
  slug: string;
  lat: number;
  lng: number;
  saleCount: number;
  organizerName?: string;
  saleDate?: string;
  eventName?: string;
}

export interface SaleHubDetail extends SaleHubInfo {
  description?: string;
  radiusKm: number;
  sales: SaleInfo[];
  stats: {
    totalItems: number;
    totalSales: number;
    priceRangeUSD: [number, number];
  };
}

export interface SaleInfo {
  id: string;
  title: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  startDate: string;
  endDate: string;
  organizerName: string;
}

export interface NearbyHubsResponse {
  hubs: SaleHubInfo[];
  total: number;
  page: number;
  limit: number;
}

export interface HubDetailResponse {
  hub: SaleHubDetail;
}

/**
 * Fetch nearby hubs based on user location
 */
export const useNearbyHubs = (
  lat?: number,
  lng?: number,
  radiusKm: number = 10,
  page: number = 1,
  limit: number = 20,
  options?: Partial<UseQueryOptions<NearbyHubsResponse>>
) => {
  const queryKey: QueryKey = ['hubs', 'nearby', { lat, lng, radiusKm, page, limit }];

  return useQuery<NearbyHubsResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (lat && lng) {
        params.append('lat', lat.toString());
        params.append('lng', lng.toString());
        params.append('radiusKm', radiusKm.toString());
      }
      params.append('page', page.toString());
      params.append('limit', limit.toString());

      const response = await fetch(`/api/hubs?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch nearby hubs');
      }

      return response.json();
    },
    enabled: lat !== undefined && lng !== undefined,
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
};

/**
 * Fetch hub landing page data by slug
 */
export const useHub = (slug: string, options?: Partial<UseQueryOptions<HubDetailResponse>>) => {
  const queryKey: QueryKey = ['hub', slug];

  return useQuery<HubDetailResponse>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(`/api/hubs/${slug}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch hub');
      }

      return response.json();
    },
    enabled: !!slug,
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
};

/**
 * Fetch list of organizer's hubs
 */
export const useMyHubs = (options?: Partial<UseQueryOptions<{ hubs: SaleHubInfo[] }>>) => {
  const queryKey: QueryKey = ['hubs', 'my'];

  return useQuery<{ hubs: SaleHubInfo[] }>({
    queryKey,
    queryFn: async () => {
      const response = await fetch('/api/organizer/hubs', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch hubs');
      }

      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
};

/**
 * Create a new hub
 */
export const useCreateHub = () => {
  return useMutation({
    mutationFn: async (data: {
      name: string;
      slug: string;
      description?: string;
      lat: number;
      lng: number;
      radiusKm?: number;
    }) => {
      const response = await fetch('/api/organizer/hubs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create hub');
      }

      return response.json();
    },
  });
};

/**
 * Update an existing hub
 */
export const useUpdateHub = (hubId: string) => {
  return useMutation({
    mutationFn: async (data: {
      name?: string;
      description?: string;
      lat?: number;
      lng?: number;
      radiusKm?: number;
    }) => {
      const response = await fetch(`/api/organizer/hubs/${hubId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update hub');
      }

      return response.json();
    },
  });
};

/**
 * Delete a hub (soft delete)
 */
export const useDeleteHub = (hubId: string) => {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/organizer/hubs/${hubId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete hub');
      }

      return response.json();
    },
  });
};

/**
 * Join a hub (add current organizer's sales to hub)
 */
export const useJoinHub = (hubId: string) => {
  return useMutation({
    mutationFn: async (saleIds: string[]) => {
      const response = await fetch(`/api/organizer/hubs/${hubId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ saleIds }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to join hub');
      }

      return response.json();
    },
  });
};

/**
 * Leave a hub (remove sale from hub)
 */
export const useLeaveHub = (hubId: string, saleId: string) => {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/organizer/hubs/${hubId}/sales/${saleId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to leave hub');
      }

      return response.json();
    },
  });
};

/**
 * Set hub event date (Neighborhood Sale Day)
 */
export const useSetHubEvent = (hubId: string) => {
  return useMutation({
    mutationFn: async (data: { saleDate?: string; eventName?: string }) => {
      const response = await fetch(`/api/organizer/hubs/${hubId}/event`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to set hub event');
      }

      return response.json();
    },
  });
};
