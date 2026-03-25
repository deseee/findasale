import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

export interface HaulPost {
  id: number;
  userId: string;
  photoUrl: string;
  caption: string | null;
  likesCount: number;
  createdAt: string;
  user?: { id: string; name: string | null };
  sale?: { id: string; title: string } | null;
  isHaulPost: boolean;
  linkedItemIds: string[];
}

export const useHaulPosts = () => {
  const [hauls, setHauls] = useState<HaulPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHauls = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.get('/ugc-photos/haul-posts');
      setHauls(res.data || []);
    } catch (err: any) {
      console.error('Failed to load haul posts:', err);
      setError(err.message || 'Failed to load haul posts');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHauls();
  }, [fetchHauls]);

  const createHaulPost = async (data: { photoUrl: string; caption?: string; saleId?: string; linkedItemIds?: string[] }) => {
    try {
      const res = await api.post('/ugc-photos/haul-posts', data);
      await fetchHauls();
      return res.data;
    } catch (err: any) {
      throw new Error(err.response?.data?.message || 'Failed to create haul post');
    }
  };

  const toggleLike = async (photoId: number, isLiked: boolean) => {
    try {
      if (isLiked) {
        await api.delete(`/ugc-photos/${photoId}/reactions`);
      } else {
        await api.post(`/ugc-photos/${photoId}/reactions`, { type: 'LIKE' });
      }
      await fetchHauls();
    } catch (err: any) {
      console.error('Failed to toggle like:', err);
      throw new Error(err.response?.data?.message || 'Failed to toggle like');
    }
  };

  return { hauls, isLoading, error, createHaulPost, toggleLike, refetch: fetchHauls };
};
