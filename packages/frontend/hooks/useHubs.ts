/**
 * Feature #40+#44: Sale Hubs & Neighborhood Sale Day
 * React Query hooks for hub operations
 */

import { useQuery, useMutation, QueryKey, UseQueryOptions } from '@tanstack/react-query';
import api from '../lib/api';

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
 * Full detail for one of the organizer's own hubs, fetched by id (auth + ownership
 * checked server-side). Distinct from useHub(slug) above, which is the PUBLIC
 * by-slug landing-page endpoint -- reusing that here would leak inactive/private
 * hub data to non-owners and doesn't have the hubId the management page has.
 */
export interface MyHubDetail {
  id: string;
  name: string;
  slug: string;
  description?: string;
  lat: number;
  lng: number;
  radiusKm: number;
  saleDate?: string;
  eventName?: string;
  isActive: boolean;
  createdAt: string;
}

export interface MyHubDetailResponse {
  hub: MyHubDetail;
}

export const useHubById = (hubId: string, options?: Partial<UseQueryOptions<MyHubDetailResponse>>) => {
  const queryKey: QueryKey = ['hubs', 'byId', hubId];

  return useQuery<MyHubDetailResponse>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(`/api/organizer/hubs/${hubId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch hub');
      }

      return response.json();
    },
    enabled: !!hubId,
    staleTime: 5 * 60 * 1000,
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
      try {
        const response = await api.post('/organizer/hubs', data);
        return response.data;
      } catch (err: any) {
        throw new Error(err.response?.data?.message || 'Failed to create hub');
      }
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
      try {
        const response = await api.put(`/organizer/hubs/${hubId}`, data);
        return response.data;
      } catch (err: any) {
        throw new Error(err.response?.data?.message || 'Failed to update hub');
      }
    },
  });
};

/**
 * Delete a hub (soft delete)
 */
export const useDeleteHub = (hubId: string) => {
  return useMutation({
    mutationFn: async () => {
      try {
        const response = await api.delete(`/organizer/hubs/${hubId}`);
        return response.data;
      } catch (err: any) {
        throw new Error(err.response?.data?.message || 'Failed to delete hub');
      }
    },
  });
};

/**
 * Join a hub (add current organizer's sales to hub)
 */
export const useJoinHub = (hubId: string) => {
  return useMutation({
    mutationFn: async (saleIds: string[]) => {
      try {
        const response = await api.post(`/organizer/hubs/${hubId}/join`, { saleIds });
        return response.data;
      } catch (err: any) {
        throw new Error(err.response?.data?.message || 'Failed to join hub');
      }
    },
  });
};

/**
 * Leave a hub (remove sale from hub)
 */
export const useLeaveHub = (hubId: string, saleId: string) => {
  return useMutation({
    mutationFn: async () => {
      try {
        const response = await api.delete(`/organizer/hubs/${hubId}/sales/${saleId}`);
        return response.data;
      } catch (err: any) {
        throw new Error(err.response?.data?.message || 'Failed to leave hub');
      }
    },
  });
};

/**
 * Set hub event date (Neighborhood Sale Day)
 */
export const useSetHubEvent = (hubId: string) => {
  return useMutation({
    mutationFn: async (data: { saleDate?: string; eventName?: string }) => {
      try {
        const response = await api.patch(`/organizer/hubs/${hubId}/event`, data);
        return response.data;
      } catch (err: any) {
        throw new Error(err.response?.data?.message || 'Failed to set hub event');
      }
    },
  });
};
