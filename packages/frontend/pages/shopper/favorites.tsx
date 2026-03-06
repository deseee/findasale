/**
 * Shopper Favorites Page — Sprint T3
 * Lists all favorited items with category tab filter.
 * Route: /shopper/favorites
 */

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import Layout from '../../components/Layout';
import { ItemCardSkeleton } from '../../components/SkeletonCards';
import EmptyState from '../../components/EmptyState';

interface FavoriteItem {
  id: string;
  title: string;
  price: number | null;
  status: string;
  category: string | null;
  condition: string | null;
  photoUrls: string[];
  sale: {
    id: string;
    title: string;
    startDate: string;
    endDate: string;
    status: string;
    organizer: { id: string; businessName: string };
  };
}

const ALL_CATEGORY = '__all__';

const CATEGORY_LABELS: Record<string, string> = {
  furniture: 'Furniture',
  decor: 'Décor',
  vintage: 'Vintage',
  textiles: 'Textiles',
  collectibles: 'Collectibles',
  art: 'Art',
  antiques: 'Antiques',
  jewelry: 'Jewelry',
  books: 'Books',
  tools: 'Tools',
  electronics: 'Electronics',
  clothing: 'Clothing',
  home: 'Home',
  other: 'Other',
};

const FavoritesPage = () => {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORY);

  if (!authLoading && !user) {
    router.push('/login');
    return null;
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['favorites', activeCategory],
    queryFn: async () => {
      const params = activeCategory !== ALL_CATEGORY ? `?category=${activeCategory}` : '';
      const res = await api.get(`/favorites${params}`);
      return res.data as { favorites: FavoriteItem[]; categories: string[]; total: number };
    },
    enabled: !!user,
  });

  // Fetch all categories once for the tab bar (no filter)
  const { data: allData } = useQuery({
    queryKey: ['favorites', ALL_CATEGORY],
    queryFn: async () => {
      const res = await api.get('/favorites');
      return res.data as { favorites: FavoriteItem[]; categories: string[]; total: number };
    },
    enabled: !!user,
    staleTime: 30000,
  });

  const categories = allData?.categories ?? [];
  const items = data?.favorites ?? [];

  return (
    <Layout>
      <Head>
        <title>My Favorites – FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50">
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-24">

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <Link href="/shopper/dashboard" className="text-warm-500 hover:text-warm-700">
              ←
            </Link>
            <h1 className="text-2xl font-bold text-warm-900">My Favorites</h1>
            {data && (
              <span className="ml-auto text-sm text-warm-500">
                {data.total} item{data.total !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Category tabs */}
          {categories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-3 mb-5 scrollbar-hide">
              <button
                onClick={() => setActiveCategory(ALL_CATEGORY)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeCategory === ALL_CATEGORY
                    ? 'bg-amber-600 text-white'
                    : 'bg-white text-warm-700 border border-warm-200 hover:bg-warm-100'
                }`}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    activeCategory === cat
                      ? 'bg-amber-600 text-white'
                      : 'bg-white text-warm-700 border border-warm-200 hover:bg-warm-100'
                  }`}
                >
                  {CATEGORY_LABELS[cat] ?? cat}
                </button>
              ))}
            </div>
          )}

          {/* Loading */}
          {(isLoading || authLoading) && (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <ItemCardSkeleton key={i} />)}
            </div>
          )}

          {/* Error */}
          {isError && (
            <div className="text-center py-12 text-warm-500">
              <p className="text-4xl mb-3">⚠️</p>
              <p>Failed to load favorites. Please try again.</p>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !isError && items.length === 0 && (
            <>
              {activeCategory !== ALL_CATEGORY ? (
                <div className="text-center py-16">
                  <p className="text-5xl mb-4">🏷️</p>
                  <h2 className="text-xl font-semibold text-warm-900 mb-4">
                    No {CATEGORY_LABELS[activeCategory] ?? activeCategory} favorites yet
                  </h2>
                  <button
                    onClick={() => setActiveCategory(ALL_CATEGORY)}
                    className="text-amber-600 hover:underline text-sm font-medium"
                  >
                    View all favorites
                  </button>
                </div>
              ) : (
                <EmptyState
                  icon="❤️"
                  heading="No favorites yet"
                  subtext="Start saving items you love! Tap the heart on any item to add it to your favorites."
                  cta={{ label: 'Browse Sales', href: '/' }}
                />
              )}
            </>
          )}

          {/* Item list */}
          {!isLoading && !isError && items.length > 0 && (
            <div className="space-y-4">
              {items.map(item => (
                <div key={item.id} className="card overflow-hidden">
                  <Link href={`/items/${item.id}`} className="block">
                    <div className="flex gap-3 p-3">
                      {item.photoUrls?.[0] ? (
                        <img
                          src={item.photoUrls[0]}
                          alt={item.title}
                          className="w-20 h-20 object-cover rounded-lg flex-shrink-0 bg-warm-100"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-lg bg-warm-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-2xl">🏷️</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-warm-900 truncate">{item.title}</p>
                        {item.price != null && (
                          <p className="text-amber-700 font-bold">${item.price.toFixed(2)}</p>
                        )}
                        <p className="text-warm-500 text-xs mt-0.5 truncate">
                          {item.sale.organizer.businessName} · {item.sale.title}
                        </p>
                        <div className="flex gap-2 mt-1.5">
                          {item.category && (
                            <span className="text-xs bg-warm-100 text-warm-600 px-2 py-0.5 rounded-full">
                              {CATEGORY_LABELS[item.category] ?? item.category}
                            </span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            item.status === 'AVAILABLE'
                              ? 'bg-green-50 text-green-700'
                              : item.status === 'SOLD'
                              ? 'bg-red-50 text-red-600'
                              : 'bg-warm-100 text-warm-600'
                          }`}>
                            {item.status === 'AVAILABLE' ? 'Available' : item.status === 'SOLD' ? 'Sold' : item.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default FavoritesPage;
