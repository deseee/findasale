/**
 * /shopper/early-access-cache/items - Early Access Items Grid
 *
 * Displays items matching user's active early access windows.
 * Fetches from GET /api/early-access-cache/items
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../../components/AuthContext';
import api from '../../../lib/api';

interface Item {
  id: string;
  title: string;
  price: number;
  photoUrls: string[];
  saleId: string;
  category: string;
  createdAt: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  FURNITURE: '🛋️',
  VINTAGE_COLLECTIBLES: '🏛️',
  ART_FRAMES: '🖼️',
  JEWELRY_WATCHES: '✨',
  BOOKS_MEDIA: '📚',
  KITCHENWARE: '🍳',
  FASHION: '👗',
  SPORTS_OUTDOOR: '⛺',
};

const EarlyAccessItemsPage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch items from early access cache
  useEffect(() => {
    if (!user) return;

    const fetchItems = async () => {
      try {
        const { data } = await api.get('/early-access-cache/items');
        setItems(data);
        setIsLoadingItems(false);
      } catch (err) {
        console.error('Failed to fetch early access items:', err);
        setError('Failed to load early access items. Please try again.');
        setIsLoadingItems(false);
      }
    };

    fetchItems();
  }, [user]);

  if (isLoading || isLoadingItems) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-warm-600 dark:text-warm-400">Loading items...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center">
        <button
          onClick={() => router.push('/login?redirect=/shopper/early-access-cache/items')}
          className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
        >
          Sign in to explore
        </button>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Early Access Items — FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 py-12">
          {/* Back Link */}
          <div className="mb-8">
            <button
              onClick={() => router.push('/shopper/early-access-cache')}
              className="text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-semibold flex items-center gap-2"
            >
              <span>←</span> Back to Early Access Cache
            </button>
          </div>

          {/* Header */}
          <div className="mb-12">
            <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">
              Early Access Items
            </h1>
            <p className="text-lg text-warm-600 dark:text-warm-400">
              New items from your active early access windows
            </p>
          </div>

          {/* Error State */}
          {error && (
            <div className="mb-8 p-4 bg-red-100 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-700">
              <p className="text-red-900 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Empty State */}
          {items.length === 0 && !error && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-12 text-center border border-warm-200 dark:border-gray-700">
              <div className="text-5xl mb-4">🔑</div>
              <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-2">
                No early access items available yet
              </h2>
              <p className="text-warm-600 dark:text-warm-400 max-w-md mx-auto">
                New items matching your active categories will appear here. Activate an early access window to get started.
              </p>
              <button
                onClick={() => router.push('/shopper/early-access-cache')}
                className="mt-6 px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold"
              >
                Activate Early Access
              </button>
            </div>
          )}

          {/* Items Grid */}
          {items.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {items.map((item) => (
                <Link
                  key={item.id}
                  href={`/items/${item.id}`}
                >
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow cursor-pointer border border-warm-200 dark:border-gray-700">
                    {/* Photo */}
                    <div className="aspect-square bg-warm-100 dark:bg-gray-700 overflow-hidden relative">
                      {item.photoUrls && item.photoUrls.length > 0 ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.photoUrls[0]}
                          alt={item.title}
                          className="w-full h-full object-cover hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-warm-400 dark:text-gray-600">
                          <span className="text-4xl">📷</span>
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="p-4">
                      {/* Category Badge */}
                      {item.category && (
                        <div className="mb-2 flex items-center gap-1 text-xs">
                          <span>{CATEGORY_ICONS[item.category] || '📦'}</span>
                          <span className="text-warm-600 dark:text-warm-400 font-semibold">
                            {item.category.replace(/_/g, ' ')}
                          </span>
                        </div>
                      )}

                      {/* Title */}
                      <h3 className="text-sm font-semibold text-warm-900 dark:text-warm-100 mb-2 line-clamp-2">
                        {item.title}
                      </h3>

                      {/* Price */}
                      <div className="text-lg font-bold text-purple-600 dark:text-purple-300 mb-3">
                        ${item.price.toFixed(2)}
                      </div>

                      {/* View Button */}
                      <button className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-sm transition-colors">
                        View Item
                      </button>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default EarlyAccessItemsPage;
