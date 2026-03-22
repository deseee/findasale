/**
 * Feature #4: Category listing page — /categories
 * Displays all available item categories with counts, linking to /categories/[category].
 */
import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';

const CATEGORY_ICONS: Record<string, string> = {
  furniture: '🪑',
  decor: '🏺',
  vintage: '🕰️',
  textiles: '🧵',
  collectibles: '🏆',
  art: '🎨',
  antiques: '⚱️',
  jewelry: '💎',
  books: '📚',
  tools: '🔧',
  electronics: '💻',
  clothing: '👗',
  home: '🏠',
  other: '📦',
};

const CategoriesIndexPage = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['item-categories'],
    queryFn: async () => {
      const res = await api.get('/items/categories');
      return res.data as { categories: Record<string, number> };
    },
    staleTime: 5 * 60_000,
  });

  // Sort by count descending so most-stocked categories appear first
  const entries: [string, number][] = data
    ? Object.entries(data.categories).sort(([, a], [, b]) => b - a)
    : [];

  return (
    <>
      <Head>
        <title>Browse by Category — FindA.Sale</title>
        <meta
          name="description"
          content="Browse estate sale items by category on FindA.Sale. Furniture, antiques, jewelry, tools, and more."
        />
      </Head>

      <main className="container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-warm-400 mb-6 flex items-center gap-2">
          <Link href="/" className="hover:text-amber-600">
            Home
          </Link>
          <span>›</span>
          <span className="text-warm-900 dark:text-warm-100 font-medium">Categories</span>
        </nav>

        <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Browse by Category</h1>
        <p className="text-warm-500 dark:text-warm-400 mb-8">
          Find what you're looking for across all active sales.
        </p>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-6 animate-pulse">
                <div className="w-10 h-10 bg-warm-200 rounded-full mb-3" />
                <div className="h-4 bg-warm-200 rounded w-2/3 mb-2" />
                <div className="h-3 bg-warm-200 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">😕</p>
            <p className="text-warm-700 dark:text-warm-300 text-lg mb-4">Failed to load categories.</p>
            <Link
              href="/"
              className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
            >
              Browse All Sales
            </Link>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">📦</p>
            <h3 className="text-xl font-semibold text-warm-900 dark:text-warm-100 mb-2">No items listed yet</h3>
            <p className="text-warm-600 dark:text-warm-400 mb-6">
              Check back soon — new sales go live every week.
            </p>
            <Link
              href="/"
              className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
            >
              Browse All Sales
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {entries.map(([cat, count]) => {
              const label = cat.charAt(0).toUpperCase() + cat.slice(1);
              const icon = CATEGORY_ICONS[cat] ?? '📦';
              return (
                <Link
                  key={cat}
                  href={`/categories/${cat}`}
                  className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col items-start gap-2 border border-warm-100 hover:border-amber-200"
                >
                  <span className="text-3xl" role="img" aria-label={label}>
                    {icon}
                  </span>
                  <span className="font-semibold text-warm-900 dark:text-warm-100 text-base">{label}</span>
                  <span className="text-sm text-warm-500 dark:text-warm-400">
                    {count.toLocaleString()} item{count !== 1 ? 's' : ''}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
};

export default CategoriesIndexPage;
