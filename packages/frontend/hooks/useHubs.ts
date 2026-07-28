/**
 * Feature #40+#44: Sale Hubs & Neighborhood Sale Day
 * React Query hooks for hub operations
 *
 * ---------------------------------------------------------------------------
 * PARKED, NOT DEAD (recorded 2026-07-28, Patrick decision: KEEP AND DOCUMENT)
 * ---------------------------------------------------------------------------
 * `useNearbyHubs` and `useHub` currently have ZERO callers in this repo. That is
 * intentional and must not be read as dead code:
 *
 *  - Their only callers were the public `/hubs` pages, deleted in commit
 *    `69b79dee` at S512.
 *  - `useHub(slug)` calls `GET /api/hubs/:slug`. That is exactly the public hub
 *    landing page named in the ADR-014 Target State table
 *    (`claude_docs/architecture/ADR-014-hubs-flea-market-repurpose.md:36`, was
 *    `:35` before the 2026-07-28 Amendment A header lines were added),
 *    backed by the LOCKED S436 entry at `claude_docs/decisions-log.md:94`.
 *    Amendment A (ADR-014:44) narrows that page to venue / event date / map /
 *    booth count / CONFIRMED-vendor names only.
 *  - Building that public landing page is now approved (ADR-014 amendment,
 *    2026-07-28). Deleting these hooks would mean rebuilding them within weeks.
 *
 * Do not remove either hook, and do not change its signature or return shape,
 * without first re-reading ADR-014.
 *
 * SEPARATE, UNDECIDED CASE: `useMyHubs` (:194) and `useDeleteHub` (:264) are
 * also caller-free right now. No decision has been made about them — they are
 * NOT covered by the "parked" ruling above and still need their own review.
 * ---------------------------------------------------------------------------
 */

import { useQuery, useMutation, QueryKey, UseQueryOptions } from '@tanstack/react-query';
import api from '../lib/api';

export interface SaleHubInfo {
  id: string;
  name: string;
  slug: string;
  lat: number;
  lng: number;
  boothCount: number;
  organizerName?: string;
  saleDate?: string;
  eventName?: string;
}

export interface SaleHubDetail extends SaleHubInfo {
  description?: string;
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
 * Fetch nearby hubs based on user location.
 *
 * PARKED — no callers since the public `/hubs` pages were deleted in `69b79dee`
 * (S512). Retained for the approved ADR-014 public hub landing work; see the
 * file header. Behavior and signature are frozen — do not "clean up".
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
 * Fetch hub landing page data by slug (`GET /api/hubs/:slug`).
 *
 * PARKED — no callers since the public `/hubs` pages were deleted in `69b79dee`
 * (S512). This is the exact endpoint behind the public landing page in
 * ADR-014's Target State table (ADR-014:36, LOCKED via decisions-log.md:94),
 * which is now approved to be built. Behavior and signature are frozen.
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
