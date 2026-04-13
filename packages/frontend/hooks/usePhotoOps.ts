import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface PhotoOpStation {
  id: string;
  name: string;
  description?: string;
  lat: number;
  lng: number;
  frameImageUrl?: string;
  isActive: boolean;
  createdAt: string;
}

export interface PhotoOpShare {
  id: string;
  photoUrl: string;
  caption?: string;
  likesCount: number;
  createdAt: string;
}

export interface PhotoOpSharesResponse {
  shares: PhotoOpShare[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * React Query hook to fetch photo op stations for a sale
 */
export function usePhotoOpStations(saleId: string) {
  return useQuery({
    queryKey: ['photo-ops', saleId],
    queryFn: async () => {
      const response = await api.get(`/sales/${saleId}/photo-ops`);
      return response.data as PhotoOpStation[];
    },
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!saleId,
  });
}

/**
 * React Query hook to fetch shares for a photo op station
 */
export function usePhotoOpShares(stationId: string, limit = 20, offset = 0) {
  return useQuery({
    queryKey: ['photo-op-shares', stationId, limit, offset],
    queryFn: async () => {
      const response = await api.get(`/photo-ops/${stationId}/shares`, {
        params: { limit, offset },
      });
      return response.data as PhotoOpSharesResponse;
    },
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!stationId,
  });
}
