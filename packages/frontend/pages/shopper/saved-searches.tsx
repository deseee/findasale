/**
 * Shopper Saved Searches Page — /shopper/saved-searches
 *
 * Lists the logged-in shopper's saved searches. Each saved search can be
 * re-run (links back to /search with the stored query + filters applied)
 * or deleted. Handles loading, empty, and error states.
 *
 * Backend: GET/POST/PATCH/DELETE /api/saved-searches (savedSearchController.ts)
 * GET response shape: { savedSearches: SavedSearch[], total: number }
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import Skeleton from '../../components/Skeleton';
import EmptyState from '../../components/EmptyState';
import { Search, Trash2, ArrowRight, Bookmark } from 'lucide-react';
import api from '../../lib/api';

// Local type — never import from @findasale/shared (breaks Vercel build).
// Mirrors the SavedSearch model in packages/database/prisma/schema.prisma.
interface SavedSearchFilters {
  q?: string;
  category?: string;
  radius?: number;
  lat?: number;
  lng?: number;
  priceMin?: number | string | null;
  priceMax?: number | string | null;
  condition?: string;
  saleStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  // Tolerant of legacy shapes that may have stored other keys.
  [key: string]: unknown;
}

interface SavedSearch {
  id: string;
  userId: string;
  name: string;
  filters: SavedSearchFilters;
  notifyOnNew: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Build a /search URL from stored filters. Maps the saved filter keys onto the
 * query params that the search page reads (q, priceMin, priceMax, condition,
 * category, saleStatus). Unknown/empty keys are skipped so the link stays clean.
 */
const buildSearchHref = (filters: SavedSearchFilters): string => {
  const params = new URLSearchParams();
  const q = typeof filters.q === 'string' ? filters.q.trim() : '';
  if (q) params.set('q', q);
  if (filters.category) params.set('category', String(filters.category));
  if (filters.condition) params.set('condition', String(filters.condition));
  if (filters.saleStatus && filters.saleStatus !== 'all') {
    params.set('saleStatus', String(filters.saleStatus));
  }
  if (filters.priceMin !== undefined && filters.priceMin !== null && filters.priceMin !== '') {
    params.set('priceMin', String(filters.priceMin));
  }
  if (filters.priceMax !== undefined && filters.priceMax !== null && filters.priceMax !== '') {
    params.set('priceMax', String(filters.priceMax));
  }
  const qs = params.toString();
  return qs ? `/search?${qs}` : '/search';
};

/** Human-readable summary of the active filters for display under the name. */
const describeFilters = (filters: SavedSearchFilters): string => {
  const parts: string[] = [];
  if (filters.q) parts.push(`"${String(filters.q)}"`);
  if (filters.category) parts.push(String(filters.category));
  if (filters.condition) parts.push(String(filters.condition));
  if (filters.saleStatus && filters.saleStatus !== 'all') parts.push(String(filters.saleStatus));
  const hasMin = filters.priceMin !== undefined && filters.priceMin !== null && filters.priceMin !== '';
  const hasMax = filters.priceMax !== undefined && filters.priceMax !== null && filters.priceMax !== '';
  if (hasMin && hasMax) parts.push(`$${filters.priceMin}–$${filters.priceMax}`);
  else if (hasMin) parts.push(`$${filters.priceMin}+`);
  else if (hasMax) parts.push(`up to $${filters.priceMax}`);
  return parts.length ? parts.join(' · ') : 'All sales';
};

const SavedSearchesPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Redirect unauthenticated visitors to login.
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Fetch saved searches once the user is available.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    setIsLoading(true);
    setError(null);
    api
      .get('/saved-searches')
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res.data?.savedSearches) ? res.data.savedSearches : [];
        setSearches(list as SavedSearch[]);
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Error fetching saved searches:', err);
        setError('Unable to load your saved searches.');
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleDelete = async (id: string, name: string) => {
    if (deletingId) return; // prevent double-clicks
    setDeletingId(id);
    try {
      await api.delete(`/saved-searches/${id}`);
      setSearches((prev) => prev.filter((s) => s.id !== id));
      showToast(`Removed "${name}"`, 'success');
    } catch (err) {
      console.error('Error deleting saved search:', err);
      showToast('Could not delete that search. Please try again.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  if (!user && !authLoading) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Saved Searches | FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-white dark:bg-gray-900">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-50 to-amber-50/50 dark:from-gray-800 dark:to-gray-900 py-12 px-4">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-3">
              <Bookmark className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              Saved Searches
            </h1>
            <p className="text-lg text-gray-700 dark:text-gray-300">
              Re-run a search anytime, or remove ones you no longer need.
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-3xl mx-auto px-4 py-10">
          {authLoading || isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : error ? (
            <EmptyState
              icon="⚠️"
              heading="Unable to load saved searches"
              subtext="Something went wrong fetching your saved searches. Please try again in a moment."
              cta={{ label: 'Back to Search', href: '/search' }}
            />
          ) : searches.length === 0 ? (
            <EmptyState
              icon="🔖"
              heading="No saved searches yet"
              subtext="Run a search and tap Save Search to keep it here for quick access later."
              cta={{ label: 'Start Searching', href: '/search' }}
            />
          ) : (
            <ul className="space-y-4">
              {searches.map((search) => {
                const href = buildSearchHref(search.filters || {});
                const summary = describeFilters(search.filters || {});
                const isDeleting = deletingId === search.id;
                return (
                  <li
                    key={search.id}
                    className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 flex flex-col sm:flex-row sm:items-center gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Search className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                        <h2 className="font-semibold text-gray-900 dark:text-white truncate">
                          {search.name}
                        </h2>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{summary}</p>
                      {search.notifyOnNew && (
                        <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                          🔔 Notify on new matches
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Link
                        href={href}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        Run Search
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(search.id, search.name)}
                        disabled={isDeleting}
                        aria-label={`Delete saved search ${search.name}`}
                        className="inline-flex items-center justify-center p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
};

export default SavedSearchesPage;
