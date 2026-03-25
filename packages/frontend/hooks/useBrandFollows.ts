import { useState, useEffect, useCallback } from 'react';

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
      const res = await fetch(`/api/users/${userId}/brand-follows`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setBrandFollows(data);
    } catch (err) {
      setError('Failed to load brand follows');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchFollows(); }, [fetchFollows]);

  const addBrandFollow = async (brandName: string) => {
    if (!userId) return;
    const res = await fetch(`/api/users/${userId}/brand-follows`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandName }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || 'Failed to add');
    }
    await fetchFollows();
  };

  const removeBrandFollow = async (brandFollowId: string) => {
    if (!userId) return;
    await fetch(`/api/users/${userId}/brand-follows/${brandFollowId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    await fetchFollows();
  };

  return { brandFollows, isLoading, error, addBrandFollow, removeBrandFollow, refetch: fetchFollows };
};
