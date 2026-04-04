/**
 * RareFindsFeed — Hunt Pass exclusive rare items section
 *
 * Displays 4 most recent rare/legendary items from active sales
 * Only visible to Hunt Pass subscribers
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import api from '../lib/api';
import Skeleton from './Skeleton';

interface RareItem {
  id: string;
  saleId: string;
  title: string;
  price: number | null;
  photoUrls: string[];
  rarity: string;
  sale: {
    id: string;
    title: string;
    organizer?: {
      businessName: string;
    };
  };
}

const RareFindsFeed = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['rare-finds'],
    queryFn: async () => {
      const response = await api.get('/items/rare-finds?limit=4&offset=0');
      return response.data;
    },
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">💎 Rare Finds</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data || data.data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">💎 Rare Finds</h2>
        <p className="text-warm-600 dark:text-warm-400 text-center py-8">
          No rare items available right now. Check back soon!
        </p>
      </div>
    );
  }

  const rarityColor: Record<string, { bg: string; text: string; badge: string }> = {
    RARE: {
      bg: 'bg-purple-100 dark:bg-purple-900/30',
      text: 'text-purple-700 dark:text-purple-300',
      badge: '🟣 Rare'
    },
    ULTRA_RARE: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-700 dark:text-blue-300',
      badge: '🔵 Ultra Rare'
    },
    LEGENDARY: {
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
      text: 'text-yellow-700 dark:text-yellow-300',
      badge: '⭐ Legendary'
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100">💎 Rare Finds</h2>
        <Link
          href="/shopper/rare-finds"
          className="text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-semibold"
        >
          See All →
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {data.data.map((item: RareItem) => {
          const colors = rarityColor[item.rarity] || rarityColor.RARE;
          const photoUrl = item.photoUrls?.[0] || '/placeholder.png';

          return (
            <Link
              key={item.id}
              href={`/item/${item.id}`}
              className="group block rounded-lg border border-warm-200 dark:border-gray-600 overflow-hidden hover:shadow-lg hover:border-warm-300 dark:hover:border-gray-500 transition-all"
            >
              {/* Photo */}
              <div className="relative bg-warm-100 dark:bg-gray-700 h-40 overflow-hidden">
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
                <h3 className="font-semibold text-warm-900 dark:text-warm-100 truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
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
              </div>
            </Link>
          );
        })}
      </div>

      {data.hasMore && (
        <div className="mt-4 text-center">
          <Link
            href="/shopper/rare-finds"
            className="inline-block text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-semibold underline"
          >
            View All Rare Finds →
          </Link>
        </div>
      )}
    </div>
  );
};

export default RareFindsFeed;
