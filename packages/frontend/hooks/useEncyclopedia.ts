import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface EncyclopediaEntry {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  content: string; // Markdown format
  category: string;
  tags: string[];
  authorId: string;
  authorName?: string;
  createdAt: string;
  updatedAt: string;
  status: 'PUBLISHED' | 'PENDING_REVIEW' | 'ARCHIVED';
  helpfulCount?: number;
  unhelpfulCount?: number;
  relatedEntries?: EncyclopediaEntry[];
}

export interface EncyclopediaListResponse {
  entries: EncyclopediaEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface EncyclopediaEntryResponse {
  entry: EncyclopediaEntry;
  revisions?: Array<{ id: string; changeNote?: string; createdAt: string }>;
}

/**
 * useEncyclopediaList — Feature #52: List encyclopedia entries with search and filtering
 * @param page - Page number (default: 1)
 * @param limit - Entries per page (default: 20)
 * @param search - Search term
 * @param category - Filter by category
 * @param sort - Sort order: 'recent' | 'popular' | 'trending' (default: 'recent')
 */
export const useEncyclopediaList = (
  page: number = 1,
  limit: number = 20,
  search?: string,
  category?: string,
  sort: 'recent' | 'popular' | 'trending' = 'recent'
) => {
  return useQuery<EncyclopediaListResponse>({
    queryKey: ['encyclopedia-list', { page, limit, search, category, sort }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', String(limit));
      if (search) params.append('search', search);
      if (category) params.append('category', category);
      params.append('sort', sort);

      const response = await api.get(`/encyclopedia/entries?${params.toString()}`);
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
};

/**
 * useEncyclopediaEntry — Fetch a single encyclopedia entry by slug
 * @param slug - Entry slug (URL-friendly identifier)
 */
export const useEncyclopediaEntry = (slug: string) => {
  return useQuery<EncyclopediaEntryResponse>({
    queryKey: ['encyclopedia-entry', slug],
    queryFn: async () => {
      const response = await api.get(`/encyclopedia/entries/${slug}`);
      return response.data;
    },
    enabled: !!slug,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 1 * 60 * 60 * 1000, // 1 hour
  });
};

/**
 * useEncyclopediaSearch — Search encyclopedia with debouncing (simplified — delegates to useEncyclopediaList)
 */
export const useEncyclopediaSearch = (searchTerm: string) => {
  return useEncyclopediaList(1, 20, searchTerm, undefined, 'recent');
};
