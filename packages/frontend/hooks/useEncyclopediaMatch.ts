import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useEffect, useState } from 'react';

export interface PriceBenchmark {
  id: string;
  condition: 'NEW' | 'USED' | 'REFURBISHED' | 'PARTS_OR_REPAIR';
  region: string;
  priceRangeLow: number;  // in cents
  priceRangeHigh: number; // in cents
  dataSource: string;
}

export interface EncyclopediaMatchResult {
  entry: {
    id: string;
    slug: string;
    title: string;
    category: string;
  };
  benchmarks: PriceBenchmark[];
}

/**
 * useEncyclopediaMatch — Debounced hook to match Encyclopedia entries during item editing.
 *
 * Fires when category or tags change, with 800ms debounce to avoid excessive requests.
 * Only fires when category is set.
 *
 * @param category - Item category
 * @param tags - Item tags array
 * @param title - Item title (optional, used for exact slug match)
 *
 * @returns { entry, benchmarks, isLoading } | null
 */
export const useEncyclopediaMatch = (
  category?: string,
  tags?: string[],
  title?: string
) => {
  const [debouncedParams, setDebouncedParams] = useState<{
    category?: string;
    tags?: string[];
    title?: string;
  }>({ category, tags, title });

  // Debounce category/tags/title changes by 800ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedParams({ category, tags, title });
    }, 800);

    return () => clearTimeout(timer);
  }, [category, tags, title]);

  const { data, isLoading } = useQuery<EncyclopediaMatchResult | null>({
    queryKey: ['encyclopedia-match', debouncedParams.category, debouncedParams.tags, debouncedParams.title],
    queryFn: async () => {
      // Only query if category is set
      if (!debouncedParams.category) {
        return null;
      }

      const params = new URLSearchParams();
      if (debouncedParams.category) params.append('category', debouncedParams.category);
      if (debouncedParams.tags && debouncedParams.tags.length > 0) {
        params.append('tags', debouncedParams.tags.join(','));
      }
      if (debouncedParams.title) params.append('title', debouncedParams.title);

      const response = await api.get(`/encyclopedia/match?${params.toString()}`);
      return response.data;
    },
    enabled: !!debouncedParams.category, // Only enabled if category is set
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  return { entry: data?.entry, benchmarks: data?.benchmarks, isLoading };
};
