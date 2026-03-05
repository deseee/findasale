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

const CATEGORIES = [
  'furniture', 'clothing', 'electronics', 'books', 'antiques',
  'tools', 'kitchen', 'art', 'jewelry', 'other',
];

const CategoryPage = () => {
  const router = useRouter();
  const { category } = router.query as { category: string };

  const { data, isLoading } = useQuery({
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
    <div className="min-h-screen bg-warm-50">
      <Head>
        <title>{label} \u2014 Browse by Category \u2014 FindA.Sale</title>
        <meta
          name="description"
          content={`Browse ${label} items at estate sales near you on FindA.Sale`}
        />
      </Head>

      <main className="container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-warm-400 mb-6 flex items-center gap-2">
          <Link href="/" className="hover:text-amber-600">Home</Link>
          <span>\u203a</span>
          <span className="text-warm-900 font-medium">{label}</span>
        </nav>

        <h1 className="text-3xl font-bold text-warm-900 mb-1">{label}</h1>
        {!isLoading && data && (
          <p className="text-warm-500 text-sm mb-6">
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
                  : 'bg-warm-200 text-warm-700 hover:bg-warm-300'
              }`}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </Link>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white rounded-lg overflow-hidden animate-pulse">
                <div className="aspect-square bg-warm-200" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-warm-200 rounded w-3/4" />
                  <div className="h-3 bg-warm-200 rounded w-1/2" />
                  <div className="h-3 bg-warm-200 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : data && data.items.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {data.items.map((item: any) => (
              <Link
                key={item.id}
                href={`/items/${item.id}`}
                className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
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
                    <span className="text-warm-400 text-3xl">\uD83D\uDCE6</span>
                  </div>
                )}
                <div className="p-3 flex-1 flex flex-col">
                  <h3 className="text-sm font-semibold text-warm-900 line-clamp-1 mb-1">
                    {item.title}
                  </h3>
                  {item.price != null && (
                    <p className="text-amber-600 font-bold text-sm">
                      ${Number(item.price).toFixed(2)}
                    </p>
                  )}
                  {item.sale && (
                    <p className="text-xs text-warm-500 mt-auto pt-1">
                      {item.sale.city}, {item.sale.state}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">\uD83D\uDCE6</p>
            <h3 className="text-xl font-semibold text-warm-900 mb-2">No {label} items right now</h3>
            <p className="text-warm-600 mb-6">
              Check back soon \u2014 new sales go live every week.
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
