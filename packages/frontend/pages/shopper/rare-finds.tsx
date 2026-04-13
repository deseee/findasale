/**
 * /shopper/rare-finds - Dedicated Rare Finds page for Hunt Pass subscribers
 *
 * Displays all rare/legendary items with full pagination and filtering
 * Hunt Pass subscription required
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import Head from 'next/head';
import Link from 'next/link';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import Skeleton from '../../components/Skeleton';

interface RareItem {
  id: string;
  saleId: string;
  title: string;
  description: string | null;
  price: number | null;
  photoUrls: string[];
  category: string | null;
  condition: string | null;
  rarity: string;
  listingType: string;
  isAiTagged: boolean;
  createdAt: string;
  sale: {
    id: string;
    title: string;
    organizer?: {
      businessName: string;
    };
  };
}

const RareFindsPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [page, setPage] = useState(0);
  const [rarity, setRarity] = useState<string>('ALL'); // ALL, RARE, ULTRA_RARE, LEGENDARY

  // Redirect if not authenticated
  if (!authLoading && !user) {
    router.push('/login?redirect=/shopper/rare-finds');
    return null;
  }

  // Check Hunt Pass
  const hasHuntPass = user?.huntPassActive;

  if (!authLoading && !hasHuntPass) {
    return (
      <>
        <Head>
          <title>Rare Finds - FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
          <div className="max-w-6xl mx-auto px-4 py-12">
            <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-6 text-center">
              Rare Finds Pass
            </h1>
            <p className="text-center text-warm-600 dark:text-warm-400 mb-8">
              This feature is exclusive to Hunt Pass subscribers. Upgrade your account to access early visibility on rare items.
            </p>
            <div className="text-center">
              <Link
                href="/shopper/hunt-pass"
                className="inline-block bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-8 rounded-lg transition-colors"
              >
                Upgrade to Hunt Pass
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Determine limit based on rarity filter
  const limit = 20;
  const offset = page * limit;
  const rarityFilter = rarity === 'ALL' ? undefined : rarity;

  const { data, isLoading } = useQuery({
    queryKey: ['rare-finds', page, rarity],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });
      if (rarityFilter) {
        params.append('rarity', rarityFilter);
      }
      const response = await api.get(`/items/rare-finds?${params.toString()}`);
      return response.data;
    },
    enabled: !!user?.id,
  });

  const items = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const rarityColor: Record<string, { bg: string; text: string; badge: string }> = {
    RARE: {
      bg: 'bg-purple-100 dark:bg-purple-900/30',
      text: 'text-purple-700 dark:text-purple-300',
      badge: '🟣 Rare (6h early access)'
    },
    ULTRA_RARE: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-700 dark:text-blue-300',
      badge: '🔵 Ultra Rare (6h early access)'
    },
    LEGENDARY: {
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
      text: 'text-yellow-700 dark:text-yellow-300',
      badge: '⭐ Legendary (12h early access)'
    }
  };

  return (
    <>
      <Head>
        <title>Rare Finds - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Link href="/shopper/dashboard" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
                Dashboard
              </Link>
              <span className="text-warm-600 dark:text-warm-400">/</span>
              <span className="text-warm-900 dark:text-warm-100 text-sm">Rare Finds</span>
            </div>
            <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">💎 Rare Finds</h1>
            <p className="text-lg text-warm-600 dark:text-warm-400">
              Exclusive to Hunt Pass subscribers — Get early access to the finest rare and legendary items before they're available to the public.
            </p>
          </div>

          {/* Rarity Filter */}
          <div className="mb-8 flex flex-wrap gap-2">
            <button
              onClick={() => { setRarity('ALL'); setPage(0); }}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                rarity === 'ALL'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 border border-warm-200 dark:border-gray-700 hover:border-purple-300'
              }`}
            >
              All Rarities ({total})
            </button>
            <button
              onClick={() => { setRarity('RARE'); setPage(0); }}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                rarity === 'RARE'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 border border-warm-200 dark:border-gray-700 hover:border-purple-300'
              }`}
            >
              🟣 Rare
            </button>
            <button
              onClick={() => { setRarity('ULTRA_RARE'); setPage(0); }}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                rarity === 'ULTRA_RARE'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 border border-warm-200 dark:border-gray-700 hover:border-blue-300'
              }`}
            >
              🔵 Ultra Rare
            </button>
            <button
              onClick={() => { setRarity('LEGENDARY'); setPage(0); }}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                rarity === 'LEGENDARY'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 border border-warm-200 dark:border-gray-700 hover:border-yellow-300'
              }`}
            >
              ⭐ Legendary
            </button>
          </div>

          {/* Items Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-12 text-center">
              <p className="text-warm-600 dark:text-warm-400 text-lg mb-4">
                No rare items available right now.
              </p>
              <p className="text-warm-500 dark:text-warm-500 mb-6">
                Check back soon for new rare finds from organizers!
              </p>
              <Link
                href="/"
                className="inline-block bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
              >
                Browse All Sales
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-12">
              {items.map((item: RareItem) => {
                const colors = rarityColor[item.rarity] || rarityColor.RARE;
                const photoUrl = item.photoUrls?.[0] || '/placeholder.png';

                return (
                  <Link
                    key={item.id}
                    href={`/item/${item.id}`}
                    className="group block rounded-lg border border-warm-200 dark:border-gray-600 overflow-hidden hover:shadow-lg hover:border-warm-300 dark:hover:border-gray-500 transition-all"
                  >
                    {/* Photo */}
                    <div className="relative bg-warm-100 dark:bg-gray-700 h-48 overflow-hidden">
                      <img
                        src={photoUrl}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      {/* Rarity Badge */}
                      <div className={`absolute top-2 right-2 ${colors.bg} ${colors.text} text-xs font-bold px-2 py-1 rounded`}>
                        {colors.badge}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-3">
                      <h3 className="font-semibold text-warm-900 dark:text-warm-100 line-clamp-2 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors text-sm">
                        {item.title}
                      </h3>
                      <p className="text-xs text-warm-600 dark:text-warm-400 truncate mb-2">
                        {item.sale?.organizer?.businessName || item.sale?.title}
                      </p>
                      {item.price && (
                        <p className="text-sm font-bold text-warm-900 dark:text-warm-100">
                          ${item.price.toFixed(2)}
                        </p>
                      )}
                      {item.condition && (
                        <p className="text-xs text-warm-500 dark:text-warm-500 mt-1 capitalize">
                          {item.condition}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {!isLoading && totalPages > 1 && (
            <div className="flex justify-center gap-2 mb-8">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-4 py-2 bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:border-warm-300 dark:hover:border-gray-600 transition-colors"
              >
                Previous
              </button>
              <div className="flex items-center gap-2">
                <span className="text-warm-900 dark:text-warm-100 font-semibold">
                  Page {page + 1} of {totalPages}
                </span>
              </div>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="px-4 py-2 bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:border-warm-300 dark:hover:border-gray-600 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default RareFindsPage;
