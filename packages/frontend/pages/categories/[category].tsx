/**
 * Phase 29: Category browse page — /categories/[category]
 * Lists all available items in the given category across published sales.
 */
import React from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { SkeletonCard } from '../../components/SkeletonCards';

const CATEGORIES = [
  'furniture', 'clothing', 'electronics', 'books', 'antiques',
  'tools', 'kitchen', 'art', 'jewelry', 'other',
];

const CategoryPage = () => {
  const router = useRouter();
  const { category } = router.query as { category: string };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['category-items', category],
    queryFn: async () => {
      const res = await api.get(`/search/categories/${category}`);
      return res.data as {
        category: string;
        items: any[];
        pagination: { total: number; page: number; pages: number };
      };
    },
    enabled: !!category,
    staleTime: 60_000,
  });

  const label = category
    ? category.charAt(0).toUpperCase() + category.slice(1)
    : '...';

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
      <Head>
        <title>{label} — Browse by Category — FindA.Sale</title>
        <meta
          name="description"
          content={`Browse ${label} items from sales near you on FindA.Sale`}
        />
      </Head>

      <main className="container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-warm-400 mb-6 flex items-center gap-2">
          <Link href="/" className="hover:text-amber-600">Home</Link>
          <span>›</span>
          <span className="text-warm-900 dark:text-warm-100 font-medium">{label}</span>
        </nav>

        <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-1">{label}</h1>
        {!isLoading && data && (
          <p className="text-warm-500 dark:text-warm-400 text-sm mb-6">
            {data.pagination.total} item{data.pagination.total !== 1 ? 's' : ''} available
          </p>
        )}

        {/* Category chips */}
        <div className="flex flex-wrap gap-2 mb-8">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat}
              href={`/categories/${cat}`}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                cat === category
                  ? 'bg-amber-600 text-white'
                  : 'bg-warm-200 text-warm-700 dark:text-warm-300 hover:bg-warm-300'
              }`}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </Link>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : isError ? (
          <div className="min-h-screen flex flex-col items-center justify-center bg-warm-50 dark:bg-gray-900 gap-4">
            <p className="text-warm-700 dark:text-warm-300 text-lg">Failed to load category listings.</p>
            <button onClick={() => refetch()} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg">Try again</button>
          </div>
        ) : data && data.items.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {data.items.map((item: any) => (
              <Link
                key={item.id}
                href={`/items/${item.id}`}
                className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
              >
                {item.photoUrls?.[0] ? (
                  <img
                    src={item.photoUrls[0]}
                    alt={item.title}
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="aspect-square bg-warm-200 flex items-center justify-center">
                    <span className="text-warm-400 text-3xl">📦</span>
                  </div>
                )}
                <div className="p-3 flex-1 flex flex-col">
                  <h3 className="text-sm font-semibold text-warm-900 dark:text-warm-100 line-clamp-1 mb-1">
                    {item.title}
                  </h3>
                  {item.price != null && (
                    <p className="text-amber-600 font-bold text-sm">
                      ${Number(item.price).toFixed(2)}
                    </p>
                  )}
                  {item.sale && (
                    <p className="text-xs text-warm-500 dark:text-warm-400 mt-auto pt-1">
                      {item.sale.city}, {item.sale.state}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">📦</p>
            <h3 className="text-xl font-semibold text-warm-900 dark:text-warm-100 mb-2">No {label} items right now</h3>
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
        )}
      </main>
    </div>
  );
};

export default CategoryPage;
