/**
 * Feature #10: Serendipity Search — /surprise-me
 * "Surprise me" — returns random available items from active sales.
 * Supports optional price cap and category filter via dropdowns.
 */
import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

const CATEGORIES = [
  'furniture', 'decor', 'vintage', 'textiles', 'collectibles',
  'art', 'antiques', 'jewelry', 'books', 'tools', 'electronics',
  'clothing', 'home', 'other',
];

const PRICE_OPTIONS = [
  { label: 'Any price', value: '' },
  { label: 'Under $10', value: '10' },
  { label: 'Under $25', value: '25' },
  { label: 'Under $50', value: '50' },
  { label: 'Under $100', value: '100' },
  { label: 'Under $250', value: '250' },
];

interface SerendipityItem {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  photoUrls: string[];
  category: string | null;
  condition: string | null;
  sale: {
    id: string;
    title: string;
    city: string;
    state: string;
    startDate: string;
    endDate: string;
  };
}

interface SerendipityResponse {
  items: SerendipityItem[];
  count: number;
}

const formatPrice = (price: number | null) =>
  price != null
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price)
    : 'Price TBD';

const SurpriseMePage = () => {
  const [maxPrice, setMaxPrice] = useState('');
  const [category, setCategory] = useState('');
  const [seed, setSeed] = useState(0); // bumping this triggers a re-fetch for new random results

  const { data, isLoading, isError, isFetching } = useQuery<SerendipityResponse>({
    queryKey: ['serendipity', maxPrice, category, seed],
    queryFn: async () => {
      const params: Record<string, string> = { limit: '12' };
      if (maxPrice) params.maxPrice = maxPrice;
      if (category) params.category = category;
      const res = await api.get('/search/random', { params });
      return res.data as SerendipityResponse;
    },
    staleTime: 0, // always fresh — serendipity means new results each time
  });

  const handleSurpriseMe = () => setSeed((s) => s + 1);

  const items = data?.items ?? [];

  return (
    <>
      <Head>
        <title>Surprise Me — FindA.Sale</title>
        <meta
          name="description"
          content="Discover random treasures from active estate sales near you. Hit 'Surprise me' to see what turns up."
        />
      </Head>

      <main className="container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-warm-400 mb-6 flex items-center gap-2">
          <Link href="/" className="hover:text-amber-600">
            Home
          </Link>
          <span>›</span>
          <span className="text-warm-900 dark:text-warm-100 font-medium">Surprise Me</span>
        </nav>

        {/* Hero */}
        <div className="text-center mb-8">
          <p className="text-5xl mb-3">🎲</p>
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Surprise Me</h1>
          <p className="text-warm-500 dark:text-warm-400 max-w-md mx-auto">
            Discover random treasures from active sales near you. You never know what you'll find.
          </p>
        </div>

        {/* Filters + button */}
        <div className="flex flex-wrap items-end justify-center gap-3 mb-8">
          {/* Price cap */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-warm-500 dark:text-warm-400 font-medium uppercase tracking-wide">
              Max price
            </label>
            <select
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="border border-warm-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-warm-800 dark:text-warm-200 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-500"
            >
              {PRICE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-warm-500 dark:text-warm-400 font-medium uppercase tracking-wide">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="border border-warm-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-warm-800 dark:text-warm-200 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-500"
            >
              <option value="">Any category</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Button */}
          <button
            onClick={handleSurpriseMe}
            disabled={isFetching}
            className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-bold py-2 px-6 rounded-lg transition-colors flex items-center gap-2 text-sm"
          >
            {isFetching ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Shuffling…
              </>
            ) : (
              <>🎲 Surprise me!</>
            )}
          </button>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm animate-pulse border border-warm-100 dark:border-gray-700">
                <div className="aspect-square bg-warm-200 dark:bg-gray-700" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-warm-200 dark:bg-gray-700 rounded w-3/4" />
                  <div className="h-3 bg-warm-200 dark:bg-gray-700 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">😕</p>
            <p className="text-warm-700 dark:text-warm-300 text-lg mb-4">Something went wrong. Try again.</p>
            <button
              onClick={handleSurpriseMe}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
            >
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">🔍</p>
            <h3 className="text-xl font-semibold text-warm-900 dark:text-warm-100 mb-2">No items found</h3>
            <p className="text-warm-600 dark:text-warm-400 mb-6">
              Try a different price range or category, or check back when more sales go live.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => { setMaxPrice(''); setCategory(''); handleSurpriseMe(); }}
                className="bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-200 font-semibold py-2 px-5 rounded-lg transition-colors text-sm border border-warm-200 dark:border-gray-600"
              >
                Clear filters
              </button>
              <Link
                href="/"
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-5 rounded-lg transition-colors text-sm"
              >
                Browse All Sales
              </Link>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-warm-500 dark:text-warm-400 text-center mb-5">
              Showing {items.length} random item{items.length !== 1 ? 's' : ''} from active sales
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {items.map((item) => (
                <Link
                  key={item.id}
                  href={`/items/${item.id}`}
                  className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-warm-100 dark:border-gray-700 hover:border-amber-200 dark:hover:border-amber-700 group"
                >
                  {/* Photo */}
                  <div className="aspect-square relative bg-warm-100 dark:bg-gray-700 overflow-hidden border-b border-warm-100 dark:border-gray-700">
                    {item.photoUrls?.[0] ? (
                      <Image
                        src={item.photoUrls[0]}
                        alt={item.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl text-warm-300">
                        📦
                      </div>
                    )}
                    {item.category && (
                      <span className="absolute bottom-2 left-2 bg-black/50 text-white text-xs rounded px-2 py-0.5 capitalize">
                        {item.category}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <h3 className="text-sm font-semibold text-warm-900 dark:text-warm-100 line-clamp-2 mb-1 group-hover:text-amber-700">
                      {item.title}
                    </h3>
                    <p className="text-amber-600 font-bold text-sm mb-1">
                      {formatPrice(item.price)}
                    </p>
                    <p className="text-xs text-warm-500 dark:text-warm-400 truncate">
                      {item.sale.city}, {item.sale.state}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            {/* Shuffle again */}
            <div className="text-center mt-10">
              <button
                onClick={handleSurpriseMe}
                disabled={isFetching}
                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-bold py-3 px-8 rounded-xl transition-colors text-base"
              >
                🎲 Show me more
              </button>
            </div>
          </>
        )}
      </main>
    </>
  );
};

export default SurpriseMePage;
