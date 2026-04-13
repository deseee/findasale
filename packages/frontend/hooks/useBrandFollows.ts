import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

interface BrandFollow {
  id: string;
  brandName: string;
  notifyEmail: boolean;
  notifyPush: boolean;
  createdAt: string;
}

export const useBrandFollows = (userId: string | undefined) => {
  const [brandFollows, setBrandFollows] = useState<BrandFollow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFollows = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const res = await api.get(`/users/${userId}/brand-follows`);
      setBrandFollows(res.data);
    } catch (err) {
      setError('Failed to load brand follows');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchFollows(); }, [fetchFollows]);

  const addBrandFollow = async (brandName: string) => {
    if (!userId) return;
    try {
      await api.post(`/users/${userId}/brand-follows`, { brandName });
      await fetchFollows();
    } catch (err: any) {
      throw new Error(err.response?.data?.message || 'Failed to add');
    }
  };

  const removeBrandFollow = async (brandFollowId: string) => {
    if (!userId) return;
    try {
      await api.delete(`/users/${userId}/brand-follows/${brandFollowId}`);
      await fetchFollows();
    } catch (err: any) {
      throw new Error(err.response?.data?.message || 'Failed to remove');
    }
  };

  return { brandFollows, isLoading, error, addBrandFollow, removeBrandFollow, refetch: fetchFollows };
};
