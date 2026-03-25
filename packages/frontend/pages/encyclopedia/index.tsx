/**
 * Estate Sale Encyclopedia Index Page
 *
 * Feature #52: Public encyclopedia of estate sale knowledge
 * Users can search, filter by category, and browse articles
 */

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEncyclopediaList } from '../../hooks/useEncyclopedia';
import EncyclopediaCard from '../../components/EncyclopediaCard';
import Skeleton from '../../components/Skeleton';
import EmptyState from '../../components/EmptyState';
import { Search, ChevronRight } from 'lucide-react';

const CATEGORIES = [
  'All',
  'Art Deco',
  'MCM',
  'Americana',
  'Victorian',
  'Tools',
  'Toys',
  'Furniture',
  'Collectibles',
];

const EncyclopediaIndexPage = () => {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortBy, setSortBy] = useState<'recent' | 'popular' | 'trending'>('recent');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data, isLoading } = useEncyclopediaList(
    page,
    12,
    debouncedSearch || undefined,
    selectedCategory !== 'All' ? selectedCategory : undefined,
    sortBy
  );

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setPage(1);
  };

  const handleSortChange = (newSort: 'recent' | 'popular' | 'trending') => {
    setSortBy(newSort);
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  return (
    <>
      <Head>
        <title>Resale Encyclopedia | FindA.Sale</title>
        <meta
          name="description"
          content="Learn everything about resale events, from how to value items to finding hidden treasures. Browse our comprehensive encyclopedia of antiques, collectibles, and vintage items."
        />
      </Head>

      <div className="min-h-screen bg-white dark:bg-gray-900">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-sage-green/20 to-sage-green/5 dark:from-gray-800 dark:to-gray-900 py-16 px-4">
          <div className="max-w-6xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              📚 Resale Encyclopedia
            </h1>
            <p className="text-lg text-gray-700 dark:text-gray-300 max-w-2xl">
              Learn about antiques, collectibles, and how to find treasures at resale events. Explore guides,
              appraisals, and expert tips.
            </p>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 py-6">
            {/* Search Bar */}
            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400 dark:text-gray-600" />
                <input
                  type="text"
                  placeholder="Search encyclopedia..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-sage-green focus:border-transparent outline-none"
                />
              </div>
            </div>

            {/* Category Filter */}
            <div className="flex gap-2 flex-wrap mb-4">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => handleCategoryChange(cat)}
                  className={`px-4 py-2 rounded-full font-medium transition-colors ${
                    selectedCategory === cat
                      ? 'bg-sage-green text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Sort Options */}
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Sort by:</span>
              <div className="flex gap-2">
                {(['recent', 'popular', 'trending'] as const).map((sort) => (
                  <button
                    key={sort}
                    onClick={() => handleSortChange(sort)}
                    className={`px-3 py-1 text-sm rounded transition-colors ${
                      sortBy === sort
                        ? 'bg-sage-green/20 dark:bg-sage-green/30 text-sage-green dark:text-sage-green font-medium'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    {sort.charAt(0).toUpperCase() + sort.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto px-4 py-12">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-80" />
              ))}
            </div>
          ) : data && data.entries.length > 0 ? (
            <>
              {/* Entry Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                {data.entries.map((entry) => (
                  <EncyclopediaCard key={entry.id} entry={entry} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mb-8">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    ← Previous
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                      const pageNum = i + 1;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`px-3 py-2 rounded ${
                            page === pageNum
                              ? 'bg-sage-green text-white'
                              : 'border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    {totalPages > 5 && (
                      <span className="px-2 py-2 text-gray-600 dark:text-gray-400">
                        ... {totalPages}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Next →
                  </button>
                </div>
              )}

              {/* Stats */}
              <div className="text-center text-sm text-gray-600 dark:text-gray-400">
                Showing {(page - 1) * 12 + 1} to {Math.min(page * 12, data.total)} of {data.total} entries
              </div>
            </>
          ) : (
            <EmptyState
              heading="No articles found"
              subtext={
                searchTerm || selectedCategory !== 'All'
                  ? 'Try adjusting your search or filter criteria.'
                  : 'Check back soon for encyclopedia content.'
              }
              cta={
                searchTerm || selectedCategory !== 'All'
                  ? {
                      label: 'Clear Filters',
                      onClick: () => {
                        setSearchTerm('');
                        setSelectedCategory('All');
                      },
                    }
                  : undefined
              }
            />
          )}
        </div>

        {/* CTA Section */}
        <div className="bg-sage-green/10 dark:bg-sage-green/20 border-t border-gray-200 dark:border-gray-800 py-12 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Have knowledge to share?
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              Contribute to the encyclopedia and help other shoppers and organizers learn about resale events and
              antiques.
            </p>
            <Link
              href="/encyclopedia/contribute"
              className="inline-block px-6 py-3 bg-sage-green hover:bg-sage-green/90 text-white font-semibold rounded-lg transition-colors"
            >
              Contribute an Article
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default EncyclopediaIndexPage;
