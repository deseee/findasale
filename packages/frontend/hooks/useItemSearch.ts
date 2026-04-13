/**
 * useItemSearch — Sprint 4b
 * React Query hook wrapping GET /api/items/search (FTS endpoint from Sprint 4a).
 * Syncs query params to URL for shareable search links.
 */
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import { useEffect, useRef } from 'react';
import api from '../lib/api';

export interface ItemSearchFilters {
  q: string;
  category: string;
  condition: string;
  priceMin: string;
  priceMax: string;
  sort: 'relevance' | 'newest' | 'price_asc' | 'price_desc';
  offset: number;
}

export interface ItemSearchResult {
  id: string;
  title: string;
  price: number | null;
  photoUrls: string[];
  category: string | null;
  condition: string | null;
  saleId: string;
  organizerId: string;
  businessName: string;
  relevanceScore?: number;
}

export interface SearchFacets {
  categories: { name: string; count: number }[];
  conditions: { name: string; count: number }[];
  priceRange: { min: number; max: number } | null;
}

export interface ItemSearchResponse {
  data: ItemSearchResult[];
  total: number;
  limit: number;
  offset: number;
  facets: SearchFacets;
}

const LIMIT = 20;

export function useItemSearch(filters: ItemSearchFilters) {
  const { q, category, condition, priceMin, priceMax, sort, offset } = filters;

  return useQuery<ItemSearchResponse>({
    queryKey: ['itemSearch', q, category, condition, priceMin, priceMax, sort, offset],
    queryFn: async () => {
      const params: Record<string, string | number> = { limit: LIMIT, offset };

      if (q.trim()) params.q = q.trim();
      if (category) params.category = category;
      if (condition) params.condition = condition;
      if (priceMin) params.priceMin = priceMin;
      if (priceMax) params.priceMax = priceMax;
      if (sort !== 'relevance') params.sort = sort;

      const res = await api.get('/items/search', { params });
      return res.data as ItemSearchResponse;
    },
    staleTime: 5 * 60 * 1000, // 5 min
    placeholderData: (prev) => prev, // keep showing previous results while fetching
  });
}

/** Read initial filters from URL query params */
export function filtersFromQuery(query: Record<string, string | string[] | undefined>): ItemSearchFilters {
  return {
    q: (query.q as string) || '',
    category: (query.category as string) || '',
    condition: (query.condition as string) || '',
    priceMin: (query.priceMin as string) || '',
    priceMax: (query.priceMax as string) || '',
    sort: ((query.sort as string) || 'relevance') as ItemSearchFilters['sort'],
    offset: query.offset ? parseInt(query.offset as string, 10) : 0,
  };
}

/** Sync filters back to URL (shallow push, no full reload) */
export function useFilterSync(filters: ItemSearchFilters, enabled: boolean) {
  const router = useRouter();
  const isFirst = useRef(true);

  useEffect(() => {
    if (!enabled || !router.isReady) return;
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }

    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.category) params.set('category', filters.category);
    if (filters.condition) params.set('condition', filters.condition);
    if (filters.priceMin) params.set('priceMin', filters.priceMin);
    if (filters.priceMax) params.set('priceMax', filters.priceMax);
    if (filters.sort !== 'relevance') params.set('sort', filters.sort);
    if (filters.offset > 0) params.set('offset', String(filters.offset));

    const queryStr = params.toString();
    const target = queryStr ? `/search?${queryStr}` : '/search';
    router.push(target, undefined, { shallow: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q, filters.category, filters.condition, filters.priceMin, filters.priceMax, filters.sort, filters.offset]);
}
